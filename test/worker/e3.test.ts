import 'dotenv/config';
import { encrypt } from '@/lib/encryption';
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { SegmentationService, SegmentRuleGroup } from '@/lib/email/segmentation';
import { runCampaignTick } from '@/worker/campaignRunner';
import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult } from '@/lib/email/types';

const createdTenantIds: string[] = [];

async function createTenant() {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: `E3 Test ${uid}`,
      slug: `e3-test-${uid}`,
      status: 'ACTIVE',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });
  createdTenantIds.push(tenant.id);

  await prisma.tenantEmailConfig.create({
    data: {
      tenantId: tenant.id,
      provider: 'RESEND',
      encryptedApiKey: encrypt('test_key'),
      fromName: 'E3 Sender',
      fromEmail: 'e3@example.com',
      hourlySendRate: 1000,
      dailySendQuota: 1000,
    },
  });

  await prisma.tenantSendingDomain.create({
    data: {
      tenantId: tenant.id,
      domain: 'example.com',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  });

  const template = await prisma.template.create({
    data: {
      tenantId: tenant.id,
      name: `Tpl ${uid}`,
      channel: 'EMAIL',
      category: 'MARKETING',
      subject: 'Segment Test {{first_name}}',
      htmlBody: '<p>Hi {{first_name}}</p>',
      body: 'Hi {{first_name}}',
      content: 'Hi {{first_name}}',
      status: 'APPROVED',
    },
  });

  return { tenant, template };
}

function makeFakeAdapter(): { adapter: IEmailProviderAdapter; calls: OutboundEmail[] } {
  const calls: OutboundEmail[] = [];
  const adapter: IEmailProviderAdapter = {
    providerName: 'FAKE',
    async send(email: OutboundEmail, _creds: EmailProviderCredentials): Promise<EmailSendResult> {
      calls.push(email);
      return {
        messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        status: 'SENT',
        httpStatus: 200,
        retryable: false,
      };
    },
  };
  return { adapter, calls };
}

