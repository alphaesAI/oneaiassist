import 'dotenv/config';
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { EmailTemplateEngine } from '@/lib/email/templateEngine';
import { renderCampaignEmailContent } from '@/lib/email/dispatchCampaign';
import { sendEmailJob } from '@/worker/senders/emailSender';
import { encrypt } from '@/lib/encryption';
import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult } from '@/lib/email/types';

const createdTenantIds: string[] = [];

async function createTenantBase(namePrefix = 'E5 Test') {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: `${namePrefix} ${uid}`,
      slug: `e5-test-${uid}`,
      status: 'ACTIVE',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
      postalAddress: '123 Market St, Suite 400, San Francisco, CA 94105',
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

describe('Step E5: Templates and Merge Fields', () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      const ids = createdTenantIds.splice(0, createdTenantIds.length);
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('1. HTML-escape merge values to prevent XSS / HTML injection (MKT-12)', () => {
    const maliciousName = '<script>alert("xss")</script>';
    const template = '<p>Hello {{name}}, welcome to our platform!</p>';

    const result = EmailTemplateEngine.render(template, { name: maliciousName }, { escapeHtml: true });
    assert.strictEqual(
      result,
      '<p>Hello &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;, welcome to our platform!</p>'
    );
    assert.ok(!result.includes('<script>'), 'Script tag must not be injected unescaped');

    // Also verify quote and ampersand escaping
    const specialChars = 'Smith & "Wesson"';
    const escaped = EmailTemplateEngine.escapeHtml(specialChars);
    assert.strictEqual(escaped, 'Smith &amp; &quot;Wesson&quot;');
  });

  it('2. Author-defined fallback ({{key | "fallback"}}) is used when merge tag is missing (MKT-05)', () => {
    const template = '<h1>Hi {{first_name | "Valued Customer"}}! Your balance is {{balance | "$0.00"}}.</h1>';

    // When both are missing from context
    const renderedMissing = EmailTemplateEngine.renderDetailed(template, {}, { escapeHtml: true });
    assert.strictEqual(renderedMissing.rendered, '<h1>Hi Valued Customer! Your balance is $0.00.</h1>');
    assert.strictEqual(renderedMissing.missingTags.length, 0, 'Tags with author fallback should not be recorded as missing');

    // When first_name is present but balance is missing
    const renderedPartial = EmailTemplateEngine.renderDetailed(template, { first_name: 'Alice' }, { escapeHtml: true });
    assert.strictEqual(renderedPartial.rendered, '<h1>Hi Alice! Your balance is $0.00.</h1>');
    assert.strictEqual(renderedPartial.missingTags.length, 0);
  });

  it('3. Missing merge value without fallback marks recipient job as SKIPPED_INVALID and skips send (MKT-05)', async () => {
    const tenant = await createTenantBase('Missing Merge Field Tenant');
    const { adapter, calls } = makeFakeAdapter();

    // Configure sending domain and email config
    await prisma.tenantSendingDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'agencybrand.com',
        status: 'VERIFIED',
      },
    });

    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('re_test_key_12345'),
        fromName: 'Agency Brand',
        fromEmail: 'hello@agencybrand.com',
      },
    });

    // Create a customer WITHOUT active policy
    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Bob Jones',
        email: 'bob.jones@example.com',
        primaryPhone: '+15552345678',
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    // Template requires {{policy_number}} without author fallback
    const emailTemplate = await prisma.template.create({
      data: {
        tenantId: tenant.id,
        name: `policy_alert_${Date.now()}`,
        channel: 'EMAIL',
        category: 'MARKETING',
        subject: 'Important update for policy {{policy_number}}',
        htmlBody: '<p>Dear {{first_name | "Customer"}}, your policy {{policy_number}} requires renewal.</p>',
        status: 'APPROVED',
      },
    });

    // Create campaign and broadcast job
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        templateId: emailTemplate.id,
        name: 'Policy Renewal Notice',
        channel: 'EMAIL',
        status: 'SENDING',
        totalRecipients: 1,
      },
    });

    const job = await prisma.broadcastJob.create({
      data: {
        tenantId: tenant.id,
        campaignId: campaign.id,
        customerId: customer.id,
        channel: 'EMAIL',
        recipient: customer.email || 'bob.jones@example.com',
        scheduledFor: new Date(),
        status: 'PENDING',
      },
    });

    // Execute job
    await sendEmailJob(job, { adapterOverride: adapter, appOrigin: 'http://localhost:3000' });

    // Verify job transitioned to SKIPPED_INVALID with clear error reason
    const updatedJob = await prisma.broadcastJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(updatedJob?.status, 'SKIPPED_INVALID');
    assert.strictEqual(updatedJob?.lastError, 'Missing required merge field: policy_number');

    // Ensure email provider was NEVER called
    assert.strictEqual(calls.length, 0, 'No email should be dispatched when required merge tag is missing');
  });

  it('4. Compliance footer with postal address and unsubscribe link is appended by the system to every marketing email (MKT-06)', async () => {
    const tenant = await createTenantBase('Compliance Tenant');
    const { adapter, calls } = makeFakeAdapter();

    await prisma.tenantSendingDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'compliancetest.com',
        status: 'VERIFIED',
      },
    });

    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('re_test_key_12345'),
        fromName: 'Compliance Org',
        fromEmail: 'newsletter@compliancetest.com',
        postalAddress: '789 Enterprise Blvd, Suite 10, Austin, TX 78701',
      },
    });

    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Charlie Green',
        email: 'charlie.green@example.com',
        primaryPhone: '+15553456789',
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    // Template author completely omitted postal address and unsubscribe link
    const bareTemplate = await prisma.template.create({
      data: {
        tenantId: tenant.id,
        name: `bare_newsletter_${Date.now()}`,
        channel: 'EMAIL',
        category: 'MARKETING',
        subject: 'Weekly Product Highlights',
        htmlBody: '<div><h1>Latest News</h1><p>Check out our brand new updates!</p></div>',
        status: 'APPROVED',
      },
    });

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenant.id,
        templateId: bareTemplate.id,
        name: 'Weekly Highlights',
        channel: 'EMAIL',
        status: 'SENDING',
        totalRecipients: 1,
      },
    });

    const job = await prisma.broadcastJob.create({
      data: {
        tenantId: tenant.id,
        campaignId: campaign.id,
        customerId: customer.id,
        channel: 'EMAIL',
        recipient: customer.email || 'charlie.green@example.com',
        scheduledFor: new Date(),
        status: 'PENDING',
      },
    });

    await sendEmailJob(job, { adapterOverride: adapter, appOrigin: 'http://localhost:3000' });

    assert.strictEqual(calls.length, 1, 'Email should be dispatched');
    const sentEmail = calls[0];

    // Must include the postal address
    assert.ok(
      sentEmail.html.includes('789 Enterprise Blvd, Suite 10, Austin, TX 78701') ||
      sentEmail.html.includes('123 Market St, Suite 400, San Francisco, CA 94105'),
      'Outbound email must contain the physical postal address'
    );

    // Must include a working unsubscribe link: signed with a token. An unsigned
    // ?email=&tenantId= link is rejected by the unsubscribe endpoint, so it must never be sent.
    assert.match(
      sentEmail.html,
      /\/api\/channels\/email\/unsubscribe\?token=[\w.\-%]+/,
      'Outbound email must contain a signed unsubscribe link'
    );
    assert.ok(!sentEmail.html.includes('unsubscribe?email='), 'No unsigned unsubscribe link may be sent');
  });

  it('5. Template HTML is sanitised on save (SEC-21)', () => {
    const maliciousHtml = `
      <div class="content">
        <h1>Welcome</h1>
        <script>alert("hacked")</script>
        <img src="x" onerror="fetch('/leak?cookie=' + document.cookie)" />
        <a href="javascript:alert('xss')">Click me</a>
        <iframe src="http://evil.com"></iframe>
      </div>
    `;

    const sanitized = EmailTemplateEngine.sanitizeHtml(maliciousHtml);

    // Assert script tag and content are completely stripped
    assert.ok(!sanitized.includes('<script>'), 'Script tag must be stripped');
    assert.ok(!sanitized.includes('alert("hacked")'), 'Script body must be removed');

    // Assert dangerous tags are stripped
    assert.ok(!sanitized.includes('<iframe'), 'Iframe tag must be stripped');

    // Assert inline event handler is removed
    assert.ok(!sanitized.includes('onerror'), 'onerror event handler must be removed');

    // Assert javascript: URI is removed
    assert.ok(!sanitized.includes('javascript:'), 'javascript: URI must be removed');

    // Assert benign content is preserved
    assert.ok(sanitized.includes('<h1>Welcome</h1>'), 'Benign HTML content must be preserved');
  });

  it('6. All dashboard preview iframes have sandbox attribute without allow-scripts (SEC-21)', () => {
    // Read the files with preview iframes and check that every <iframe has sandbox="allow-same-origin"
    const modalPath = path.join(process.cwd(), 'components/email/EmailTemplateEditorModal.tsx');
    const pagePath = path.join(process.cwd(), 'app/(dashboard)/dashboard/marketing/email/page.tsx');

    const modalContent = fs.readFileSync(modalPath, 'utf8');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    // Find all <iframe tags in modal
    const modalIframes = modalContent.match(/<iframe[\s\S]*?>/g) || [];
    assert.ok(modalIframes.length > 0, 'Modal must contain preview iframe');
    for (const frame of modalIframes) {
      assert.ok(frame.includes('sandbox="allow-same-origin"'), 'Modal iframe must have sandbox="allow-same-origin"');
      assert.ok(!frame.includes('allow-scripts'), 'Modal iframe must not allow scripts');
    }

    // Find all <iframe tags in email marketing page
    const pageIframes = pageContent.match(/<iframe[\s\S]*?>/g) || [];
    assert.ok(pageIframes.length >= 3, 'Page must contain at least 3 preview iframes');
    for (const frame of pageIframes) {
      assert.ok(frame.includes('sandbox="allow-same-origin"'), 'Page iframe must have sandbox="allow-same-origin"');
      assert.ok(!frame.includes('allow-scripts'), 'Page iframe must not allow scripts');
    }
  });
});
