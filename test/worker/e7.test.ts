import 'dotenv/config';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../../lib/db';
import {
  EmailTrackingService,
  getTrackingSecret,
  AUTO_PAUSE_MIN_VOLUME,
} from '../../lib/email/tracking';
import { EmailSuppressionService } from '../../lib/email/suppression';
import { EmailTransportAdapter, EmailDeliveryError } from '../../lib/email/EmailTransportAdapter';
import { encrypt } from '@/lib/encryption';
import type { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult } from '../../lib/email/types';
import { CampaignEngagementService } from '../../lib/email/campaignEngagement';
import { POST as webhookPOST } from '../../app/api/channels/email/webhook/[provider]/route';
import { GET as unsubscribeGET, POST as unsubscribePOST } from '../../app/api/channels/email/unsubscribe/route';
import { GET as clickGET } from '../../app/api/channels/email/track/click/route';
import { GET as openGET } from '../../app/api/channels/email/track/open/route';

const APP = 'https://oneai.test';
const WEBHOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUpUWDkrGhpackqqIf';

function svixHeaders(body: string, secret: string, id = `msg_${crypto.randomUUID()}`) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  };
}

function postWebhook(provider: string, body: string, headers: Record<string, string>, tenant?: string) {
  const url = `${APP}/api/channels/email/webhook/${provider}${tenant ? `?tenant=${tenant}` : ''}`;
  return webhookPOST(new Request(url, { method: 'POST', headers, body }), {
    params: Promise.resolve({ provider }),
  });
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 15000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value as T;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 250));
  }
}

class FakeTrackingProviderAdapter implements IEmailProviderAdapter {
  readonly providerName = 'FAKE_TRACKING';
  sentEmails: OutboundEmail[] = [];

  async send(email: OutboundEmail, _creds: EmailProviderCredentials): Promise<EmailSendResult> {
    this.sentEmails.push(email);
    return {
      messageId: `msg_${crypto.randomUUID()}`,
      status: 'SENT',
    };
  }
}

