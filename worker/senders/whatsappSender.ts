import type { BroadcastJob } from '@prisma/client';
import { prisma } from '@/lib/db';
import { WhatsAppConnectionError, WhatsAppConnectionService } from '@/lib/whatsapp/connection';
import { MetaGraphError, sendTemplateMessage, type FetchLike } from '@/lib/whatsapp/metaGraph';
import { buildTemplateMessage, toWhatsAppRecipient } from '@/lib/whatsapp/templateSend';
import { recountCampaign } from '@/lib/whatsapp/deliveryTracking';

export const WHATSAPP_RETRY_BACKOFF_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 hours
];
const MAX_ATTEMPTS = 5;

export interface WhatsAppSenderDeps {
  fetchImpl?: FetchLike;
  backoffMs?: number[];
  now?: () => Date;
}

/**
 * Meta error codes that mean "nothing in this campaign can be sent right now" (bad token, account
 * restricted, template no longer usable). The campaign is paused so the remaining contacts are not
 * all marked as failed for a problem that has nothing to do with them.
 */
const CAMPAIGN_LEVEL_CODES = new Set([190, 10, 200, 131031, 131042, 131045, 132001, 132015, 132016, 133010]);
/** Temporary limits: try this contact again later. */
const RETRYABLE_CODES = new Set([4, 80007, 130429, 131048, 131056, 131016, 131000, 133004]);

const CAMPAIGN_LEVEL_HINT: Record<number, string> = {
  190: 'The WhatsApp access token is no longer valid. Enter a new token in Settings > WhatsApp, then resume the campaign.',
  131031: 'Meta has restricted or locked this WhatsApp Business Account. Check the account in Meta Business Manager.',
  131042: 'Meta reports a payment problem on this WhatsApp Business Account. Fix the payment method in Meta Business Manager, then resume.',
  131045: 'This phone number is not fully registered with Meta. Complete the registration, then resume.',
  132001: 'Meta no longer has this template (or this language of it). Sync templates and choose an approved one.',
  132015: 'Meta paused this template because of low quality. It cannot be sent until Meta un-pauses it.',
  132016: 'Meta disabled this template. Create and submit a new template.',
  133010: 'This phone number is not registered with the WhatsApp Cloud API. Register it in Meta, then resume.',
};

async function finishJob(
  jobId: string,
  status: 'SENT' | 'FAILED' | 'SKIPPED_OPTED_OUT' | 'SKIPPED_INVALID' | 'CANCELLED',
  now: Date,
  extra: { lastError?: string | null; providerMessageId?: string | null } = {}
) {
  await prisma.broadcastJob.update({
    where: { id: jobId },
    data: {
      status,
      processedAt: now,
      lockedAt: null,
      lockedBy: null,
      lastError: extra.lastError ?? null,
      ...(extra.providerMessageId !== undefined ? { providerMessageId: extra.providerMessageId } : {}),
    },
  });
}

async function releaseJob(jobId: string, scheduledFor: Date, lastError: string, undoAttempt = false) {
  await prisma.broadcastJob.update({
    where: { id: jobId },
    data: {
      status: 'PENDING',
      scheduledFor,
      lastError,
      lockedAt: null,
      lockedBy: null,
      // A campaign-level stop is not this contact's failed attempt.
      ...(undoAttempt ? { attempts: { decrement: 1 } } : {}),
    },
  });
}

/** Sends one claimed WhatsApp job (a broadcast, or one step of an automation) through the official Cloud API. */
export async function sendWhatsAppJob(job: BroadcastJob, deps: WhatsAppSenderDeps = {}): Promise<void> {
  await sendOne(job, deps);
  // An automation step has no "finish" moment where its totals are written, so keep them current here.
  try {
    const campaign = await prisma.broadcastCampaign.findFirst({ where: { id: job.campaignId, tenantId: job.tenantId }, select: { kind: true } });
    if (campaign?.kind === 'JOURNEY') await recountCampaign(job.tenantId, job.campaignId);
  } catch (err) {
    console.error(`[WhatsApp sender] Could not update totals for campaign ${job.campaignId}:`, err instanceof Error ? err.message : err);
  }
}

