import 'dotenv/config';
import { encrypt } from '@/lib/encryption';
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { runCampaignTick } from '@/worker/campaignRunner';
import type { EmailProviderCredentials, EmailSendResult, IEmailProviderAdapter, OutboundEmail } from '@/lib/email/types';

const createdTenantIds: string[] = [];

async function createTestTenant(opts: {
  hourlySendRate?: number;
  dailySendQuota?: number;
  isAutoPaused?: boolean;
} = {}) {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: `Worker Test ${uid}`,
      slug: `worker-test-${uid}`,
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
      fromName: 'Test Sender',
      fromEmail: 'test@example.com',
      hourlySendRate: opts.hourlySendRate ?? 1000,
      dailySendQuota: opts.dailySendQuota ?? 1000,
      isAutoPaused: opts.isAutoPaused ?? false,
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
      subject: 'Hello {{first_name}}',
      htmlBody: '<p>Hi {{first_name}}</p>',
      body: 'Hi {{first_name}}',
      content: 'Hi {{first_name}}',
      status: 'APPROVED',
    },
  });

  return { tenant, template };
}

async function createCustomers(tenantId: string, count: number, prefix = 'user') {
  const data = Array.from({ length: count }, (_, i) => ({
    tenantId,
    primaryPhone: `+1555${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}_${i}`,
    displayName: `${prefix} ${i}`,
    email: `${prefix}.${i}@example.com`,
    optedIn: true,
    emailConsentStatus: 'SUBSCRIBED' as const,
  }));
  await prisma.customer.createMany({ data });
  return prisma.customer.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
}

function makeFakeAdapter(
  handler?: (email: OutboundEmail, callIndex: number) => Promise<EmailSendResult> | EmailSendResult
): { adapter: IEmailProviderAdapter; calls: OutboundEmail[] } {
  const calls: OutboundEmail[] = [];
  const adapter: IEmailProviderAdapter = {
    providerName: 'FAKE',
    async send(email: OutboundEmail, _creds: EmailProviderCredentials): Promise<EmailSendResult> {
      calls.push(email);
      if (handler) return handler(email, calls.length);
      return { messageId: `fake_${calls.length}`, status: 'SENT', httpStatus: 200, retryable: false };
    },
  };
  return { adapter, calls };
}

