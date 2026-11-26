import type { BroadcastJob } from '@prisma/client';
import { prisma } from '@/lib/db';
import { EmailSuppressionService } from '@/lib/email/suppression';
import { EmailDeliveryError, EmailTransportAdapter } from '@/lib/email/EmailTransportAdapter';
import { renderCampaignEmailContent } from '@/lib/email/dispatchCampaign';
import type { IEmailProviderAdapter } from '@/lib/email/types';

export const RETRY_BACKOFF_MS = [
  60_000,         // 1 min
  5 * 60_000,     // 5 min
  30 * 60_000,    // 30 min
  2 * 60 * 60_000 // 2 hours
];

export interface EmailSenderDeps {
  adapterOverride?: IEmailProviderAdapter;
  appOrigin?: string;
  backoffMs?: number[];
  now?: () => Date;
}

export async function resolveJobVariantPayload(
  campaign: any,
  job: Pick<BroadcastJob, 'variant' | 'tenantId'>
): Promise<{
  effectiveVariant: 'A' | 'B';
  subject: string;
  senderName?: string | null;
  templateId?: string | null;
  htmlContent: string;
  template: any;
}> {
  const isVariantB =
    job.variant === 'B' ||
    (job.variant === 'REMAINDER' && campaign.abWinnerSelected === 'B');

  let activeTemplate = campaign.template;
  if (isVariantB && campaign.abTemplateIdB && campaign.abTemplateIdB !== campaign.templateId) {
    const templateB = await prisma.template.findFirst({
      where: { id: campaign.abTemplateIdB, tenantId: job.tenantId },
    });
    if (templateB) {
      activeTemplate = templateB;
    }
  }

  const rawBody = activeTemplate?.htmlBody || activeTemplate?.body || '';
  const rawSubject = isVariantB && campaign.abSubjectB
    ? campaign.abSubjectB
    : (campaign.subject || activeTemplate?.subject || activeTemplate?.name || '');

  const effectiveSenderName = isVariantB && campaign.abSenderNameB
    ? campaign.abSenderNameB
    : (campaign.senderName || null);

  return {
    effectiveVariant: isVariantB ? 'B' : 'A',
    subject: rawSubject,
    senderName: effectiveSenderName,
    templateId: activeTemplate?.id || null,
    htmlContent: rawBody,
    template: activeTemplate,
  };
}

