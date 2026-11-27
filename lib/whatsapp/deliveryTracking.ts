import { prisma } from '@/lib/db';

export type DeliveryStatus = 'DELIVERED' | 'READ' | 'FAILED';

export interface DeliveryEvent {
  tenantId: string;
  /** Meta's message ID (wamid), as stored on the job when it was sent. */
  providerMessageId: string;
  status: DeliveryStatus;
  timestamp?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** Recounts a campaign's totals from its jobs, so the numbers are always exactly what happened. */
export async function recountCampaign(tenantId: string, campaignId: string) {
  const [sent, failed, delivered, read, replied] = await Promise.all([
    prisma.broadcastJob.count({ where: { tenantId, campaignId, status: 'SENT' } }),
    prisma.broadcastJob.count({ where: { tenantId, campaignId, status: 'FAILED' } }),
    prisma.broadcastJob.count({ where: { tenantId, campaignId, deliveredAt: { not: null } } }),
    prisma.broadcastJob.count({ where: { tenantId, campaignId, readAt: { not: null } } }),
    prisma.broadcastJob.count({ where: { tenantId, campaignId, repliedAt: { not: null } } }),
  ]);
  await prisma.broadcastCampaign.updateMany({
    where: { id: campaignId, tenantId },
    data: { sent, failed, delivered, read, replied },
  });
  return { sent, failed, delivered, read, replied };
}

/**
 * Applies one delivery update from Meta to the broadcast job it belongs to. Safe to call with the
 * same event many times and with events arriving out of order: a status only ever moves forward.
 */
export async function recordDeliveryEvent(
  event: DeliveryEvent
): Promise<{ matched: boolean; changed: boolean; campaignId: string | null; totals?: Awaited<ReturnType<typeof recountCampaign>> }> {
  const providerMessageId = String(event.providerMessageId || '').trim();
  if (!event.tenantId || !providerMessageId) return { matched: false, changed: false, campaignId: null };

  // The tenant comes from the phone number the event was sent to; the job must belong to it.
  const job = await prisma.broadcastJob.findFirst({
    where: { tenantId: event.tenantId, providerMessageId, channel: 'WHATSAPP' },
    select: { id: true, campaignId: true, status: true, deliveredAt: true, readAt: true, failedAt: true },
  });
  if (!job) return { matched: false, changed: false, campaignId: null };

  const at = event.timestamp && !Number.isNaN(event.timestamp.getTime()) ? event.timestamp : new Date();
  let changed = 0;

  if (event.status === 'DELIVERED') {
    // Only a message that was sent and has not failed can become delivered.
    const res = await prisma.broadcastJob.updateMany({
      where: { id: job.id, tenantId: event.tenantId, status: 'SENT', deliveredAt: null },
      data: { deliveredAt: at },
    });
    changed = res.count;
  } else if (event.status === 'READ') {
    const res = await prisma.broadcastJob.updateMany({
      where: { id: job.id, tenantId: event.tenantId, status: 'SENT', readAt: null },
      data: { readAt: at, ...(job.deliveredAt ? {} : { deliveredAt: at }) },
    });
    changed = res.count;
  } else if (event.status === 'FAILED') {
    // Meta reports a failure for a message it accepted but could not deliver. A message already
    // delivered or read is not turned back into a failure.
    const code = event.errorCode ? String(event.errorCode) : null;
    const detail = (event.errorMessage || '').trim().slice(0, 500);
    const res = await prisma.broadcastJob.updateMany({
      where: { id: job.id, tenantId: event.tenantId, status: 'SENT', deliveredAt: null, readAt: null },
      data: {
        status: 'FAILED',
        failedAt: at,
        errorCode: code,
        lastError: `Meta could not deliver this message${detail ? `: ${detail}` : '.'}${code ? ` (code ${code})` : ''}`,
      },
    });
    changed = res.count;
  }

  if (changed === 0) return { matched: true, changed: false, campaignId: job.campaignId };
  const totals = await recountCampaign(event.tenantId, job.campaignId);
  return { matched: true, changed: true, campaignId: job.campaignId, totals };
}
