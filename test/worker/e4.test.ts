import 'dotenv/config';
import { encrypt } from '@/lib/encryption';
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { runCampaignTick } from '@/worker/campaignRunner';
import { ProviderFactory } from '@/lib/email/ProviderFactory';
import { ResendProviderAdapter } from '@/lib/email/adapters/ResendProviderAdapter';
import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult } from '@/lib/email/types';

const createdTenantIds: string[] = [];

async function createTenantBase(namePrefix = 'E4 Test') {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: `${namePrefix} ${uid}`,
      slug: `e4-test-${uid}`,
      status: 'ACTIVE',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
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

describe('Step E4: Sender and Domain Setup', () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      const ids = createdTenantIds.splice(0, createdTenantIds.length);
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('1. Campaign fails at send time if from-address domain is unverified, with an error telling them what to fix', async () => {
    const tenant = await createTenantBase('Unverified Domain Tenant');

    // Tenant has email config with domain "unverifiedbrand.com"
    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('valid_test_key'),
        fromName: 'Unverified Brand',
        fromEmail: 'marketing@unverifiedbrand.com',
        hourlySendRate: 1000,
        dailySendQuota: 1000,
      },
    });

    // Domain exists but is PENDING, NOT VERIFIED
    await prisma.tenantSendingDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'unverifiedbrand.com',
        status: 'PENDING',
      },
    });

    const template = await prisma.template.create({
      data: {
        tenantId: tenant.id,
        name: 'Unverified Domain Test Template',
        channel: 'EMAIL',
        category: 'MARKETING',
        subject: 'Welcome',
        htmlBody: '<p>Hello</p>',
        body: 'Hello',
        content: 'Hello',
        status: 'APPROVED',
      },
    });

    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Test Recipient',
        email: 'recipient@example.com',
        primaryPhone: '+15559990001',
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    const now = new Date();
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Unverified Campaign',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();

    // Run worker tick
    await runCampaignTick({
      workerId: 'worker_e4',
      now: () => now,
      emailDeps: { adapterOverride: fake.adapter },
    });

    // Campaign must fail with a clear domain verification error
    const failedCamp = await prisma.broadcastCampaign.findUnique({
      where: { id: campaign.id },
    });

    assert.equal(failedCamp?.status, 'FAILED');
    assert.ok(
      failedCamp?.lastError?.includes('unverifiedbrand.com'),
      `Expected lastError to mention the domain, got: ${failedCamp?.lastError}`
    );
    assert.ok(
      failedCamp?.lastError?.includes('Settings > Email Domains'),
      `Expected lastError to instruct user to verify in Settings, got: ${failedCamp?.lastError}`
    );
    // Provider must NOT have been called
    assert.equal(fake.calls.length, 0);
  });

  it('2. Campaign sends successfully once the from-address domain is VERIFIED', async () => {
    const tenant = await createTenantBase('Verified Domain Tenant');

    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('valid_test_key'),
        fromName: 'Verified Brand',
        fromEmail: 'newsletter@verifiedbrand.com',
        hourlySendRate: 1000,
        dailySendQuota: 1000,
      },
    });

    // Create VERIFIED sending domain
    await prisma.tenantSendingDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'verifiedbrand.com',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });

    const template = await prisma.template.create({
      data: {
        tenantId: tenant.id,
        name: 'Verified Template',
        channel: 'EMAIL',
        category: 'MARKETING',
        subject: 'Hello from Verified Domain',
        htmlBody: '<p>Welcome</p>',
        body: 'Welcome',
        content: 'Welcome',
        status: 'APPROVED',
      },
    });

    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Subscribed Member',
        email: 'member@example.com',
        primaryPhone: '+15559990002',
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    const now = new Date();
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Verified Campaign',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();

    // Run worker tick
    await runCampaignTick({
      workerId: 'worker_e4',
      now: () => now,
      emailDeps: { adapterOverride: fake.adapter },
    });

    const finishedCamp = await prisma.broadcastCampaign.findUnique({
      where: { id: campaign.id },
    });

    assert.equal(finishedCamp?.status, 'COMPLETED');
    assert.equal(finishedCamp?.sent, 1);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].to, 'member@example.com');
  });

  it('3. Tenant with no email provider configured cannot send (fails cleanly without fallback to mock_email_key)', async () => {
    const tenant = await createTenantBase('No Provider Tenant');

    // Attempting to get credentials for tenant with no config throws cleanly
    await assert.rejects(
      async () => {
        await ProviderFactory.getTenantCredentials(tenant.id);
      },
      /Tenant has no email provider configured/
    );

    const template = await prisma.template.create({
      data: {
        tenantId: tenant.id,
        name: 'No Provider Template',
        channel: 'EMAIL',
        category: 'MARKETING',
        subject: 'No Provider',
        htmlBody: '<p>No Provider</p>',
        body: 'No Provider',
        content: 'No Provider',
        status: 'APPROVED',
      },
    });

    const now = new Date();
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        name: 'No Config Campaign',
        channel: 'EMAIL',
        templateId: template.id,
        recipientFilter: { type: 'all' },
        scheduledAt: now,
        status: 'QUEUED',
      },
    });

    const fake = makeFakeAdapter();
    await runCampaignTick({
      workerId: 'worker_e4',
      now: () => now,
      emailDeps: { adapterOverride: fake.adapter },
    });

    const failedCamp = await prisma.broadcastCampaign.findUnique({
      where: { id: campaign.id },
    });
    assert.equal(failedCamp?.status, 'FAILED');
    assert.ok(
      failedCamp?.lastError?.includes('Tenant has no email provider configured'),
      `Expected lastError to mention missing email provider, got: ${failedCamp?.lastError}`
    );
  });

  it('4. ResendProviderAdapter does not silently rewrite freemail senders to onboarding@resend.dev', async () => {
    const adapter = new ResendProviderAdapter();

    // Mock global fetch to inspect request body sent to Resend
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (typeof url === 'string' && url.includes('api.resend.com/emails')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'resend_msg_test_123' }),
        };
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const email: OutboundEmail = {
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      };

      const creds: EmailProviderCredentials = {
        apiKey: 're_test_key_123',
        fromName: 'Gmail Sender',
        fromEmail: 'mybusiness@gmail.com',
      };

      await adapter.send(email, creds);

      assert.ok(capturedBody, 'Expected Resend API to be called');
      // Must NOT be rewritten to onboarding@resend.dev
      assert.ok(!capturedBody.from.includes('onboarding@resend.dev'), 'from address must not be rewritten to onboarding@resend.dev');
      assert.equal(capturedBody.from, '"Gmail Sender" <mybusiness@gmail.com>');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