describe('Step E3: Segments & Live Rule Tree Targeting', () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      const ids = createdTenantIds.splice(0, createdTenantIds.length);
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('1. Saved segment compiles AND/OR rule tree over tags, lists, custom fields, and consent with accurate live count', async () => {
    const { tenant } = await createTenant();

    const listA = await prisma.contactList.create({
      data: { tenantId: tenant.id, name: 'List Alpha' },
    });
    const listB = await prisma.contactList.create({
      data: { tenantId: tenant.id, name: 'List Beta' },
    });

    // Customer 1: Tag VIP, In List A, plan=PRO, consent SUBSCRIBED
    const c1 = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Alice VIP',
        email: 'alice@example.com',
        primaryPhone: '+15550010001',
        tags: ['VIP'],
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
        customFields: { plan: 'PRO', score: 85 },
      },
    });
    await prisma.contactListMember.create({
      data: { tenantId: tenant.id, listId: listA.id, customerId: c1.id },
    });

    // Customer 2: Tag LEAD, In List A, plan=FREE, consent SUBSCRIBED
    const c2 = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Bob Lead',
        email: 'bob@example.com',
        primaryPhone: '+15550010002',
        tags: ['LEAD'],
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
        customFields: { plan: 'FREE', score: 40 },
      },
    });
    await prisma.contactListMember.create({
      data: { tenantId: tenant.id, listId: listA.id, customerId: c2.id },
    });

    // Customer 3: Tag VIP, In List B, plan=PRO, consent PENDING (not subscribed)
    const c3 = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Charlie Pending',
        email: 'charlie@example.com',
        primaryPhone: '+15550010003',
        tags: ['VIP'],
        optedIn: false,
        emailConsentStatus: 'PENDING',
        customFields: { plan: 'PRO', score: 95 },
      },
    });
    await prisma.contactListMember.create({
      data: { tenantId: tenant.id, listId: listB.id, customerId: c3.id },
    });

    // Customer 4: Tag VIP, No list, plan=ENTERPRISE, consent SUBSCRIBED
    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Dana Enterprise',
        email: 'dana@example.com',
        primaryPhone: '+15550010004',
        tags: ['VIP'],
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
        customFields: { plan: 'ENTERPRISE', score: 100 },
      },
    });

    // Rule 1: AND condition: tag VIP AND in listA -> exactly Customer 1
    const rulesAnd: SegmentRuleGroup = {
      condition: 'AND',
      rules: [
        { field: 'tag', operator: 'equals', value: 'VIP' },
        { field: 'list', operator: 'in', value: listA.id },
      ],
    };

    const countAnd = await SegmentationService.countSegmentAudience(tenant.id, rulesAnd, 'EMAIL', prisma);
    assert.equal(countAnd.audienceCount, 1);

    // Rule 2: OR condition: tag LEAD OR custom_field.plan = 'ENTERPRISE' -> Customer 2 and Customer 4
    const rulesOr: SegmentRuleGroup = {
      condition: 'OR',
      rules: [
        { field: 'tag', operator: 'equals', value: 'LEAD' },
        { field: 'custom_field', key: 'plan', operator: 'equals', value: 'ENTERPRISE' },
      ],
    };

    const countOr = await SegmentationService.countSegmentAudience(tenant.id, rulesOr, 'EMAIL', prisma);
    assert.equal(countOr.audienceCount, 2);

    // Save as persistent Segment model
    const savedSegment = await prisma.segment.create({
      data: {
        tenantId: tenant.id,
        name: 'VIP List A Members',
        rules: rulesAnd as any,
      },
    });

    const liveCount = await SegmentationService.countSegmentAudience(
      tenant.id,
      savedSegment.rules as unknown as SegmentRuleGroup,
      'EMAIL',
      prisma
    );
    assert.equal(liveCount.audienceCount, 1);
  });

  it('2. Activity rules evaluate emailEvents correctly (OPENED_LAST_N_DAYS and NEVER_OPENED)', async () => {
    const { tenant } = await createTenant();

    const activeUser = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Active Opener',
        email: 'opener@example.com',
        primaryPhone: '+15550020001',
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    const inactiveUser = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Cold Contact',
        email: 'cold@example.com',
        primaryPhone: '+15550020002',
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    // Record an OPEN event for activeUser 2 days ago
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    await prisma.emailEvent.create({
      data: {
        tenantId: tenant.id,
        customerId: activeUser.id,
        email: activeUser.email!,
        eventType: 'OPEN',
        createdAt: twoDaysAgo,
      },
    });

    // Rule A: Opened in last 7 days -> matches activeUser
    const openedRule: SegmentRuleGroup = {
      condition: 'AND',
      rules: [
        { field: 'activity', activityType: 'OPENED_LAST_N_DAYS', days: 7 },
      ],
    };
    const openedCount = await SegmentationService.countSegmentAudience(tenant.id, openedRule, 'EMAIL', prisma);
    assert.equal(openedCount.audienceCount, 1);

    // Rule B: Never opened -> matches inactiveUser
    const neverOpenedRule: SegmentRuleGroup = {
      condition: 'AND',
      rules: [
        { field: 'activity', activityType: 'NEVER_OPENED' },
      ],
    };
    const neverOpenedCount = await SegmentationService.countSegmentAudience(tenant.id, neverOpenedRule, 'EMAIL', prisma);
    assert.equal(neverOpenedCount.audienceCount, 1);
  });

  it('3. A campaign referencing a segmentId dispatches exclusively to contacts matching the segment', async () => {
    const { tenant, template } = await createTenant();

    const listTarget = await prisma.contactList.create({
      data: { tenantId: tenant.id, name: 'Target List' },
    });

    // 3 Target Contacts in listTarget
    for (let i = 0; i < 3; i++) {
      const c = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          displayName: `Target User ${i}`,
          email: `target${i}@example.com`,
          primaryPhone: `+1555003000${i}`,
          tags: ['TARGET_GROUP'],
          optedIn: true,
          emailConsentStatus: 'SUBSCRIBED',
        },
      });
      await prisma.contactListMember.create({
        data: { tenantId: tenant.id, listId: listTarget.id, customerId: c.id },
      });
    }

    // 2 Non-target Contacts (different tag, not in list)
    for (let i = 0; i < 2; i++) {
      await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          displayName: `Other User ${i}`,
          email: `other${i}@example.com`,
          primaryPhone: `+1555004000${i}`,
          tags: ['OTHER'],
          optedIn: true,
          emailConsentStatus: 'SUBSCRIBED',
        },
      });
    }

    // Create saved segment targeting: tags contains TARGET_GROUP AND in listTarget
    const segment = await prisma.segment.create({
      data: {
        tenantId: tenant.id,
        name: 'Target Group Segment',
        rules: {
          condition: 'AND',
          rules: [
            { field: 'tag', operator: 'equals', value: 'TARGET_GROUP' },
            { field: 'list', operator: 'in', value: listTarget.id },
          ],
        },
      },
    });

    const now = new Date();
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Segment Targeted Campaign',
        channel: 'EMAIL',
        templateId: template.id,
        segmentId: segment.id,
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();

    // Run campaign tick
    await runCampaignTick({
      workerId: 'worker_e3',
      perLoopCap: 50,
      now: () => now,
      emailDeps: { adapterOverride: fake.adapter },
    });

    // Check audience build
    const updatedCamp = await prisma.broadcastCampaign.findUnique({
      where: { id: campaign.id },
    });
    assert.equal(updatedCamp?.totalRecipients, 3);
    assert.equal(fake.calls.length, 3);

    const recipients = fake.calls.map((c) => c.to).sort();
    assert.deepEqual(recipients, [
      'target0@example.com',
      'target1@example.com',
      'target2@example.com',
    ]);
  });

  it('4. Segment deletion cascades safely (campaign segmentId set to null, history preserved)', async () => {
    const { tenant, template } = await createTenant();

    const segment = await prisma.segment.create({
      data: {
        tenantId: tenant.id,
        name: 'Temporary Segment',
        rules: { condition: 'AND', rules: [] },
      },
    });

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Campaign With Segment',
        channel: 'EMAIL',
        templateId: template.id,
        segmentId: segment.id,
        status: 'DRAFT',
      },
    });

    // Delete the segment
    await prisma.segment.delete({
      where: { id: segment.id },
    });

    // Campaign must still exist with segmentId set to null
    const afterDeleteCamp = await prisma.broadcastCampaign.findUnique({
      where: { id: campaign.id },
    });
    assert.ok(afterDeleteCamp);
    assert.equal(afterDeleteCamp.segmentId, null);
  });
});