describe('Step E7: Tracking, Cryptographic Compliance, Webhooks & Auto-Pause', () => {
  const testId = `e7_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let tenantId: string;
  let customerId: string;
  let campaignId: string;
  const extraTenantIds: string[] = [];

  /** A second, fully separate tenant with its own provider config, contact and campaign. */
  async function createOtherTenant(label: string, opts: { webhookSecret?: string } = {}) {
    const id = `${label}_${testId}`;
    const domain = `${label}-${testId}.com`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `E7 ${label} ${testId}`,
        slug: `e7-${label}-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        postalAddress: '1 Test Street, Austin, TX 78701',
      },
    });
    extraTenantIds.push(tenant.id);
    await prisma.tenantSendingDomain.create({
      data: { tenantId: tenant.id, domain, status: 'VERIFIED', verifiedAt: new Date() },
    });
    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id,
        provider: 'RESEND',
        encryptedApiKey: encrypt('re_test_12345'),
        encryptedWebhookSecret: opts.webhookSecret ? encrypt(opts.webhookSecret) : null,
        fromName: `E7 ${label}`,
        fromEmail: `updates@${domain}`,
        postalAddress: '1 Test Street, Austin, TX 78701',
      },
    });
    const email = `contact_${id}@example.com`;
    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName: `Contact ${label}`,
        primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 8999999)}`,
        email,
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
        emailConsentSource: 'E7 Automated Unit Test',
      },
    });
    const campaign = await prisma.broadcastCampaign.create({
      data: { tenantId: tenant.id, name: `E7 ${label} campaign`, channel: 'EMAIL', status: 'SENDING', subject: 'Hello' },
    });
    return { tenantId: tenant.id, customerId: customer.id, campaignId: campaign.id, email, domain };
  }

  const testEmail = `subscriber_${testId}@example.com`;
  const sendingDomain = `apex-${testId}.com`;

  test.before(async () => {
    // Setup test tenant, sending domain, and email config
    const tenant = await prisma.tenant.create({
      data: {
        name: `E7 Tracking Tenant ${testId}`,
        slug: `e7-tenant-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        postalAddress: '100 Enterprise Way, Suite 400, Austin, TX 78701',
      },
    });
    tenantId = tenant.id;

    await prisma.tenantSendingDomain.create({
      data: {
        tenantId,
        domain: sendingDomain,
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });

    await prisma.tenantEmailConfig.create({
      data: {
        tenantId,
        provider: 'RESEND',
        encryptedApiKey: encrypt('re_test_12345'),
        fromName: 'E7 Security Desk',
        fromEmail: `updates@${sendingDomain}`,
        postalAddress: '100 Enterprise Way, Suite 400, Austin, TX 78701',
        dailySendQuota: 1000,
        hourlySendRate: 100,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        displayName: 'E7 Subscriber',
        primaryPhone: '+15558889999',
        email: testEmail,
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
        emailConsentSource: 'E7 Automated Unit Test',
      },
    });
    customerId = customer.id;

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId,
        name: `E7 Tracking Campaign ${testId}`,
        channel: 'EMAIL',
        status: 'SENDING',
        subject: 'Special Offer for Verified Users',
      },
    });
    campaignId = campaign.id;
  });

  test.after(async () => {
    // Cascade cleanup
    await prisma.tenant.delete({
      where: { id: tenantId },
    }).catch(() => {});
    for (const id of extraTenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => {});
    }
  });

  test('1. Cryptographic Tokens (SEC-18, SEC-19) - tamper proof HMAC signing and verification', () => {
    const payload = {
      t: tenantId,
      u: customerId,
      c: campaignId,
      e: testEmail,
      type: 'click' as const,
      url: 'https://example.com/promo',
      iat: Date.now(),
    };

    const token = EmailTrackingService.createSignedToken(payload);
    assert.ok(token.includes('.'), 'Token must contain data and signature separated by dot');

    // 1. Verify valid token
    const decoded = EmailTrackingService.verifySignedToken(token);
    assert.strictEqual(decoded.valid, true, 'Valid token must verify successfully');
    assert.strictEqual(decoded.data?.t, tenantId);
    assert.strictEqual(decoded.data?.u, customerId);
    assert.strictEqual(decoded.data?.c, campaignId);
    assert.strictEqual(decoded.data?.e, testEmail);
    assert.strictEqual(decoded.data?.url, 'https://example.com/promo');

    // 2. Tampered signature must fail
    const [dataPart, sigPart] = token.split('.');
    const tamperedSig = sigPart.slice(0, -4) + 'zzzz';
    const tamperedResult = EmailTrackingService.verifySignedToken(`${dataPart}.${tamperedSig}`);
    assert.strictEqual(tamperedResult.valid, false, 'Tampered signature must be rejected');

    // 3. Tampered payload must fail
    const tamperedDataPart = Buffer.from(JSON.stringify({ ...payload, u: 'hacked_customer' })).toString('base64url');
    const tamperedPayloadResult = EmailTrackingService.verifySignedToken(`${tamperedDataPart}.${sigPart}`);
    assert.strictEqual(tamperedPayloadResult.valid, false, 'Tampered data payload must be rejected');
  });

  test('2. Send-Time Link Rewriting & Tracking Injection - converts hyperlinks and appends 1x1 pixel', () => {
    const rawHtml = `
      <div>
        <h1>Welcome!</h1>
        <p>Please check our <a href="https://apexinsurance.com/terms">Terms of Service</a>.</p>
        <p>Contact us at <a href="mailto:support@apexinsurance.com">support@apexinsurance.com</a> or <a href="#faq">FAQ</a>.</p>
        <p>To unsubscribe, click <a href="{{unsubscribe_url}}">here</a>.</p>
      </div>
    `;

    const appBaseUrl = 'https://oneai.test';
    const unsubUrl = EmailTrackingService.generateUnsubscribeUrl(appBaseUrl, {
      tenantId,
      customerId,
      campaignId,
      email: testEmail,
    });

    const transformedHtml = EmailTrackingService.rewriteHtmlAndInjectTracking(rawHtml, {
      appBaseUrl,
      tenantId,
      customerId,
      campaignId,
      email: testEmail,
      unsubscribeUrl: unsubUrl,
    });

    // 1. Standard web link is rewritten to click tracking URL
    assert.ok(
      transformedHtml.includes('/api/channels/email/track/click?'),
      'Web hyperlink must be rewritten to click tracking endpoint'
    );
    assert.ok(
      !transformedHtml.includes('href="https://apexinsurance.com/terms"'),
      'Original link href must be replaced by tracked URL'
    );

    // 2. mailto and anchor links are preserved untouched
    assert.ok(
      transformedHtml.includes('href="mailto:support@apexinsurance.com"'),
      'mailto: link must remain intact'
    );
    assert.ok(
      transformedHtml.includes('href="#faq"'),
      'Anchor link must remain intact'
    );

    // 3. Unsubscribe token placeholder is replaced by signed unsubscribe link
    assert.ok(
      transformedHtml.includes(unsubUrl),
      '{{unsubscribe_url}} placeholder must be replaced with signed unsubscribe URL'
    );

    // 4. Open tracking pixel is injected
    assert.ok(
      transformedHtml.includes('/api/channels/email/track/open?'),
      'Open tracking pixel must be injected into HTML'
    );
    assert.ok(
      transformedHtml.includes('width="1" height="1"'),
      '1x1 transparent pixel dimensions must be present'
    );
  });

  test('3. Open Tracking & De-duplication - records OPEN event and increments campaign read count', async () => {
    const initialCampaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
      select: { read: true },
    });
    const initialReads = initialCampaign?.read || 0;

    // 1. Record first open event
    await EmailTrackingService.recordEmailEvent({
      tenantId,
      email: testEmail,
      customerId,
      campaignId,
      eventType: 'OPEN',
      ipAddress: '198.51.100.1',
      userAgent: 'Mozilla/5.0 Apple Mail',
    });

    const campaignAfterFirstOpen = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
      select: { read: true },
    });
    assert.strictEqual(
      campaignAfterFirstOpen?.read,
      initialReads + 1,
      'First open event must increment campaign read count by 1'
    );

    // 2. Record second open event from same recipient (de-duplication of campaign unique opens)
    await EmailTrackingService.recordEmailEvent({
      tenantId,
      email: testEmail,
      customerId,
      campaignId,
      eventType: 'OPEN',
      ipAddress: '198.51.100.2',
    });

    const campaignAfterSecondOpen = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
      select: { read: true },
    });
    assert.strictEqual(
      campaignAfterSecondOpen?.read,
      initialReads + 1,
      'Subsequent opens from the same recipient must not double-count unique campaign reads'
    );

    // 3. Verify event records persisted in EmailEvent table
    const events = await prisma.emailEvent.findMany({
      where: { tenantId, campaignId, eventType: 'OPEN' },
    });
    assert.ok(events.length >= 2, 'Multiple open audit logs must be preserved in EmailEvent table');
  });

  test('4. Click Tracking - records CLICK event with target URL and increments engagement metrics', async () => {
    const initialCampaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
      select: { replied: true },
    });
    const initialClicks = initialCampaign?.replied || 0;

    const targetUrl = 'https://apexinsurance.com/get-quote?ref=email';

    await EmailTrackingService.recordEmailEvent({
      tenantId,
      email: testEmail,
      customerId,
      campaignId,
      eventType: 'CLICK',
      url: targetUrl,
      ipAddress: '203.0.113.42',
    });

    const updatedCampaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
      select: { replied: true },
    });
    assert.strictEqual(
      updatedCampaign?.replied,
      initialClicks + 1,
      'First click event must increment campaign engagement/click metric'
    );

    const clickEvent = await prisma.emailEvent.findFirst({
      where: { tenantId, campaignId, eventType: 'CLICK', url: targetUrl },
    });
    assert.ok(clickEvent, 'CLICK event record must be saved in database');
    assert.strictEqual(clickEvent.url, targetUrl);
  });

  test('5. Unsubscribe Flow (SEC-18, SEC-19) - safe confirmation and cryptographic suppression', async () => {
    const unsubEmail = `unsub_${testId}@example.com`;
    const unsubCustomer = await prisma.customer.create({
      data: {
        tenantId,
        displayName: 'Unsubscribe Test User',
        primaryPhone: '+15557776666',
        email: unsubEmail,
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    // 1. Generate signed unsubscribe token
    const unsubToken = EmailTrackingService.createSignedToken({
      t: tenantId,
      u: unsubCustomer.id,
      c: campaignId,
      e: unsubEmail,
      type: 'unsub',
      iat: Date.now(),
    });

    // 2. Decode token verification
    const decoded = EmailTrackingService.decodeTrackingPayload(unsubToken, 'unsub');
    assert.strictEqual(decoded.valid, true, 'Unsubscribe token must be valid');
    assert.strictEqual(decoded.data?.email, unsubEmail);

    // 3. Forged token is rejected
    const forgedToken = unsubToken.replace(/\.[^.]+$/, '.forged_signature_xyz');
    const forgedDecoded = EmailTrackingService.decodeTrackingPayload(forgedToken, 'unsub');
    assert.strictEqual(forgedDecoded.valid, false, 'Forged unsubscribe token must be rejected');

    // 4. Perform unsubscribe
    await EmailSuppressionService.suppressEmail(tenantId, unsubEmail, 'MANUAL_UNSUBSCRIBE');
    await EmailTrackingService.recordEmailEvent({
      tenantId,
      email: unsubEmail,
      customerId: unsubCustomer.id,
      campaignId,
      eventType: 'UNSUBSCRIBE',
    });

    // Verify Customer record updated to UNSUBSCRIBED
    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: unsubCustomer.id },
      select: { emailConsentStatus: true, optedOutAt: true },
    });
    assert.strictEqual(updatedCustomer?.emailConsentStatus, 'UNSUBSCRIBED');
    assert.ok(updatedCustomer?.optedOutAt, 'optedOutAt timestamp must be recorded');

    // Verify GlobalSuppression contains suppressed address
    const suppression = await EmailSuppressionService.isEmailSuppressed(tenantId, unsubEmail);
    assert.strictEqual(suppression.suppressed, true, 'Unsubscribed address must be globally suppressed');
    assert.strictEqual(suppression.reason, 'MANUAL_UNSUBSCRIBE');
  });

  test('6. Provider Webhook Signature Verification (SEC-08) - validates Svix signature', () => {
    const secret = 'whsec_MfKQ9r8GKYqrTwjUpUWDkrGhpackqqIf';
    const body = JSON.stringify({
      type: 'email.delivered',
      data: {
        email_id: `msg_svix_${testId}`,
        to: [testEmail],
      },
    });

    const msgId = `msg_${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Compute legitimate Svix signature
    const secretKey = Buffer.from(secret.slice(6), 'base64');
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(`${msgId}.${timestamp}.${body}`)
      .digest('base64');
    const svixSignatureHeader = `v1,${signature}`;

    // 1. Valid signature verifies
    const isValid = EmailTrackingService.verifySvixSignature(
      body,
      { id: msgId, timestamp, signature: svixSignatureHeader },
      secret
    );
    assert.strictEqual(isValid, true, 'Legitimate Svix webhook signature must verify');

    // 2. Tampered signature fails
    const isTamperedValid = EmailTrackingService.verifySvixSignature(
      body,
      { id: msgId, timestamp, signature: 'v1,invalid_base64_sig==' },
      secret
    );
    assert.strictEqual(isTamperedValid, false, 'Forged Svix signature must fail verification');

    // 3. Expired timestamp (> 5 min) fails
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 360).toString();
    const isExpiredValid = EmailTrackingService.verifySvixSignature(
      body,
      { id: msgId, timestamp: expiredTimestamp, signature: svixSignatureHeader },
      secret
    );
    assert.strictEqual(isExpiredValid, false, 'Expired Svix webhook (> 5 min drift) must be rejected');
  });

  test('7. Webhook Bounce Handling & Tenant Isolation (SEC-09) - hard bounce permanently suppresses', async () => {
    const bounceEmail = `bounced_${testId}@example.com`;
    const bounceCustomer = await prisma.customer.create({
      data: {
        tenantId,
        displayName: 'Bounced User',
        primaryPhone: '+15553334444',
        email: bounceEmail,
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    const providerMessageId = `msg_resend_bounce_${testId}`;
    const job = await prisma.broadcastJob.create({
      data: {
        tenantId,
        campaignId,
        customerId: bounceCustomer.id,
        recipient: bounceEmail,
        channel: 'EMAIL',
        status: 'SENT',
        providerMessageId,
        scheduledFor: new Date(),
      },
    });

    // 1. Process Hard Bounce
    await EmailTrackingService.recordEmailEvent({
      tenantId,
      email: bounceEmail,
      customerId: bounceCustomer.id,
      campaignId,
      messageId: providerMessageId,
      eventType: 'BOUNCE_HARD',
    });

    // Verify BroadcastJob is marked FAILED
    const updatedJob = await prisma.broadcastJob.findUnique({
      where: { id: job.id },
      select: { status: true, lastError: true },
    });
    assert.strictEqual(updatedJob?.status, 'FAILED');
    assert.ok(updatedJob?.lastError?.includes('Hard bounce'));

    // Verify Customer is marked BOUNCED
    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: bounceCustomer.id },
      select: { emailConsentStatus: true },
    });
    assert.strictEqual(updatedCustomer?.emailConsentStatus, 'BOUNCED');

    // Verify Recipient is suppressed
    const suppression = await EmailSuppressionService.isEmailSuppressed(tenantId, bounceEmail);
    assert.strictEqual(suppression.suppressed, true, 'Hard-bounced address must be permanently suppressed');

    // 2. Test Soft Bounce on a separate recipient (must not suppress)
    const softBounceEmail = `soft_bounce_${testId}@example.com`;
    const softCustomer = await prisma.customer.create({
      data: {
        tenantId,
        displayName: 'Soft Bounce Customer',
        primaryPhone: '+15553334445',
        email: softBounceEmail,
        optedIn: true,
        emailConsentStatus: 'SUBSCRIBED',
      },
    });

    const softJob = await prisma.broadcastJob.create({
      data: {
        tenantId,
        campaignId,
        customerId: softCustomer.id,
        recipient: softBounceEmail,
        channel: 'EMAIL',
        status: 'SENT',
        providerMessageId: `msg_soft_${testId}`,
        scheduledFor: new Date(),
      },
    });

    await EmailTrackingService.recordEmailEvent({
      tenantId,
      email: softBounceEmail,
      customerId: softCustomer.id,
      campaignId,
      messageId: `msg_soft_${testId}`,
      eventType: 'BOUNCE_SOFT',
    });

    const softSuppression = await EmailSuppressionService.isEmailSuppressed(tenantId, softBounceEmail);
    assert.strictEqual(softSuppression.suppressed, false, 'Soft-bounced address must NOT be permanently suppressed');

    const updatedSoftJob = await prisma.broadcastJob.findUnique({
      where: { id: softJob.id },
      select: { lastError: true },
    });
    assert.ok(updatedSoftJob?.lastError?.includes('Soft bounce'));
  });

  test('8. Tracking secret is mandatory - no built-in default, short values rejected', () => {
    const original = process.env.EMAIL_TRACKING_SECRET;
    try {
      delete process.env.EMAIL_TRACKING_SECRET;
      assert.throws(() => getTrackingSecret(), /EMAIL_TRACKING_SECRET/);
      process.env.EMAIL_TRACKING_SECRET = 'too-short';
      assert.throws(() => getTrackingSecret(), /EMAIL_TRACKING_SECRET/);
    } finally {
      process.env.EMAIL_TRACKING_SECRET = original;
    }
    assert.ok(getTrackingSecret().length >= 32);
  });

  test('9. A token is only valid for its own purpose (open token cannot unsubscribe or redirect)', async () => {
    const pixelUrl = EmailTrackingService.generateOpenTrackingPixelUrl(APP, tenantId, campaignId, customerId, testEmail);
    const openToken = new URL(pixelUrl).searchParams.get('token')!;

    assert.strictEqual(EmailTrackingService.decodeTrackingPayload(openToken, 'open').valid, true);
    assert.strictEqual(EmailTrackingService.decodeTrackingPayload(openToken, 'unsub').valid, false);
    assert.strictEqual(EmailTrackingService.decodeTrackingPayload(openToken, 'click').valid, false);

    const res = await unsubscribePOST(
      new Request(`${APP}/api/channels/email/unsubscribe?token=${openToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      })
    );
    assert.strictEqual(res.status, 403);
    const still = await EmailSuppressionService.isEmailSuppressed(tenantId, testEmail);
    assert.strictEqual(still.suppressed, false, 'An open token must not unsubscribe the contact');

    // Links carry exactly one signature
    assert.deepStrictEqual([...new URL(pixelUrl).searchParams.keys()], ['token']);
  });

  test('10. Unsubscribe route - GET changes nothing, forged token rejected, one-click POST unsubscribes once', async () => {
    const t = await createOtherTenant('unsubroute');
    const url = EmailTrackingService.generateUnsubscribeUrl(APP, {
      tenantId: t.tenantId,
      customerId: t.customerId,
      campaignId: t.campaignId,
      email: t.email,
    });
    const token = new URL(url).searchParams.get('token')!;

    // GET: confirmation page only
    const getRes = await unsubscribeGET(new Request(url));
    assert.strictEqual(getRes.status, 200);
    const page = await getRes.text();
    assert.ok(page.includes('Confirm Unsubscribe'));
    assert.ok(page.includes(t.email));
    const afterGet = await EmailSuppressionService.isEmailSuppressed(t.tenantId, t.email);
    assert.strictEqual(afterGet.suppressed, false, 'GET must not unsubscribe (link scanners fetch every URL)');

    // Forged token
    const forged = token.replace(/\.[^.]+$/, '.forged_signature_xyz');
    const forgedGet = await unsubscribeGET(new Request(`${APP}/api/channels/email/unsubscribe?token=${forged}`));
    assert.strictEqual(forgedGet.status, 403);
    const forgedPost = await unsubscribePOST(
      new Request(`${APP}/api/channels/email/unsubscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: forged }),
      })
    );
    assert.strictEqual(forgedPost.status, 403);
    assert.strictEqual((await EmailSuppressionService.isEmailSuppressed(t.tenantId, t.email)).suppressed, false);

    // RFC 8058 one-click: the mail client POSTs to the header URL with this exact body
    const oneClick = () =>
      unsubscribePOST(
        new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        })
      );
    assert.strictEqual((await oneClick()).status, 200);
    assert.strictEqual((await oneClick()).status, 200, 'Repeating the request must still succeed');

    const suppression = await EmailSuppressionService.isEmailSuppressed(t.tenantId, t.email);
    assert.strictEqual(suppression.suppressed, true);
    const customer = await prisma.customer.findUnique({ where: { id: t.customerId }, select: { emailConsentStatus: true } });
    assert.strictEqual(customer?.emailConsentStatus, 'UNSUBSCRIBED');

    const events = await prisma.emailEvent.count({ where: { tenantId: t.tenantId, eventType: 'UNSUBSCRIBE' } });
    assert.strictEqual(events, 1, 'A repeated unsubscribe must be recorded once');
    const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: t.campaignId }, select: { optedOut: true } });
    assert.strictEqual(campaign?.optedOut, 1);
  });

  test('11. Click route - signed link redirects and records each link; forged link never redirects off-site', async () => {
    const t = await createOtherTenant('clickroute');
    const linkA = EmailTrackingService.generateTrackingUrl(APP, {
      tenantId: t.tenantId, campaignId: t.campaignId, customerId: t.customerId, email: t.email,
      originalUrl: 'https://example.com/pricing',
    });
    const linkB = EmailTrackingService.generateTrackingUrl(APP, {
      tenantId: t.tenantId, campaignId: t.campaignId, customerId: t.customerId, email: t.email,
      originalUrl: 'https://example.com/contact',
    });

    const resA = await clickGET(new Request(linkA));
    assert.ok([302, 307].includes(resA.status));
    assert.ok(resA.headers.get('location')?.startsWith('https://example.com/pricing'));
    const resB = await clickGET(new Request(linkB));
    assert.ok(resB.headers.get('location')?.startsWith('https://example.com/contact'));

    // Forged destination: signature no longer matches, so we go to our own home page
    const token = new URL(linkA).searchParams.get('token')!;
    const [, sig] = token.split('.');
    const evilData = Buffer.from(
      JSON.stringify({ t: t.tenantId, url: 'https://evil.example/phish', type: 'click' })
    ).toString('base64url');
    const evil = await clickGET(new Request(`${APP}/api/channels/email/track/click?token=${evilData}.${sig}`));
    assert.strictEqual(evil.headers.get('location'), `${APP}/`);

    // Open pixel always returns the image, valid token or not
    const pixel = await openGET(new Request(`${APP}/api/channels/email/track/open?token=garbage`));
    assert.strictEqual(pixel.status, 200);
    assert.strictEqual(pixel.headers.get('content-type'), 'image/gif');
    await openGET(new Request(
      EmailTrackingService.generateOpenTrackingPixelUrl(APP, t.tenantId, t.campaignId, t.customerId, t.email)
    ));

    // Events are written in the background
    await waitFor(async () =>
      (await prisma.emailEvent.count({ where: { tenantId: t.tenantId, eventType: 'CLICK' } })) === 2 &&
      (await prisma.emailEvent.count({ where: { tenantId: t.tenantId, eventType: 'OPEN' } })) === 1
    );

    // "Who opened, who clicked which link"
    const clicks = await CampaignEngagementService.getEngagement(t.tenantId, t.campaignId, { type: 'CLICK' });
    assert.ok(clicks);
    assert.strictEqual(clicks.totalEvents, 2);
    assert.strictEqual(clicks.uniqueContacts, 1);
    assert.strictEqual(clicks.links.length, 2, 'Each clicked link is reported separately');
    assert.ok(clicks.links.some((l) => l.url.startsWith('https://example.com/pricing') && l.totalClicks === 1));
    assert.strictEqual(clicks.contacts[0].email, t.email);
    assert.strictEqual(clicks.contacts[0].customerId, t.customerId);
    assert.strictEqual(clicks.contacts[0].count, 2);

    const opens = await CampaignEngagementService.getEngagement(t.tenantId, t.campaignId, { type: 'OPEN' });
    assert.strictEqual(opens?.uniqueContacts, 1);
    assert.strictEqual(opens?.contacts[0].email, t.email);

    // Unique clicks on the campaign: one recipient, two links = 1
    const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: t.campaignId }, select: { replied: true, read: true } });
    assert.strictEqual(campaign?.replied, 1);
    assert.strictEqual(campaign?.read, 1);

    // Another tenant cannot read this campaign's engagement
    const foreign = await CampaignEngagementService.getEngagement(tenantId, t.campaignId, { type: 'CLICK' });
    assert.strictEqual(foreign, null);

    // Opens and clicks are not written into the inbox
    const inboxRows = await prisma.message.count({ where: { tenantId: t.tenantId } });
    assert.strictEqual(inboxRows, 0);
  });

  test('12. Webhook route - unsigned and forged requests are rejected, a valid one is recorded once', async () => {
    const t = await createOtherTenant('hook', { webhookSecret: WEBHOOK_SECRET });
    const noSecret = await createOtherTenant('hooknosecret');
    const messageId = `re_${crypto.randomUUID()}`;
    await prisma.broadcastJob.create({
      data: {
        tenantId: t.tenantId, campaignId: t.campaignId, customerId: t.customerId, recipient: t.email,
        channel: 'EMAIL', status: 'SENT', providerMessageId: messageId, scheduledFor: new Date(), processedAt: new Date(),
      },
    });
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: messageId, to: [t.email] } });
    const eventCount = () => prisma.emailEvent.count({ where: { tenantId: t.tenantId } });

    // No signature headers at all
    const unsigned = await postWebhook('resend', body, { 'content-type': 'application/json' }, t.tenantId);
    assert.strictEqual(unsigned.status, 401);

    // Signed with the wrong secret
    const wrong = await postWebhook('resend', body, svixHeaders(body, 'whsec_' + Buffer.from('attacker-secret').toString('base64')), t.tenantId);
    assert.strictEqual(wrong.status, 401);

    // Valid signature but the body was changed afterwards
    const tampered = await postWebhook('resend', body.replace('delivered', 'bounced'), svixHeaders(body, WEBHOOK_SECRET), t.tenantId);
    assert.strictEqual(tampered.status, 401);

    // Tenant with no secret saved: rejected, not silently accepted
    const unconfigured = await postWebhook('resend', body, svixHeaders(body, WEBHOOK_SECRET), noSecret.tenantId);
    assert.strictEqual(unconfigured.status, 401);

    assert.strictEqual(await eventCount(), 0, 'Rejected webhooks must leave no trace');

    // Valid
    const headers = svixHeaders(body, WEBHOOK_SECRET);
    const ok = await postWebhook('resend', body, headers, t.tenantId);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await ok.json()).processed, 'DELIVERED');

    // The provider retries the same delivery (same svix-id), twice at the same moment
    const [r1, r2] = await Promise.all([
      postWebhook('resend', body, headers, t.tenantId),
      postWebhook('resend', body, headers, t.tenantId),
    ]);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);

    assert.strictEqual(await eventCount(), 1, 'A repeated webhook must be stored once');
    const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: t.campaignId }, select: { delivered: true } });
    assert.strictEqual(campaign?.delivered, 1);

    // SES is refused outright; SendGrid needs a named tenant and a valid signature
    const ses = await postWebhook('ses', JSON.stringify({ Type: 'SubscriptionConfirmation', SubscribeURL: 'http://127.0.0.1/' }), {});
    assert.strictEqual(ses.status, 501);
    const sg = await postWebhook('sendgrid', JSON.stringify([{ event: 'bounce', email: t.email }]), {});
    assert.strictEqual(sg.status, 401);
    const sgTenant = await postWebhook('sendgrid', JSON.stringify([{ event: 'bounce', email: t.email }]), {
      'x-twilio-email-event-webhook-signature': 'AAAA',
      'x-twilio-email-event-webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
    }, t.tenantId);
    assert.strictEqual(sgTenant.status, 401);
    assert.strictEqual((await EmailSuppressionService.isEmailSuppressed(t.tenantId, t.email)).suppressed, false);
  });

  test('13. Webhook tenant isolation (SEC-09) - one tenant cannot bounce another tenant\'s contact', async () => {
    const victim = await createOtherTenant('victim', { webhookSecret: 'whsec_' + Buffer.from('victim-secret-000').toString('base64') });
    const attackerSecret = 'whsec_' + Buffer.from('attacker-secret-1').toString('base64');
    const attacker = await createOtherTenant('attacker', { webhookSecret: attackerSecret });

    const victimMessageId = `re_${crypto.randomUUID()}`;
    const victimJob = await prisma.broadcastJob.create({
      data: {
        tenantId: victim.tenantId, campaignId: victim.campaignId, customerId: victim.customerId, recipient: victim.email,
        channel: 'EMAIL', status: 'SENT', providerMessageId: victimMessageId, scheduledFor: new Date(), processedAt: new Date(),
      },
    });

    // The attacker signs correctly with their own secret but names the victim's message and address
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: victimMessageId, to: [victim.email], bounce: { type: 'Permanent' } },
    });
    const res = await postWebhook('resend', body, svixHeaders(body, attackerSecret), attacker.tenantId);
    assert.strictEqual(res.status, 200);

    const job = await prisma.broadcastJob.findUnique({ where: { id: victimJob.id }, select: { status: true } });
    assert.strictEqual(job?.status, 'SENT', "The victim's job must be untouched");
    assert.strictEqual((await EmailSuppressionService.isEmailSuppressed(victim.tenantId, victim.email)).suppressed, false);
    assert.strictEqual(await prisma.emailEvent.count({ where: { tenantId: victim.tenantId } }), 0);

    // Using the attacker's secret against the victim's URL fails the signature check
    const direct = await postWebhook('resend', body, svixHeaders(body, attackerSecret), victim.tenantId);
    assert.strictEqual(direct.status, 401);

    // Platform-wide secret: the tenant comes from the stored message ID, never from the address
    const original = process.env.RESEND_WEBHOOK_SECRET;
    try {
      delete process.env.RESEND_WEBHOOK_SECRET;
      const noEnv = await postWebhook('resend', body, svixHeaders(body, WEBHOOK_SECRET));
      assert.strictEqual(noEnv.status, 401, 'With no platform secret the endpoint must refuse');

      process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
      const unknown = JSON.stringify({
        type: 'email.bounced',
        data: { email_id: `re_unknown_${testId}`, to: [victim.email], bounce: { type: 'Permanent' } },
      });
      const ignored = await postWebhook('resend', unknown, svixHeaders(unknown, WEBHOOK_SECRET));
      assert.strictEqual((await ignored.json()).status, 'ignored_unknown_message');
      assert.strictEqual((await EmailSuppressionService.isEmailSuppressed(victim.tenantId, victim.email)).suppressed, false);

      // Known message ID: resolved to the right tenant, soft bounce does not suppress
      const soft = JSON.stringify({
        type: 'email.bounced',
        data: { email_id: victimMessageId, to: [victim.email], bounce: { type: 'Transient' } },
      });
      const softRes = await postWebhook('resend', soft, svixHeaders(soft, WEBHOOK_SECRET));
      assert.strictEqual((await softRes.json()).processed, 'BOUNCE_SOFT');
      assert.strictEqual((await EmailSuppressionService.isEmailSuppressed(victim.tenantId, victim.email)).suppressed, false);

      const hardRes = await postWebhook('resend', body, svixHeaders(body, WEBHOOK_SECRET));
      assert.strictEqual((await hardRes.json()).processed, 'BOUNCE_HARD');
      assert.strictEqual((await EmailSuppressionService.isEmailSuppressed(victim.tenantId, victim.email)).suppressed, true);
      const bounced = await prisma.broadcastJob.findUnique({ where: { id: victimJob.id }, select: { status: true } });
      assert.strictEqual(bounced?.status, 'FAILED');
    } finally {
      if (original === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = original;
    }
  });

  test('14. Sending - no DELIVERED event at send time, one-click headers present, single signature per link', async () => {
    const t = await createOtherTenant('sendpath');
    const fake = new FakeTrackingProviderAdapter();
    const transport = new EmailTransportAdapter(t.tenantId, fake);

    await transport.sendEmail({
      to: t.email,
      subject: 'Hello',
      html: '<p>Read our <a href="https://example.com/news">news</a>.</p>',
      customerId: t.customerId,
      campaignId: t.campaignId,
    });

    assert.strictEqual(fake.sentEmails.length, 1);
    const sent = fake.sentEmails[0];
    const listUnsub = sent.headers?.['List-Unsubscribe'] || '';
    assert.match(listUnsub, /^<https?:\/\/[^>]+\/api\/channels\/email\/unsubscribe\?token=[^>&]+>$/);
    assert.ok(!listUnsub.includes('mailto:'), 'No unsubscribe mailbox is advertised because none is processed');
    assert.strictEqual(sent.headers?.['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.ok(sent.html.includes('/api/channels/email/track/click?token='));
    assert.ok(!/[?&](d|s)=/.test(sent.html), 'No second (legacy) signature on links');

    // The header URL really works as a one-click unsubscribe
    const headerUrl = listUnsub.slice(1, -1);
    assert.strictEqual(EmailTrackingService.decodeTrackingPayload(new URL(headerUrl).searchParams.get('token'), 'unsub').valid, true);

    // Give any stray background write a moment, then confirm nothing claimed "delivered"
    await new Promise((r) => setTimeout(r, 1500));
    assert.strictEqual(
      await prisma.emailEvent.count({ where: { tenantId: t.tenantId, eventType: 'DELIVERED' } }),
      0,
      'Accepted by the provider is not delivered'
    );
    const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: t.campaignId }, select: { delivered: true } });
    assert.strictEqual(campaign?.delivered, 0);
  });

  test('15. Auto-pause (MKT-11) - needs real volume, one complaint never pauses, complaints over the limit do', async () => {
    const t = await createOtherTenant('complaints');
    const paused = async () =>
      (await prisma.tenantEmailConfig.findUnique({ where: { tenantId: t.tenantId }, select: { isAutoPaused: true } }))?.isAutoPaused;
    const delivered = (n: number, tag: string) =>
      prisma.emailEvent.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          tenantId: t.tenantId, email: `d_${tag}_${i}_${testId}@example.com`, eventType: 'DELIVERED' as const,
        })),
      });
    const complain = (i: number) =>
      EmailTrackingService.recordEmailEvent({
        tenantId: t.tenantId, email: `complainer_${i}_${testId}@example.com`, eventType: 'COMPLAINT',
      });

    // Small sender: 3 complaints out of 15 is not enough data to judge
    await delivered(15, 'a');
    await complain(1);
    await complain(2);
    await complain(3);
    assert.strictEqual(await paused(), false, `Below ${AUTO_PAUSE_MIN_VOLUME} emails the breaker must not trip`);

    // Enough volume, but a fresh tenant with a single complaint
    const single = await createOtherTenant('onecomplaint');
    await prisma.emailEvent.createMany({
      data: Array.from({ length: AUTO_PAUSE_MIN_VOLUME + 20 }, (_, i) => ({
        tenantId: single.tenantId, email: `d_${i}_${testId}@example.com`, eventType: 'DELIVERED' as const,
      })),
    });
    await EmailTrackingService.recordEmailEvent({
      tenantId: single.tenantId, email: `one_${testId}@example.com`, eventType: 'COMPLAINT',
    });
    assert.strictEqual(
      (await prisma.tenantEmailConfig.findUnique({ where: { tenantId: single.tenantId } }))?.isAutoPaused,
      false,
      'One complaint alone must not pause a tenant'
    );

    // First tenant now crosses the volume floor: 3 complaints of 150 = 2% > 0.3%
    await delivered(135, 'b');
    await complain(4);
    assert.strictEqual(await paused(), true);
    const config = await prisma.tenantEmailConfig.findUnique({ where: { tenantId: t.tenantId } });
    assert.ok(config?.autoPausedAt);
    assert.match(config?.autoPauseReason || '', /complaint/i);
    assert.ok((config?.complaintRate || 0) >= 0.3);

    // Sending is blocked while paused
    const transport = new EmailTransportAdapter(t.tenantId, new FakeTrackingProviderAdapter());
    await assert.rejects(
      () => transport.sendEmail({ to: t.email, subject: 'Should Fail', html: '<p>Blocked</p>' }),
      (err: Error) => err instanceof EmailDeliveryError && err.message.includes('auto-paused')
    );

    // After an admin resumes, the old complaints do not pause the tenant again
    await prisma.tenantEmailConfig.update({ where: { tenantId: t.tenantId }, data: { isAutoPaused: false, autoPauseReason: null } });
    assert.strictEqual(await EmailTrackingService.checkAutoPauseCircuitBreaker(t.tenantId), false);
  });

  test('16. Auto-pause on hard bounces alone, with no complaint', async () => {
    const t = await createOtherTenant('bounces');
    await prisma.emailEvent.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        tenantId: t.tenantId, email: `ok_${i}_${testId}@example.com`, eventType: 'DELIVERED' as const,
      })),
    });
    const isPaused = async () =>
      (await prisma.tenantEmailConfig.findUnique({ where: { tenantId: t.tenantId } }))?.isAutoPaused;

    // 5 of 120 = 4.2%: under the 5% limit
    for (let i = 0; i < 5; i++) {
      await EmailTrackingService.recordEmailEvent({
        tenantId: t.tenantId, email: `bad_${i}_${testId}@example.com`, eventType: 'BOUNCE_HARD',
      });
    }
    assert.strictEqual(await isPaused(), false);

    // 6 of 120 = 5%: paused, although nobody complained
    await EmailTrackingService.recordEmailEvent({
      tenantId: t.tenantId, email: `bad_5_${testId}@example.com`, eventType: 'BOUNCE_HARD',
    });
    assert.strictEqual(await isPaused(), true);
    const config = await prisma.tenantEmailConfig.findUnique({ where: { tenantId: t.tenantId } });
    assert.match(config?.autoPauseReason || '', /bounce/i);
    assert.strictEqual(await prisma.emailEvent.count({ where: { tenantId: t.tenantId, eventType: 'COMPLAINT' } }), 0);
  });
});
