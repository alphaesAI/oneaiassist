/**
 * Report for one WhatsApp campaign. Every number is counted from the campaign's own messages
 * (BroadcastJob rows); nothing is estimated.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type WhatsAppMetricKey =
  | 'recipients'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'replied'
  | 'failed'
  | 'skipped'
  | 'optedOut'
  | 'pending';

export const WHATSAPP_METRICS: WhatsAppMetricKey[] = ['recipients', 'sent', 'delivered', 'read', 'replied', 'failed', 'skipped', 'optedOut', 'pending'];

export interface WhatsAppCampaignReport {
  campaign: {
    id: string;
    name: string;
    status: string;
    kind: string;
    templateName: string | null;
    createdAt: Date;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    lastError: string | null;
  };
  metrics: Record<WhatsAppMetricKey, number> & { skippedOptedOut: number; skippedInvalid: number; cancelled: number };
  /** Percentages with one decimal. */
  rates: { deliveryRate: number; readRate: number; replyRate: number; failureRate: number; optOutRate: number };
  /** Why messages failed, grouped by Meta's error code. */
  failureReasons: Array<{ code: string | null; count: number; example: string | null }>;
  /** Why contacts were skipped before sending. */
  skipReasons: Array<{ reason: string; count: number }>;
}

export interface WhatsAppReportContact {
  customerId: string;
  displayName: string | null;
  phone: string;
  status: string;
  at: Date | null;
  details: string | null;
}

export interface WhatsAppReportContacts {
  campaignId: string;
  metric: WhatsAppMetricKey;
  totalContacts: number;
  page: number;
  pageSize: number;
  totalPages: number;
  contacts: WhatsAppReportContact[];
}

const MAX_PAGE_SIZE = 100;

/** The jobs behind each number. "Sent" means Meta accepted the message, including ones that failed afterwards. */
function metricWhere(metric: WhatsAppMetricKey): Prisma.BroadcastJobWhereInput {
  switch (metric) {
    case 'sent': return { providerMessageId: { not: null } };
    case 'delivered': return { deliveredAt: { not: null } };
    case 'read': return { readAt: { not: null } };
    case 'replied': return { repliedAt: { not: null } };
    case 'failed': return { status: 'FAILED' };
    case 'skipped': return { status: { in: ['SKIPPED_OPTED_OUT', 'SKIPPED_INVALID', 'SKIPPED_SUPPRESSED'] } };
    case 'optedOut': return { optedOutAt: { not: null } };
    case 'pending': return { status: { in: ['PENDING', 'PROCESSING'] } };
    default: return {};
  }
}

