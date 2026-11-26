import { NextResponse } from 'next/server';
import { EmailTrackingService, type EmailEventKind } from '@/lib/email/tracking';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

/**
 * Email provider webhooks (SEC-08, SEC-09).
 *
 * Every request must carry a valid provider signature. There is no unsigned mode:
 * if no signing secret is configured the request is rejected.
 *
 * Tenants who use their own provider account register this URL with their tenant ID:
 *   /api/channels/email/webhook/resend?tenant=<tenantId>
 * and save that account's signing secret in Settings > Email. The signature then proves
 * which tenant the events belong to.
 *
 * Without ?tenant=, the platform-wide RESEND_WEBHOOK_SECRET is used and an event is only
 * accepted if its message ID matches an email this platform sent (BroadcastJob.providerMessageId).
 * The tenant is never guessed from the recipient address.
 */

type JobRef = { tenantId: string; campaignId: string; customerId: string };

async function loadTenantWebhookSecret(tenantId: string): Promise<string | null> {
  const config = await prisma.tenantEmailConfig.findUnique({
    where: { tenantId },
    select: { encryptedWebhookSecret: true },
  });
  if (!config?.encryptedWebhookSecret) return null;
  try {
    return decrypt(config.encryptedWebhookSecret);
  } catch {
    return null;
  }
}

async function findJob(messageId: string | undefined, tenantId?: string): Promise<JobRef | null> {
  if (!messageId) return null;
  return prisma.broadcastJob.findFirst({
    where: { providerMessageId: messageId, channel: 'EMAIL', ...(tenantId ? { tenantId } : {}) },
    select: { tenantId: true, campaignId: true, customerId: true },
  });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

async function handleResend(req: Request, rawBody: string, tenantParam: string | null) {
  const secret = tenantParam
    ? await loadTenantWebhookSecret(tenantParam)
    : process.env.RESEND_WEBHOOK_SECRET || null;

  if (!secret) return unauthorized('Webhook signing secret is not configured');

  const svixId = req.headers.get('svix-id');
  const isValid = EmailTrackingService.verifySvixSignature(
    rawBody,
    { id: svixId, timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
    secret
  );
  if (!isValid) return unauthorized('Invalid webhook signature');

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const data = payload?.data || {};
  const recipient: string | undefined = Array.isArray(data.to) ? data.to[0] : data.to || data.email;
  const messageId: string | undefined = data.email_id || data.id;

  const job = await findJob(messageId, tenantParam || undefined);
  const tenantId = tenantParam || job?.tenantId;
  if (!tenantId) {
    // Signed by the platform account but not an email we know: nothing to attach it to.
    return NextResponse.json({ status: 'ignored_unknown_message' });
  }

  let mappedType: EmailEventKind | null = null;
  switch (payload.type) {
    case 'email.delivered':
      mappedType = 'DELIVERED';
      break;
    case 'email.opened':
      mappedType = 'OPEN';
      break;
    case 'email.clicked':
      mappedType = 'CLICK';
      break;
    case 'email.complained':
      mappedType = 'COMPLAINT';
      break;
    case 'email.bounced': {
      // Only a permanent failure suppresses the address for good.
      const bounceType = String(data.bounce?.type || '').toLowerCase();
      mappedType = bounceType === '' || bounceType === 'permanent' ? 'BOUNCE_HARD' : 'BOUNCE_SOFT';
      break;
    }
  }

  if (!mappedType) return NextResponse.json({ success: true, processed: null });

  const result = await EmailTrackingService.recordEmailEvent({
    tenantId,
    email: recipient || '',
    eventType: mappedType,
    messageId,
    providerEventId: `resend:${svixId}`,
    campaignId: job?.campaignId,
    customerId: job?.customerId,
    url: data.click?.link,
    metadata: payload,
  });

  return NextResponse.json({ success: true, processed: mappedType, duplicate: !result.recorded });
}

async function handleSendGrid(req: Request, rawBody: string, tenantParam: string | null) {
  // SendGrid signs with a key that belongs to one account, so the tenant must be named.
  if (!tenantParam) return unauthorized('SendGrid webhooks require ?tenant=<tenantId>');

  const verificationKey = await loadTenantWebhookSecret(tenantParam);
  if (!verificationKey) return unauthorized('Webhook signing secret is not configured');

  const isValid = EmailTrackingService.verifySendGridSignature(
    rawBody,
    {
      signature: req.headers.get('x-twilio-email-event-webhook-signature'),
      timestamp: req.headers.get('x-twilio-email-event-webhook-timestamp'),
    },
    verificationKey
  );
  if (!isValid) return unauthorized('Invalid webhook signature');

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const events: any[] = Array.isArray(payload) ? payload : [payload];
  let processedCount = 0;

  for (const ev of events) {
    let mappedType: EmailEventKind | null = null;
    if (ev.event === 'delivered') mappedType = 'DELIVERED';
    else if (ev.event === 'open') mappedType = 'OPEN';
    else if (ev.event === 'click') mappedType = 'CLICK';
    else if (ev.event === 'bounce') mappedType = ev.type === 'blocked' ? 'BOUNCE_SOFT' : 'BOUNCE_HARD';
    else if (ev.event === 'spamreport') mappedType = 'COMPLAINT';
    else if (ev.event === 'unsubscribe') mappedType = 'UNSUBSCRIBE';
    if (!mappedType) continue;

    // sg_message_id is "<x-message-id>.<suffix>"; we stored the x-message-id part at send time.
    const messageId: string | undefined =
      typeof ev.sg_message_id === 'string' ? ev.sg_message_id.split('.')[0] : undefined;
    const job = await findJob(messageId, tenantParam);

    const result = await EmailTrackingService.recordEmailEvent({
      tenantId: tenantParam,
      email: ev.email || '',
      eventType: mappedType,
      messageId,
      providerEventId: ev.sg_event_id ? `sendgrid:${ev.sg_event_id}` : undefined,
      campaignId: job?.campaignId,
      customerId: job?.customerId,
      url: ev.url,
      metadata: ev,
    });
    if (result.recorded) processedCount++;
  }

  return NextResponse.json({ success: true, count: processedCount });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const normalizedProvider = (provider || '').toLowerCase();
    const tenantParam = new URL(req.url).searchParams.get('tenant');
    // The signature is computed over the exact bytes received, so read the body as text first.
    const rawBody = await req.text();

    if (normalizedProvider === 'resend') return await handleResend(req, rawBody, tenantParam);
    if (normalizedProvider === 'sendgrid') return await handleSendGrid(req, rawBody, tenantParam);

    if (normalizedProvider === 'ses' || normalizedProvider === 'amazon_ses') {
      // Amazon SNS message signatures are not verified yet, so these events cannot be trusted.
      // Rejecting is safer than accepting unsigned bounces that would suppress real contacts.
      return NextResponse.json(
        { error: 'Amazon SES webhooks are not accepted: SNS signature verification is not implemented.' },
        { status: 501 }
      );
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  } catch (err: unknown) {
    console.error('[Email Webhook] Error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