describe('Step E1 Email Worker', () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      const ids = createdTenantIds.splice(0, createdTenantIds.length);
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('1. Campaign scheduled 1 minute ahead is not sent before its time and is sent after', async () => {
    const { tenant, template } = await createTestTenant();
    await createCustomers(tenant.id, 3, 'sched');
    const baseTime = new Date();
    const oneMinAhead = new Date(baseTime.getTime() + 60_000);

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Scheduled Test',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: oneMinAhead,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();
    await runCampaignTick({ now: () => baseTime, emailDeps: { adapterOverride: fake.adapter } });
    assert.equal(fake.calls.length, 0);

    const beforeCheck = await prisma.broadcastCampaign.findUnique({ where: { id: camp.id } });
    assert.equal(beforeCheck?.status, 'QUEUED');

    const afterTime = new Date(oneMinAhead.getTime() + 1000);
    await runCampaignTick({ now: () => afterTime, emailDeps: { adapterOverride: fake.adapter } });
    assert.equal(fake.calls.length, 3);

    const afterCheck = await prisma.broadcastCampaign.findUnique({ where: { id: camp.id } });
    assert.equal(afterCheck?.status, 'COMPLETED');
    assert.equal(afterCheck?.sent, 3);
  });

  it('2. 200 recipients: worker stops after ~50, new worker finishes, exactly 200 SENT and 200 calls', async () => {
    const { tenant, template } = await createTestTenant();
    await createCustomers(tenant.id, 200, 'batch200');
    const now = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: '200 Batch Test',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();
    // Worker 1 runs one pass with perLoopCap = 50 (simulating stopping after ~50)
    await runCampaignTick({
      workerId: 'worker_1',
      perLoopCap: 50,
      now: () => now,
      emailDeps: { adapterOverride: fake.adapter },
    });
    assert.equal(fake.calls.length, 50);

    // Worker 2 finishes the remaining 150
    for (let i = 0; i < 4; i++) {
      await runCampaignTick({
        workerId: 'worker_2',
        perLoopCap: 50,
        now: () => now,
        emailDeps: { adapterOverride: fake.adapter },
      });
    }

    assert.equal(fake.calls.length, 200);
    const sentCount = await prisma.broadcastJob.count({
      where: { campaignId: camp.id, status: 'SENT' },
    });
    assert.equal(sentCount, 200);

    const finalCamp = await prisma.broadcastCampaign.findUnique({ where: { id: camp.id } });
    assert.equal(finalCamp?.status, 'COMPLETED');
    assert.equal(finalCamp?.sent, 200);
  });

  it('3. Two workers run at once on one campaign; no recipient is sent twice', async () => {
    const { tenant, template } = await createTestTenant();
    await createCustomers(tenant.id, 30, 'concurrent');
    const now = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Concurrent Workers',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter(async (_email, idx) => {
      await new Promise((r) => setTimeout(r, 15));
      return { messageId: `conc_${idx}`, status: 'SENT', httpStatus: 200, retryable: false };
    });

    // Build audience first, then race two workers claiming concurrently
    await runCampaignTick({ workerId: 'w_init', perLoopCap: 0, now: () => now, emailDeps: { adapterOverride: fake.adapter } });
    await Promise.all([
      runCampaignTick({ workerId: 'w_a', perLoopCap: 20, now: () => now, emailDeps: { adapterOverride: fake.adapter } }),
      runCampaignTick({ workerId: 'w_b', perLoopCap: 20, now: () => now, emailDeps: { adapterOverride: fake.adapter } }),
    ]);

    assert.equal(fake.calls.length, 30);
    const uniqueRecipients = new Set(fake.calls.map((c) => c.to));
    assert.equal(uniqueRecipients.size, 30);

    const finalCamp = await prisma.broadcastCampaign.findUnique({ where: { id: camp.id } });
    assert.equal(finalCamp?.status, 'COMPLETED');
  });

  it('4. hourlySendRate = 50: after one pass no more than 50 are SENT; rest remain PENDING', async () => {
    const { tenant, template } = await createTestTenant({ hourlySendRate: 50, dailySendQuota: 500 });
    await createCustomers(tenant.id, 75, 'rate50');
    const now = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Hourly Cap 50',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();
    await runCampaignTick({ perLoopCap: 100, now: () => now, emailDeps: { adapterOverride: fake.adapter } });

    const sentCount = await prisma.broadcastJob.count({ where: { campaignId: camp.id, status: 'SENT' } });
    const pendingCount = await prisma.broadcastJob.count({ where: { campaignId: camp.id, status: 'PENDING' } });
    assert.equal(sentCount, 50);
    assert.equal(pendingCount, 25);

    // Second pass in the same hour should send 0 more
    await runCampaignTick({ perLoopCap: 100, now: () => now, emailDeps: { adapterOverride: fake.adapter } });
    assert.equal(fake.calls.length, 50);
  });

  it('5. Pausing stops new sends; resuming continues without duplicates', async () => {
    const { tenant, template } = await createTestTenant();
    await createCustomers(tenant.id, 10, 'pause');
    const now = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Pause Resume Test',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();
    await runCampaignTick({ perLoopCap: 4, now: () => now, emailDeps: { adapterOverride: fake.adapter } });
    assert.equal(fake.calls.length, 4);

    // Pause
    await prisma.broadcastCampaign.update({ where: { id: camp.id }, data: { status: 'PAUSED' } });
    await runCampaignTick({ perLoopCap: 10, now: () => now, emailDeps: { adapterOverride: fake.adapter } });
    assert.equal(fake.calls.length, 4);

    // Resume (startedAt is set -> SENDING)
    await prisma.broadcastCampaign.update({ where: { id: camp.id }, data: { status: 'SENDING' } });
    await runCampaignTick({ perLoopCap: 10, now: () => now, emailDeps: { adapterOverride: fake.adapter } });
    assert.equal(fake.calls.length, 10);
    assert.equal(new Set(fake.calls.map((c) => c.to)).size, 10);
  });

  it('6. Fake provider returns 429 twice then success; job ends SENT with attempts = 3 and backoff applied', async () => {
    const { tenant, template } = await createTestTenant();
    await createCustomers(tenant.id, 1, 'retry429');
    let clock = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Retry 429 Test',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: clock,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter((_email, callIdx) => {
      if (callIdx <= 2) {
        return { messageId: '', status: 'FAILED', error: 'Rate limited', httpStatus: 429, retryable: true };
      }
      return { messageId: 'ok_3', status: 'SENT', httpStatus: 200, retryable: false };
    });

    // Attempt 1 -> 429 (backoff +60s)
    await runCampaignTick({ now: () => clock, emailDeps: { adapterOverride: fake.adapter } });
    let job = await prisma.broadcastJob.findFirst({ where: { campaignId: camp.id } });
    assert.equal(job?.status, 'PENDING');
    assert.equal(job?.attempts, 1);
    assert.ok(job!.scheduledFor.getTime() > clock.getTime());

    // Before backoff expires -> not claimed
    await runCampaignTick({ now: () => clock, emailDeps: { adapterOverride: fake.adapter } });
    assert.equal(fake.calls.length, 1);

    // Advance clock past 1 min backoff -> Attempt 2 -> 429 (backoff +5m)
    clock = new Date(job!.scheduledFor.getTime() + 1000);
    await runCampaignTick({ now: () => clock, emailDeps: { adapterOverride: fake.adapter } });
    job = await prisma.broadcastJob.findFirst({ where: { campaignId: camp.id } });
    assert.equal(job?.status, 'PENDING');
    assert.equal(job?.attempts, 2);

    // Advance clock past 5 min backoff -> Attempt 3 -> SENT
    clock = new Date(job!.scheduledFor.getTime() + 1000);
    await runCampaignTick({ now: () => clock, emailDeps: { adapterOverride: fake.adapter } });
    job = await prisma.broadcastJob.findFirst({ where: { campaignId: camp.id } });
    assert.equal(job?.status, 'SENT');
    assert.equal(job?.attempts, 3);
    assert.equal(job?.providerMessageId, 'ok_3');
  });

  it('7. Tenant A is auto-paused; Tenant B campaign still sends', async () => {
    const a = await createTestTenant({ isAutoPaused: true });
    const b = await createTestTenant({ isAutoPaused: false });
    await createCustomers(a.tenant.id, 2, 'tenantA');
    await createCustomers(b.tenant.id, 2, 'tenantB');
    const now = new Date();

    const campA = await prisma.broadcastCampaign.create({
      data: {
        tenantId: a.tenant.id,
        name: 'Paused Tenant A',
        channel: 'EMAIL',
        templateId: a.template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const campB = await prisma.broadcastCampaign.create({
      data: {
        tenantId: b.tenant.id,
        name: 'Active Tenant B',
        channel: 'EMAIL',
        templateId: b.template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();
    await runCampaignTick({ now: () => now, emailDeps: { adapterOverride: fake.adapter } });

    const sentA = await prisma.broadcastJob.count({ where: { campaignId: campA.id, status: 'SENT' } });
    const sentB = await prisma.broadcastJob.count({ where: { campaignId: campB.id, status: 'SENT' } });
    assert.equal(sentA, 0);
    assert.equal(sentB, 2);
  });

  it('8. Suppressed address ends SKIPPED_SUPPRESSED and provider is not called', async () => {
    const { tenant, template } = await createTestTenant();
    const customers = await createCustomers(tenant.id, 2, 'supp');
    const suppressedEmail = customers[0].email!;
    await prisma.globalSuppression.create({
      data: { tenantId: tenant.id, email: suppressedEmail, reason: 'HARD_BOUNCE' },
    });
    const now = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Suppression Test',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();
    await runCampaignTick({ now: () => now, emailDeps: { adapterOverride: fake.adapter } });

    assert.equal(fake.calls.length, 1);
    assert.notEqual(fake.calls[0].to, suppressedEmail);

    const skipped = await prisma.broadcastJob.count({
      where: { campaignId: camp.id, status: 'SKIPPED_SUPPRESSED' },
    });
    assert.equal(skipped, 1);
  });

  it('9. Campaign where every send fails ends FAILED, not COMPLETED', async () => {
    const { tenant, template } = await createTestTenant();
    await createCustomers(tenant.id, 2, 'allfail');
    const now = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'All Fail Test',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter(() => ({
      messageId: '',
      status: 'FAILED',
      error: 'Invalid recipient domain',
      httpStatus: 400,
      retryable: false,
    }));

    await runCampaignTick({ now: () => now, emailDeps: { adapterOverride: fake.adapter } });

    const finished = await prisma.broadcastCampaign.findUnique({ where: { id: camp.id } });
    assert.equal(finished?.status, 'FAILED');
    assert.equal(finished?.sent, 0);
    assert.equal(finished?.failed, 2);
  });

  it('10. Running the audience build twice creates no duplicate jobs', async () => {
    const { tenant, template } = await createTestTenant();
    await createCustomers(tenant.id, 5, 'dedup');
    const now = new Date();

    const camp = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Idempotent Audience Build',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'SENDING',
        startedAt: now,
        audienceBuiltAt: null,
      },
    });

    const fake = makeFakeAdapter();
    // Build once
    await runCampaignTick({ perLoopCap: 0, now: () => now, emailDeps: { adapterOverride: fake.adapter } });
    // Force audienceBuiltAt back to null and run again
    await prisma.broadcastCampaign.update({ where: { id: camp.id }, data: { audienceBuiltAt: null } });
    await runCampaignTick({ perLoopCap: 0, now: () => now, emailDeps: { adapterOverride: fake.adapter } });

    const jobCount = await prisma.broadcastJob.count({ where: { campaignId: camp.id } });
    assert.equal(jobCount, 5);
  });
});
