import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { EmailSuppressionService } from './suppression';

export interface TrackingLinkParams {
  tenantId: string;
  campaignId?: string;
  customerId?: string;
  email?: string;
  originalUrl: string;
}

export type TrackingTokenType = 'open' | 'click' | 'unsub';

export interface TrackingTokenPayload {
  t: string;           // tenantId
  u?: string;          // customerId
  c?: string;          // campaignId
  e?: string;          // email
  url?: string;        // targetUrl for click
  type: TrackingTokenType;
  iat?: number;        // timestamp
}

export interface DecodedTrackingData {
  tenantId: string;
  campaignId?: string;
  customerId?: string;
  email?: string;
  targetUrl?: string;
  type: TrackingTokenType;
}

export type EmailEventKind =
  | 'DELIVERED'
  | 'OPEN'
  | 'CLICK'
  | 'BOUNCE_HARD'
  | 'BOUNCE_SOFT'
  | 'COMPLAINT'
  | 'UNSUBSCRIBE';

const MIN_TRACKING_SECRET_LENGTH = 32;

/**
 * Dedicated secret for signing open, click and unsubscribe links.
 * There is deliberately no fallback: a missing or short secret is a startup error,
 * because a guessable secret lets anyone forge unsubscribe and click links.
 */
export function getTrackingSecret(): string {
  const secret = process.env.EMAIL_TRACKING_SECRET;
  if (!secret || secret.length < MIN_TRACKING_SECRET_LENGTH) {
    throw new Error(
      `EMAIL_TRACKING_SECRET must be set to a random value of at least ${MIN_TRACKING_SECRET_LENGTH} characters.`
    );
  }
  return secret;
}

/** Call at process startup so a missing secret fails immediately, not on the first send. */
export function assertTrackingSecretConfigured(): void {
  getTrackingSecret();
}

// Auto-pause thresholds, evaluated over a rolling window (MKT-11).
export const AUTO_PAUSE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AUTO_PAUSE_MIN_VOLUME = 100;         // do not judge a tenant on fewer sends than this
export const AUTO_PAUSE_MIN_COMPLAINTS = 2;       // one complaint alone never pauses a tenant
export const AUTO_PAUSE_COMPLAINT_RATE_PCT = 0.3;
export const AUTO_PAUSE_HARD_BOUNCE_RATE_PCT = 5.0;

export class EmailTrackingService {
  /**
   * Generates a tamper-proof signed tracking token using HMAC-SHA256.
   */
  static createSignedToken(payload: TrackingTokenPayload): string {
    const secret = getTrackingSecret();
    const dataStr = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(dataStr)
      .digest('base64url');
    return `${dataStr}.${signature}`;
  }

  /**
   * Verifies and decodes a signed tracking token using constant-time comparison.
   * When expectedType is given, a token minted for another purpose is rejected
   * (an open-pixel token cannot be replayed against the unsubscribe endpoint).
   */
  static verifySignedToken(
    token: string | null | undefined,
    expectedType?: TrackingTokenType
  ): { valid: boolean; data?: TrackingTokenPayload } {
    if (!token || typeof token !== 'string') return { valid: false };
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };

    const [dataStr, signature] = parts;
    // A missing secret must surface as an error, not as "invalid token".
    const secret = getTrackingSecret();

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataStr)
        .digest('base64url');

      const sigBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expectedSignature);

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return { valid: false };
      }

      const rawJson = Buffer.from(dataStr, 'base64url').toString('utf-8');
      const parsed: TrackingTokenPayload = JSON.parse(rawJson);
      if (!parsed || typeof parsed.t !== 'string' || !parsed.t) return { valid: false };
      if (expectedType && parsed.type !== expectedType) return { valid: false };
      return { valid: true, data: parsed };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Verifies a tracking token of the given type and returns its fields by name.
   */
  static decodeTrackingPayload(
    token: string | null | undefined,
    expectedType: TrackingTokenType
  ): { valid: boolean; data?: DecodedTrackingData } {
    const res = this.verifySignedToken(token, expectedType);
    if (!res.valid || !res.data) return { valid: false };
    return {
      valid: true,
      data: {
        tenantId: res.data.t,
        campaignId: res.data.c,
        customerId: res.data.u,
        email: res.data.e,
        targetUrl: res.data.url,
        type: res.data.type,
      },
    };
  }

  /**
   * Generates a signed click-tracking URL with automatic UTM tags.
   */
  static generateTrackingUrl(appBaseUrl: string, params: TrackingLinkParams): string {
    const { tenantId, campaignId, customerId, email, originalUrl } = params;

    // Attach automatic UTM tagging if originalUrl doesn't have it
    let targetWithUtm = originalUrl;
    try {
      const parsed = new URL(originalUrl);
      if (!parsed.searchParams.has('utm_source')) {
        parsed.searchParams.set('utm_source', 'oneaiassist_email');
        parsed.searchParams.set('utm_medium', 'email');
        if (campaignId) parsed.searchParams.set('utm_campaign', campaignId);
      }
      targetWithUtm = parsed.toString();
    } catch {
      // Keep originalUrl if relative or unparseable
    }

    const token = this.createSignedToken({
      t: tenantId,
      c: campaignId || undefined,
      u: customerId || undefined,
      e: email || undefined,
      url: targetWithUtm,
      type: 'click',
      iat: Date.now(),
    });

    return `${appBaseUrl}/api/channels/email/track/click?token=${token}`;
  }

  /**
   * Generates a signed 1x1 open-tracking pixel URL.
   */
  static generateOpenTrackingPixelUrl(
    appBaseUrl: string,
    tenantId: string,
    campaignId?: string,
    customerId?: string,
    email?: string
  ): string {
    const token = this.createSignedToken({
      t: tenantId,
      c: campaignId || undefined,
      u: customerId || undefined,
      e: email || undefined,
      type: 'open',
      iat: Date.now(),
    });

    return `${appBaseUrl}/api/channels/email/track/open?token=${token}`;
  }

  /**
   * Generates a signed unsubscribe URL (RFC 8058 & CAN-SPAM compliant).
   */
  static generateUnsubscribeUrl(
    appBaseUrl: string,
    params: {
      tenantId: string;
      customerId?: string;
      campaignId?: string;
      email: string;
    }
  ): string {
    const token = this.createSignedToken({
      t: params.tenantId,
      u: params.customerId || undefined,
      c: params.campaignId || undefined,
      e: params.email,
      type: 'unsub',
      iat: Date.now(),
    });

    return `${appBaseUrl}/api/channels/email/unsubscribe?token=${token}`;
  }

  /**
   * Rewrites all hyperlinks in the email HTML to signed click tracking URLs,
   * replaces {{unsubscribe_url}} placeholders with the signed unsubscribe link,
   * and appends the 1x1 open tracking pixel.
   */
  static rewriteHtmlAndInjectTracking(
    html: string,
    params: {
      appBaseUrl: string;
      tenantId: string;
      customerId?: string;
      campaignId?: string;
      email: string;
      unsubscribeUrl: string;
    }
  ): string {
    const { appBaseUrl, tenantId, customerId, campaignId, email, unsubscribeUrl } = params;

    // 1. Replace {{unsubscribe_url}} or %unsubscribe_url% tokens with signed unsubscribe URL
    let processedHtml = html
      .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsubscribeUrl)
      .replace(/%unsubscribe_url%/gi, unsubscribeUrl);

    // 2. Rewrite <a> tags with http/https destinations
    processedHtml = processedHtml.replace(
      /<a\b([^>]*?)\bhref=(["'])(.*?)\2([^>]*)>/gi,
      (match, prefix, quote, originalHref, suffix) => {
        const trimmed = (originalHref || '').trim();

        // Skip non-http URLs, anchors, mailto, tel, or URLs already pointing to our tracking endpoints
        if (
          !trimmed.startsWith('http://') &&
          !trimmed.startsWith('https://')
        ) {
          return match;
        }

        if (trimmed.includes('/api/channels/email/unsubscribe')) {
          // An unsubscribe link without a signed token would be rejected, so it is replaced with the signed one.
          if (/[?&]token=/.test(trimmed)) return match;
          return `<a${prefix}href=${quote}${unsubscribeUrl}${quote}${suffix}>`;
        }

        if (trimmed.includes('/api/channels/email/track/')) {
          return match;
        }

        const clickTrackingUrl = this.generateTrackingUrl(appBaseUrl, {
          tenantId,
          campaignId,
          customerId,
          email,
          originalUrl: trimmed,
        });

        return `<a${prefix}href=${quote}${clickTrackingUrl}${quote}${suffix}>`;
      }
    );

    // 3. Append 1x1 invisible open tracking pixel
    const pixelUrl = this.generateOpenTrackingPixelUrl(
      appBaseUrl,
      tenantId,
      campaignId,
      customerId,
      email
    );
    const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" style="display:none !important;" alt="" />`;

    if (processedHtml.includes('</body>')) {
      return processedHtml.replace('</body>', `${pixelHtml}</body>`);
    }
    return `${processedHtml}${pixelHtml}`;
  }

  /**
   * Verifies standard Svix webhook signature (used by Resend).
   * Svix headers: svix-id, svix-timestamp, svix-signature (format: "v1,<base64>").
   */
  static verifySvixSignature(
    rawBody: string,
    headers: { id?: string | null; timestamp?: string | null; signature?: string | null },
    secret: string
  ): boolean {
    try {
      const msgId = headers.id;
      const msgTimestamp = headers.timestamp;
      const msgSignature = headers.signature;

      if (!msgId || !msgTimestamp || !msgSignature || !secret) {
        return false;
      }

      // Check timestamp drift (5 minutes tolerance)
      const timestampSec = Number.parseInt(msgTimestamp, 10);
      if (Number.isNaN(timestampSec)) return false;
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - timestampSec) > 300) {
        return false;
      }

      // Secret may start with "whsec_"
      const cleanedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
      const secretBytes = Buffer.from(cleanedSecret, 'base64');
      const payloadToSign = `${msgId}.${msgTimestamp}.${rawBody}`;

      const computedSig = crypto
        .createHmac('sha256', secretBytes)
        .update(payloadToSign)
        .digest('base64');

      // The signature header can contain multiple space-separated signatures (e.g. "v1,abc v1,def")
      const passedSignatures = msgSignature.split(' ');
      for (const sigItem of passedSignatures) {
        const [version, sig] = sigItem.split(',');
        if (version === 'v1' && sig) {
          const sigBuf = Buffer.from(sig);
          const compBuf = Buffer.from(computedSig);
          if (sigBuf.length === compBuf.length && crypto.timingSafeEqual(sigBuf, compBuf)) {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Verifies a SendGrid Signed Event Webhook (ECDSA P-256 over timestamp + raw body).
   * publicKey is the base64 verification key shown in the SendGrid mail settings.
   */
  static verifySendGridSignature(
    rawBody: string,
    headers: { signature?: string | null; timestamp?: string | null },
    publicKey: string
  ): boolean {
    try {
      if (!headers.signature || !headers.timestamp || !publicKey) return false;

      const timestampSec = Number.parseInt(headers.timestamp, 10);
      if (Number.isNaN(timestampSec)) return false;
      if (Math.abs(Math.floor(Date.now() / 1000) - timestampSec) > 300) return false;

      const pem = publicKey.includes('BEGIN PUBLIC KEY')
        ? publicKey
        : `-----BEGIN PUBLIC KEY-----\n${publicKey.trim()}\n-----END PUBLIC KEY-----`;

      const verifier = crypto.createVerify('sha256');
      verifier.update(headers.timestamp + rawBody);
      verifier.end();
      return verifier.verify(pem, headers.signature, 'base64');
    } catch {
      return false;
    }
  }

  /**
   * Evaluates complaint and hard-bounce rates over a rolling 24-hour window and
   * pauses the tenant's sending when a threshold is exceeded (MKT-11).
   * Returns true when the tenant is paused after the check.
   */
  static async checkAutoPauseCircuitBreaker(tenantId: string, now: Date = new Date()): Promise<boolean> {
    const config = await prisma.tenantEmailConfig.findUnique({
      where: { tenantId },
      select: { isAutoPaused: true, autoPausedAt: true },
    });
    if (!config) return false;
    if (config.isAutoPaused) return true;

    // After an admin resumes sending, only events newer than the last pause count,
    // otherwise the same old complaints would re-pause the tenant immediately.
    let windowStart = new Date(now.getTime() - AUTO_PAUSE_WINDOW_MS);
    if (config.autoPausedAt && config.autoPausedAt > windowStart) {
      windowStart = config.autoPausedAt;
    }

    const [acceptedJobs, deliveredEvents, complaintCount, hardBounceCount] = await Promise.all([
      // Emails the provider accepted in the window (bounced jobs keep their provider message ID).
      prisma.broadcastJob.count({
        where: {
          tenantId,
          channel: 'EMAIL',
          providerMessageId: { not: null },
          processedAt: { gte: windowStart },
        },
      }),
      prisma.emailEvent.count({
        where: { tenantId, eventType: 'DELIVERED', createdAt: { gte: windowStart } },
      }),
      prisma.emailEvent.count({
        where: { tenantId, eventType: 'COMPLAINT', createdAt: { gte: windowStart } },
      }),
      prisma.emailEvent.count({
        where: { tenantId, eventType: 'BOUNCE_HARD', createdAt: { gte: windowStart } },
      }),
    ]);

    const volume = Math.max(acceptedJobs, deliveredEvents);
    if (volume < AUTO_PAUSE_MIN_VOLUME) return false;

    const complaintRate = (complaintCount / volume) * 100;
    const bounceRate = (hardBounceCount / volume) * 100;

    let reason: string | null = null;
    if (complaintCount >= AUTO_PAUSE_MIN_COMPLAINTS && complaintRate >= AUTO_PAUSE_COMPLAINT_RATE_PCT) {
      reason = `Spam complaint rate ${complaintRate.toFixed(2)}% (${complaintCount} of ${volume} emails in 24h) reached the ${AUTO_PAUSE_COMPLAINT_RATE_PCT}% limit.`;
    } else if (bounceRate >= AUTO_PAUSE_HARD_BOUNCE_RATE_PCT) {
      reason = `Hard bounce rate ${bounceRate.toFixed(2)}% (${hardBounceCount} of ${volume} emails in 24h) reached the ${AUTO_PAUSE_HARD_BOUNCE_RATE_PCT}% limit.`;
    }

    if (!reason) {
      await prisma.tenantEmailConfig.updateMany({
        where: { tenantId },
        data: { complaintRate: Number(complaintRate.toFixed(3)) },
      });
      return false;
    }

    await prisma.tenantEmailConfig.updateMany({
      where: { tenantId },
      data: {
        complaintRate: Number(complaintRate.toFixed(3)),
        isAutoPaused: true,
        autoPausedAt: now,
        autoPauseReason: reason,
      },
    });
    return true;
  }

  /**
   * Records one email event and applies its side effects: campaign counters,
   * suppression, job status and the auto-pause check.
   *
   * providerEventId is the provider's own unique ID for a webhook delivery. When it is
   * given, a repeated delivery of the same webhook is ignored (enforced by a unique index,
   * so two concurrent deliveries cannot both be saved). Returns recorded=false in that case.
   */
  static async recordEmailEvent(params: {
    tenantId: string;
    email: string;
    eventType: EmailEventKind;
    messageId?: string;
    providerEventId?: string;
    customerId?: string;
    campaignId?: string;
    url?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<{ recorded: boolean }> {
    const {
      tenantId,
      eventType,
      messageId,
      providerEventId,
      customerId,
      campaignId,
      url,
      ipAddress,
      userAgent,
      metadata,
    } = params;

    const cleanEmail = (params.email || '').trim().toLowerCase();

    // 1. Resolve customer if not passed directly
    let targetCustomerId = customerId;
    if (!targetCustomerId && cleanEmail) {
      const cust = await prisma.customer.findFirst({
        where: { tenantId, email: cleanEmail },
        select: { id: true },
      });
      if (cust) targetCustomerId = cust.id;
    }

    // 2. Persist the event and update the campaign counters in one transaction.
    //    A duplicate provider event violates the unique index and is dropped.
    const eventData: Prisma.EmailEventUncheckedCreateInput = {
      tenantId,
      email: cleanEmail || 'unknown',
      eventType,
      messageId: messageId || null,
      providerEventId: providerEventId || null,
      customerId: targetCustomerId || null,
      campaignId: campaignId || null,
      url: url || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      metadata: metadata ?? undefined,
    };

    // Opens, clicks and opt-outs count each recipient once per campaign.
    const countedOncePerRecipient =
      eventType === 'OPEN' || eventType === 'CLICK' || eventType === 'UNSUBSCRIBE' || eventType === 'COMPLAINT';

    try {
      if (!campaignId) {
        await prisma.emailEvent.create({ data: eventData, select: { id: true } });
      } else {
        await prisma.$transaction(async (tx) => {
          let isFirstForRecipient = true;
          if (countedOncePerRecipient) {
            // Two events for the same recipient can arrive at the same moment (a mail client
            // loading the pixel twice, a double click). The lock makes them take turns, so
            // exactly one of them is "first" and the counter is raised exactly once.
            const lockKey = `${campaignId}:${eventType}:${targetCustomerId || cleanEmail}`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
            const earlier = await tx.emailEvent.count({
              where: {
                tenantId,
                campaignId,
                eventType,
                ...(targetCustomerId ? { customerId: targetCustomerId } : { email: cleanEmail }),
              },
            });
            isFirstForRecipient = earlier === 0;
          }

          await tx.emailEvent.create({ data: eventData, select: { id: true } });

          let counter: Prisma.BroadcastCampaignUpdateManyMutationInput | null = null;
          if (eventType === 'DELIVERED') counter = { delivered: { increment: 1 } };
          else if (eventType === 'BOUNCE_HARD') counter = { failed: { increment: 1 } };
          else if (isFirstForRecipient) {
            if (eventType === 'OPEN') counter = { read: { increment: 1 } };
            // BroadcastCampaign has no click column; "replied" holds unique clicks for email campaigns.
            else if (eventType === 'CLICK') counter = { replied: { increment: 1 } };
            else if (eventType === 'UNSUBSCRIBE' || eventType === 'COMPLAINT') counter = { optedOut: { increment: 1 } };
          }

          if (counter) {
            await tx.broadcastCampaign.updateMany({ where: { id: campaignId, tenantId }, data: counter });
          }
        });
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { recorded: false };
      }
      throw err;
    }

    // 4. Suppression, job status and circuit breaker
    if (eventType === 'BOUNCE_HARD') {
      if (cleanEmail) await EmailSuppressionService.suppressEmail(tenantId, cleanEmail, 'HARD_BOUNCE');
      if (messageId) {
        await prisma.broadcastJob.updateMany({
          where: { tenantId, providerMessageId: messageId },
          data: { status: 'FAILED', lastError: 'Hard bounce: recipient address rejected' },
        });
      }
      await this.checkAutoPauseCircuitBreaker(tenantId);
    } else if (eventType === 'BOUNCE_SOFT') {
      if (messageId) {
        await prisma.broadcastJob.updateMany({
          where: { tenantId, providerMessageId: messageId },
          data: { lastError: 'Soft bounce: temporary delivery failure' },
        });
      }
    } else if (eventType === 'COMPLAINT') {
      if (cleanEmail) await EmailSuppressionService.suppressEmail(tenantId, cleanEmail, 'COMPLAINT');
      await this.checkAutoPauseCircuitBreaker(tenantId);
    } else if (eventType === 'UNSUBSCRIBE') {
      if (cleanEmail) await EmailSuppressionService.suppressEmail(tenantId, cleanEmail, 'MANUAL_UNSUBSCRIBE');
    }

    // 5. Contact timeline. Only rare, important events are written here; opens and clicks
    //    live in EmailEvent, because one row per open would flood the inbox on a large campaign.
    const timelineText: Partial<Record<EmailEventKind, string>> = {
      BOUNCE_HARD: '⚠️ Email bounced permanently (Hard Bounce). Contact auto-suppressed.',
      COMPLAINT: '🚫 Spam complaint reported. Contact auto-suppressed.',
      UNSUBSCRIBE: '🔕 Contact unsubscribed from marketing emails.',
    };
    const text = timelineText[eventType];

    if (text && targetCustomerId) {
      let conversation = await prisma.conversation.findFirst({
        where: { tenantId, customerId: targetCustomerId, channel: 'EMAIL' },
        select: { id: true },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { tenantId, customerId: targetCustomerId, channel: 'EMAIL', status: 'OPEN' },
          select: { id: true },
        });
      }

      await prisma.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          direction: 'INBOUND',
          senderType: 'BOT',
          content: text,
          channel: 'EMAIL',
        },
      });
    }

    return { recorded: true };
  }
}