const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export class WhatsAppCampaignReportService {
  static async getReport(tenantId: string, campaignId: string): Promise<WhatsAppCampaignReport | null> {
    const campaign = await prisma.broadcastCampaign.findFirst({
      where: { id: campaignId, tenantId, channel: 'WHATSAPP' },
      select: {
        id: true, name: true, status: true, kind: true, createdAt: true, scheduledAt: true, startedAt: true,
        completedAt: true, lastError: true, template: { select: { name: true } },
      },
    });
    if (!campaign) return null;

    const base = { tenantId, campaignId };
    const count = (where: Prisma.BroadcastJobWhereInput) => prisma.broadcastJob.count({ where: { ...base, ...where } });
    const [recipients, sent, delivered, read, replied, failed, optedOut, pending, skippedOptedOut, skippedInvalid, cancelled] = await Promise.all([
      count({}),
      count(metricWhere('sent')),
      count(metricWhere('delivered')),
      count(metricWhere('read')),
      count(metricWhere('replied')),
      count(metricWhere('failed')),
      count(metricWhere('optedOut')),
      count(metricWhere('pending')),
      count({ status: 'SKIPPED_OPTED_OUT' }),
      count({ status: { in: ['SKIPPED_INVALID', 'SKIPPED_SUPPRESSED'] } }),
      count({ status: 'CANCELLED' }),
    ]);

    const failedGroups = await prisma.broadcastJob.groupBy({
      by: ['errorCode'],
      where: { ...base, status: 'FAILED' },
      _count: { _all: true },
    });
    const failureReasons = await Promise.all(
      failedGroups.map(async (g) => {
        const sample = await prisma.broadcastJob.findFirst({
          where: { ...base, status: 'FAILED', errorCode: g.errorCode },
          select: { lastError: true },
          orderBy: { processedAt: 'desc' },
        });
        return { code: g.errorCode, count: g._count._all, example: sample?.lastError || null };
      })
    );
    failureReasons.sort((a, b) => b.count - a.count);

    const skipGroups = await prisma.broadcastJob.groupBy({
      by: ['lastError'],
      where: { ...base, ...metricWhere('skipped') },
      _count: { _all: true },
    });
    const skipReasons = skipGroups
      .map((g) => ({ reason: g.lastError || 'No reason recorded', count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const skipped = skippedOptedOut + skippedInvalid;
    return {
      campaign: {
        id: campaign.id, name: campaign.name, status: campaign.status, kind: campaign.kind,
        templateName: campaign.template?.name || null, createdAt: campaign.createdAt, scheduledAt: campaign.scheduledAt,
        startedAt: campaign.startedAt, completedAt: campaign.completedAt, lastError: campaign.lastError,
      },
      metrics: { recipients, sent, delivered, read, replied, failed, skipped, optedOut, pending, skippedOptedOut, skippedInvalid, cancelled },
      rates: {
        deliveryRate: rate(delivered, sent),
        readRate: rate(read, delivered),
        replyRate: rate(replied, delivered),
        failureRate: rate(failed, recipients),
        optOutRate: rate(optedOut, delivered),
      },
      failureReasons,
      skipReasons,
    };
  }

  /** The contacts behind one number of the report. */
  static async getMetricContacts(
    tenantId: string,
    campaignId: string,
    metric: WhatsAppMetricKey,
    opts: { page?: number; pageSize?: number; search?: string | null } = {}
  ): Promise<WhatsAppReportContacts | null> {
    const campaign = await prisma.broadcastCampaign.findFirst({ where: { id: campaignId, tenantId, channel: 'WHATSAPP' }, select: { id: true } });
    if (!campaign) return null;

    const page = Math.max(1, Math.floor(opts.page || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize || 25)));
    const search = (opts.search || '').trim();

    const where: Prisma.BroadcastJobWhereInput = {
      tenantId,
      campaignId,
      ...metricWhere(metric),
      ...(search
        ? { OR: [{ recipient: { contains: search.replace(/[^\d]/g, '') || search } }, { customer: { displayName: { contains: search, mode: 'insensitive' } } }] }
        : {}),
    };
    const totalContacts = await prisma.broadcastJob.count({ where });
    const jobs = await prisma.broadcastJob.findMany({
      where,
      include: { customer: { select: { id: true, displayName: true } } },
      orderBy: [{ processedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const contacts = jobs.map((j) => {
      // The time shown is the time of the thing the list is about.
      const at =
        metric === 'delivered' ? j.deliveredAt
        : metric === 'read' ? j.readAt
        : metric === 'replied' ? j.repliedAt
        : metric === 'optedOut' ? j.optedOutAt
        : metric === 'failed' ? j.failedAt || j.processedAt
        : j.processedAt || j.scheduledFor;
      const status = j.status !== 'SENT' ? j.status : j.readAt ? 'READ' : j.deliveredAt ? 'DELIVERED' : 'SENT';
      return {
        customerId: j.customer.id,
        displayName: j.customer.displayName,
        phone: j.recipient,
        status,
        at,
        details: j.status === 'SENT' ? null : j.lastError,
      };
    });

    return { campaignId, metric, totalContacts, page, pageSize, totalPages: Math.ceil(totalContacts / pageSize) || 1, contacts };
  }
}