export async function sendEmailJob(job: BroadcastJob, deps: EmailSenderDeps = {}): Promise<void> {
  const nowFn = deps.now || (() => new Date());
  const backoffSchedule = deps.backoffMs || RETRY_BACKOFF_MS;
  const appOrigin = deps.appOrigin || process.env.NEXTAUTH_URL || 'http://localhost:3000';

  // 1. Re-check campaign status
  const campaign = await prisma.broadcastCampaign.findFirst({
    where: { id: job.campaignId, tenantId: job.tenantId },
    include: { template: true },
  });

  if (!campaign) {
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        lastError: 'Campaign not found',
        lockedAt: null,
        lockedBy: null,
        processedAt: nowFn(),
      },
    });
    return;
  }

  if (campaign.status === 'PAUSED') {
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        attempts: Math.max(0, job.attempts - 1),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return;
  }

  if (campaign.status === 'CANCELLED') {
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'CANCELLED',
        lockedAt: null,
        lockedBy: null,
        processedAt: nowFn(),
      },
    });
    return;
  }

  if (campaign.status !== 'SENDING') {
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        attempts: Math.max(0, job.attempts - 1),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return;
  }

  // 2. Suppression check
  const recipient = (job.recipient || '').trim().toLowerCase();
  if (!recipient || !recipient.includes('@')) {
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'SKIPPED_INVALID',
        lastError: 'Invalid or missing recipient email',
        lockedAt: null,
        lockedBy: null,
        processedAt: nowFn(),
      },
    });
    return;
  }

  const suppression = await EmailSuppressionService.isEmailSuppressed(job.tenantId, recipient);
  if (suppression.suppressed) {
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'SKIPPED_SUPPRESSED',
        lastError: suppression.reason || 'Suppressed',
        lockedAt: null,
        lockedBy: null,
        processedAt: nowFn(),
      },
    });
    return;
  }

  // 3. Load customer, template, tenant, and email config
  const [customer, tenant, emailConfig] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: job.customerId, tenantId: job.tenantId },
      include: { activePolicy: true },
    }),
    prisma.tenant.findUnique({
      where: { id: job.tenantId },
      select: { id: true, name: true, contactEmail: true, contactPhone: true, postalAddress: true },
    }),
    prisma.tenantEmailConfig.findUnique({
      where: { tenantId: job.tenantId },
      select: { fromEmail: true, fromName: true, postalAddress: true, encryptedApiKey: true },
    }),
  ]);

  // Resolve variant content (Variant A vs Variant B vs Remainder with selected winner)
  const resolvedVariant = await resolveJobVariantPayload(campaign, job);
  const activeTemplate = resolvedVariant.template;

  if (!customer || !activeTemplate || !tenant) {
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        lastError: 'Missing customer, template, or tenant',
        lockedAt: null,
        lockedBy: null,
        processedAt: nowFn(),
      },
    });
    return;
  }

  const rawBody = resolvedVariant.htmlContent;
  const rawSubject = resolvedVariant.subject;
  const effectiveSenderName = resolvedVariant.senderName || emailConfig?.fromName;

  const { subject, html, missingFields } = renderCampaignEmailContent({
    rawBody,
    rawSubject,
    customer: {
      displayName: customer.displayName,
      email: recipient,
      activePolicy: customer.activePolicy,
    },
    tenant,
    emailConfig,
    appOrigin,
  });

  // Check for missing merge fields without template fallback (MKT-05)
  if (missingFields.length > 0) {
    const errorMsg = `Missing required merge field: ${missingFields[0]}`;
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'SKIPPED_INVALID',
        lastError: errorMsg,
        lockedAt: null,
        lockedBy: null,
        processedAt: nowFn(),
      },
    });
    return;
  }

  // 4. Verify sending domain & provider configuration
  if (!emailConfig || !emailConfig.encryptedApiKey) {
    const errorMsg = 'Tenant has no email provider configured. Please configure an email provider in Settings > Email.';
    await prisma.broadcastCampaign.update({
      where: { id: campaign.id },
      data: { status: 'FAILED', lastError: errorMsg, completedAt: nowFn() },
    });
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', lastError: errorMsg, processedAt: nowFn(), lockedAt: null, lockedBy: null },
    });
    return;
  }

  const fromEmail = (campaign.senderEmail || emailConfig.fromEmail || '').trim().toLowerCase();
  const domain = fromEmail.includes('@') ? fromEmail.split('@')[1] : '';

  const verifiedDomain = await prisma.tenantSendingDomain.findFirst({
    where: {
      tenantId: job.tenantId,
      domain: { equals: domain, mode: 'insensitive' },
      status: 'VERIFIED',
    },
  });

  if (!verifiedDomain) {
    const errorMsg = `From address domain "${domain || 'unknown'}" is not a verified sending domain for this organization. Please add and verify this sending domain under Settings > Email Domains.`;
    await prisma.broadcastCampaign.update({
      where: { id: campaign.id },
      data: { status: 'FAILED', lastError: errorMsg, completedAt: nowFn() },
    });
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', lastError: errorMsg, processedAt: nowFn(), lockedAt: null, lockedBy: null },
    });
    return;
  }

  // 5. Send via EmailTransportAdapter (passing job.id as idempotency key)
  try {
    const transport = new EmailTransportAdapter(job.tenantId, deps.adapterOverride);
    const sendRes = await transport.sendEmail({
      to: recipient,
      subject,
      html,
      previewText: campaign.previewText || undefined,
      replyTo: campaign.replyTo || undefined,
      fromName: effectiveSenderName || undefined,
      idempotencyKey: job.id,
      customerId: customer.id,
      campaignId: campaign.id,
    });

    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: {
        status: 'SENT',
        providerMessageId: sendRes.messageId || null,
        processedAt: nowFn(),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isRetryable =
      err instanceof EmailDeliveryError ? err.retryable : true;

    if (isRetryable && job.attempts < 5) {
      const delayIdx = Math.min(Math.max(0, job.attempts - 1), backoffSchedule.length - 1);
      const nextRun = new Date(nowFn().getTime() + backoffSchedule[delayIdx]);
      await prisma.broadcastJob.update({
        where: { id: job.id },
        data: {
          status: 'PENDING',
          scheduledFor: nextRun,
          lastError: errMsg,
          lockedAt: null,
          lockedBy: null,
        },
      });
    } else {
      await prisma.broadcastJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          processedAt: nowFn(),
          lastError: errMsg,
          lockedAt: null,
          lockedBy: null,
        },
      });
    }
  }
}