async function sendOne(job: BroadcastJob, deps: WhatsAppSenderDeps): Promise<void> {
  const nowFn = deps.now || (() => new Date());
  const backoff = deps.backoffMs || WHATSAPP_RETRY_BACKOFF_MS;

  const campaign = await prisma.broadcastCampaign.findFirst({
    where: { id: job.campaignId, tenantId: job.tenantId },
    include: { template: true },
  });
  if (!campaign) {
    await finishJob(job.id, 'FAILED', nowFn(), { lastError: 'Campaign not found' });
    return;
  }
  if (campaign.status === 'CANCELLED') {
    await finishJob(job.id, 'CANCELLED', nowFn());
    return;
  }
  if (campaign.status !== 'SENDING') {
    // Paused (or otherwise stopped) while this job was being claimed: hand it back untouched.
    await releaseJob(job.id, job.scheduledFor, job.lastError || '', true);
    return;
  }

  const pauseCampaign = async (reason: string) => {
    await prisma.broadcastCampaign.updateMany({
      where: { id: campaign.id, tenantId: job.tenantId, status: 'SENDING' },
      data: { status: 'PAUSED', lastError: reason },
    });
    await releaseJob(job.id, job.scheduledFor, reason, true);
  };

  // The template must still be one Meta approved, at the moment of sending.
  const template = campaign.template;
  if (!template || template.channel !== 'WHATSAPP' || template.status !== 'APPROVED' || !template.metaTemplateId) {
    await pauseCampaign(
      template
        ? `The template "${template.name}" is no longer approved by Meta (status: ${template.status}). Choose an approved template or wait for approval, then resume.`
        : 'The template for this campaign was deleted.'
    );
    return;
  }

  const customer = await prisma.customer.findFirst({ where: { id: job.customerId, tenantId: job.tenantId } });
  if (!customer) {
    await finishJob(job.id, 'SKIPPED_INVALID', nowFn(), { lastError: 'Contact no longer exists' });
    return;
  }
  // Consent is checked again now, not only when the audience was built.
  if (customer.optedOutAt !== null || !customer.optedIn) {
    await finishJob(job.id, 'SKIPPED_OPTED_OUT', nowFn(), { lastError: 'Contact has not opted in to WhatsApp, or has opted out' });
    return;
  }

  const recipient = toWhatsAppRecipient(job.recipient) || toWhatsAppRecipient(customer.primaryPhone);
  if (!recipient) {
    await finishJob(job.id, 'SKIPPED_INVALID', nowFn(), { lastError: 'Missing or invalid phone number' });
    return;
  }

  const built = buildTemplateMessage(template, {
    displayName: customer.displayName,
    email: customer.email,
    phone: recipient,
    customFields: customer.customFields,
  });
  if (!built.ok) {
    // No placeholder is ever sent in place of a missing value.
    await finishJob(job.id, 'SKIPPED_INVALID', nowFn(), { lastError: built.reason });
    return;
  }

  let credentials;
  try {
    credentials = await WhatsAppConnectionService.getCredentials(job.tenantId);
  } catch (err) {
    await pauseCampaign(err instanceof WhatsAppConnectionError ? err.message : 'The WhatsApp connection could not be read.');
    return;
  }

  try {
    const { messageId } = await sendTemplateMessage(
      {
        phoneNumberId: credentials.phoneNumberId,
        accessToken: credentials.accessToken,
        to: recipient,
        templateName: template.name,
        language: template.language,
        components: built.components,
      },
      deps.fetchImpl
    );

    await finishJob(job.id, 'SENT', nowFn(), { providerMessageId: messageId });

    // Record what was sent in the contact's conversation, so it shows in the inbox and so
    // delivery and read updates from Meta can be matched to it.
    try {
      let conversation = await prisma.conversation.findFirst({
        where: { tenantId: job.tenantId, customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN' },
        select: { id: true },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { tenantId: job.tenantId, customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN', lastMessageAt: nowFn() },
          select: { id: true },
        });
      } else {
        await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: nowFn() } });
      }
      await prisma.message.create({
        data: {
          tenantId: job.tenantId,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          senderType: 'BOT',
          content: built.renderedText,
          channel: 'WHATSAPP',
          channelMessageId: messageId,
          status: 'SENT',
        },
      });
    } catch (logErr) {
      // The message was sent; failing to log it must not turn the job into a failure or a resend.
      console.error(`[WhatsApp sender] Sent job ${job.id} but could not record it in the inbox:`, logErr instanceof Error ? logErr.message : logErr);
    }
  } catch (err) {
    const meta = err instanceof MetaGraphError ? err : null;
    const message = meta ? meta.message : err instanceof Error ? err.message : 'Unknown error while sending';
    const code = meta?.code ?? null;

    if (code !== null && CAMPAIGN_LEVEL_CODES.has(code)) {
      await pauseCampaign(`${CAMPAIGN_LEVEL_HINT[code] || 'Meta refused to send for this account.'} (${message})`);
      return;
    }

    const temporary =
      !meta || meta.httpStatus === 0 || meta.httpStatus === 429 || meta.httpStatus >= 500 || (code !== null && RETRYABLE_CODES.has(code));
    if (temporary && job.attempts < MAX_ATTEMPTS) {
      const delayIdx = Math.min(Math.max(0, job.attempts - 1), backoff.length - 1);
      await releaseJob(job.id, new Date(nowFn().getTime() + backoff[delayIdx]), message);
      return;
    }
    await finishJob(job.id, 'FAILED', nowFn(), { lastError: message });
  }
}
