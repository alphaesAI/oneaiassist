import 'dotenv/config';
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { EmailTemplateEngine } from '@/lib/email/templateEngine';
import { EmailSuppressionService } from '@/lib/email/suppression';
import { CampaignService } from '@/lib/email/campaignService';
import { TestSendService } from '@/lib/email/testSendService';
import { encrypt } from '@/lib/encryption';
import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult } from '@/lib/email/types';

const createdTenantIds: string[] = [];

async function createTenantBase(namePrefix = 'E6 Test') {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: `${namePrefix} ${uid}`,
      slug: `e6-test-${uid}`,
      status: 'ACTIVE',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
      postalAddress: '100 Enterprise Blvd, Suite 500, Austin, TX 78701',
    },
  });
  createdTenantIds.push(tenant.id);
  return tenant;
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

describe('Step E6: Campaign Flow, Live Progress, Pre-Send Checklist & Delete Route', () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      const ids = createdTenantIds.splice(0, createdTenantIds.length);
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('1. DELETE /api/dashboard/broadcast/[id] cascades to broadcast jobs and removes campaign (ENG-10)', async () => {
    const tenant = await createTenantBase();

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'E6 Delete Test Campaign',
        channel: 'EMAIL',
        status: 'QUEUED',
      },
    });

    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Delete Recipient',
        primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: 'delete.test@example.com',
      },
    });

    await prisma.broadcastJob.create({
      data: {
        tenantId: tenant.id,
        campaignId: campaign.id,
        customerId: customer.id,
        recipient: 'delete.test@example.com',
        channel: 'EMAIL',
        status: 'PENDING',
        scheduledFor: new Date(),
      },
    });

    // Verify job and campaign exist
    const initialJobs = await prisma.broadcastJob.findMany({ where: { campaignId: campaign.id, tenantId: tenant.id } });
    assert.equal(initialJobs.length, 1);

    // Call CampaignService.deleteCampaign
    const res = await CampaignService.deleteCampaign(tenant.id, campaign.id);
    assert.equal(res.status, 200);
    assert.equal(res.success, true);
    assert.equal(res.deletedId, campaign.id);

    // Verify campaign and its jobs are completely removed
    const foundCampaign = await prisma.broadcastCampaign.findUnique({ where: { id: campaign.id } });
    assert.equal(foundCampaign, null);

    const remainingJobs = await prisma.broadcastJob.findMany({ where: { campaignId: campaign.id } });
    assert.equal(remainingJobs.length, 0);
  });

  it('2. DELETE /api/dashboard/broadcast/[id] respects multi-tenant isolation', async () => {
    const tenantA = await createTenantBase('Tenant A');
    const tenantB = await createTenantBase('Tenant B');

    // Campaign belongs to Tenant A
    const campaignA = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenantA.id,
        name: 'Tenant A Secret Campaign',
        channel: 'EMAIL',
        status: 'QUEUED',
      },
    });

    // Try deleting campaignA using Tenant B's context
    const resB = await CampaignService.deleteCampaign(tenantB.id, campaignA.id);
    assert.equal(resB.status, 404);
    assert.equal(resB.success, false);
    assert.match(resB.error || '', /Campaign not found/);

    // Verify campaignA is untouched
    const untouched = await prisma.broadcastCampaign.findUnique({ where: { id: campaignA.id } });
    assert.ok(untouched);
    assert.equal(untouched.name, 'Tenant A Secret Campaign');
  });

  it('3. GET /api/dashboard/broadcast returns real-time live job counts from the job table', async () => {
    const tenant = await createTenantBase();

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Live Stats Campaign',
        channel: 'EMAIL',
        status: 'SENDING',
      },
    });

    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          tenantId: tenant.id,
          displayName: 'Customer 1',
          primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
          email: 'cust1@example.com',
        },
      }),
      prisma.customer.create({
        data: {
          tenantId: tenant.id,
          displayName: 'Customer 2',
          primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
          email: 'cust2@example.com',
        },
      }),
      prisma.customer.create({
        data: {
          tenantId: tenant.id,
          displayName: 'Customer 3',
          primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
          email: 'cust3@example.com',
        },
      }),
    ]);

    // Create 3 jobs: 1 SENT, 1 PENDING, 1 FAILED
    await Promise.all([
      prisma.broadcastJob.create({
        data: {
          tenantId: tenant.id,
          campaignId: campaign.id,
          customerId: customers[0].id,
          recipient: 'cust1@example.com',
          channel: 'EMAIL',
          status: 'SENT',
          scheduledFor: new Date(),
        },
      }),
      prisma.broadcastJob.create({
        data: {
          tenantId: tenant.id,
          campaignId: campaign.id,
          customerId: customers[1].id,
          recipient: 'cust2@example.com',
          channel: 'EMAIL',
          status: 'PENDING',
          scheduledFor: new Date(),
        },
      }),
      prisma.broadcastJob.create({
        data: {
          tenantId: tenant.id,
          campaignId: campaign.id,
          customerId: customers[2].id,
          recipient: 'cust3@example.com',
          channel: 'EMAIL',
          status: 'FAILED',
          scheduledFor: new Date(),
        },
      }),
    ]);

    // Query single campaign with live jobs
    const detail = await CampaignService.getCampaignWithLiveJobs(tenant.id, campaign.id);
    assert.ok(detail);
    assert.equal(detail.liveJobs.total, 3);
    assert.equal(detail.liveJobs.sent, 1);
    assert.equal(detail.liveJobs.pending, 1);
    assert.equal(detail.liveJobs.failed, 1);

    // Query campaign list with live jobs
    const list = await CampaignService.listCampaignsWithLiveJobs(tenant.id, 'EMAIL');
    const found = list.find((c) => c.id === campaign.id);
    assert.ok(found);
    assert.equal(found.liveJobs.total, 3);
    assert.equal(found.liveJobs.sent, 1);
    assert.equal(found.liveJobs.pending, 1);
    assert.equal(found.liveJobs.failed, 1);
  });

  it('4. Pre-Send checklist validates subject, template, and unsubscribe presence', () => {
    // 1. Missing subject
    const check1 = EmailTemplateEngine.validatePreSend({
      subject: '',
      htmlBody: '<p>Hello world {{unsubscribe_url}}</p>',
    });
    assert.equal(check1.passed, false);
    assert.ok(check1.errors.some((e) => e.includes('Subject line is required')));

    // 2. Missing body
    const check2 = EmailTemplateEngine.validatePreSend({
      subject: 'Valid Subject Line',
      htmlBody: '',
    });
    assert.equal(check2.passed, false);
    assert.ok(check2.errors.some((e) => e.includes('body cannot be empty')));

    // 3. Missing unsubscribe link
    const check3 = EmailTemplateEngine.validatePreSend({
      subject: 'Valid Subject Line',
      htmlBody: '<div>Hello customer without footer</div>',
    });
    assert.equal(check3.passed, false);
    assert.ok(check3.errors.some((e) => e.includes('Unsubscribe')));

    // 4. Valid subject & unsubscribe link
    const check4 = EmailTemplateEngine.validatePreSend({
      subject: 'Valid Subject Line',
      htmlBody: '<div>Hello {{first_name}}!<br><a href="{{unsubscribe_url}}">Unsubscribe</a></div>',
    });
    assert.equal(check4.passed, true);
    assert.equal(check4.errors.length, 0);
  });

  it('5. Test send strictly respects suppression list and blocks sending to suppressed addresses', async () => {
    const tenant = await createTenantBase();

    // Configure tenant email and verified domain
    await prisma.tenantSendingDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'domain-e6-test.com',
        status: 'VERIFIED',
      },
    });

    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('re_test_key_12345'),
        fromName: 'Test Agency',
        fromEmail: 'updates@domain-e6-test.com',
        postalAddress: '100 Enterprise Blvd, Austin, TX 78701',
      },
    });

    // Suppress recipient
    const suppressedEmail = 'suppressed.recipient@example.com';
    await EmailSuppressionService.suppressEmail(tenant.id, suppressedEmail, 'COMPLAINT');

    const { adapter, calls } = makeFakeAdapter();

    const res = await TestSendService.executeTestSend({
      tenantId: tenant.id,
      recipientEmail: suppressedEmail,
      subject: 'Test Subject',
      htmlBody: '<p>Test email body</p>',
      adapterOverride: adapter,
    });

    assert.equal(res.httpStatus, 400);
    assert.equal(res.success, false);
    assert.equal(res.suppressed, true);
    assert.match(res.error || '', /suppressed/i);
    assert.equal(res.reason, 'COMPLAINT');
    assert.equal(calls.length, 0); // Must NOT call provider
  });

  it('6. Test send enforces verified sending domain requirement before sending', async () => {
    const tenant = await createTenantBase();

    // Configure email config with an unverified domain
    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('re_test_key_12345'),
        fromName: 'Test Agency',
        fromEmail: 'updates@unverified-domain-123.com',
        postalAddress: '100 Enterprise Blvd, Austin, TX 78701',
      },
    });

    const { adapter, calls } = makeFakeAdapter();

    const res = await TestSendService.executeTestSend({
      tenantId: tenant.id,
      recipientEmail: 'clean.recipient@example.com',
      subject: 'Test Subject',
      htmlBody: '<p>Test email body</p>',
      adapterOverride: adapter,
    });

    assert.equal(res.httpStatus, 400);
    assert.equal(res.success, false);
    assert.match(res.error || '', /not a verified sending domain/i);
    assert.equal(calls.length, 0); // Must NOT call provider
  });

  it('7. Test send succeeds for verified domain & clean recipient, appending compliance footer and resolving real customer tags', async () => {
    const tenant = await createTenantBase();

    await prisma.tenantSendingDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'domain-verified.com',
        status: 'VERIFIED',
      },
    });

    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('re_test_key_12345'),
        fromName: 'Verified Agency',
        fromEmail: 'hello@domain-verified.com',
        postalAddress: '789 Congress Ave, Austin, TX 78701',
      },
    });

    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Sarah Connor',
        primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: 'sarah.connor@example.com',
      },
    });

    const { adapter, calls } = makeFakeAdapter();

    const res = await TestSendService.executeTestSend({
      tenantId: tenant.id,
      recipientEmail: 'sarah.connor@example.com',
      subject: 'Hello {{first_name}}',
      htmlBody: '<p>Welcome {{first_name}}! Check out your coverage.</p>',
      adapterOverride: adapter,
    });

    assert.equal(res.httpStatus, 200);
    assert.equal(res.success, true);
    assert.equal(calls.length, 1);
    const sentEmail = calls[0];
    assert.match(sentEmail.subject, /\[TEST SEND\] Hello Sarah/);
    assert.match(sentEmail.html, /Welcome Sarah!/);
    assert.match(sentEmail.html, /789 Congress Ave, Austin, TX 78701/);
    assert.match(sentEmail.html, /\/api\/channels\/email\/unsubscribe/);
  });
});
