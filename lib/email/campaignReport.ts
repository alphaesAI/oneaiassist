import { Prisma, BroadcastJobStatus } from '@prisma/client';
import { prisma } from '@/lib/db';

export type CampaignMetricKey =
  | 'recipients'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'unsubscribed'
  | 'complained'
  | 'failed';

import { AbTestingService, type AbTestEvaluationResult } from './abTesting';

export interface CampaignReportMetrics {
  recipients: number;
  sent: number;
  delivered: number;
  /** True when no delivery confirmations have arrived from the provider and `delivered` is sent minus bounces. */
  deliveredIsEstimated: boolean;
  opened: number;
  totalOpens: number;
  clicked: number;
  totalClicks: number;
  bounced: number;
  hardBounces: number;
  softBounces: number;
  unsubscribed: number;
  complained: number;
  failed: number;
  skippedSuppressed: number;
  skippedInvalid: number;
}

export interface CampaignReportRates {
  deliveryRate: number;      // delivered / sent
  openRate: number;          // opened / delivered
  clickRate: number;         // clicked / delivered (CTR)
  clickToOpenRate: number;   // clicked / opened (CTOR)
  bounceRate: number;        // bounced / sent
  unsubscribeRate: number;   // unsubscribed / delivered
  complaintRate: number;     // complained / delivered
  failureRate: number;       // failed / recipients
}

export interface CampaignReportLink {
  url: string;
  totalClicks: number;
  uniqueContacts: number;
}

export interface CampaignReportSummary {
  campaign: {
    id: string;
    name: string;
    subject: string | null;
    channel: string;
    status: string;
    senderName: string | null;
    senderEmail: string | null;
    createdAt: Date;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    isAbTest?: boolean;
    abSubjectB?: string | null;
    abWinnerSelected?: string | null;
  };
  metrics: CampaignReportMetrics;
  rates: CampaignReportRates;
  links: CampaignReportLink[];
  abTest?: AbTestEvaluationResult | null;
}

export interface ReportContactRow {
  email: string;
  customerId: string | null;
  displayName: string | null;
  status: string;
  count: number;
  eventTimestamp: Date | null;
  details: string | null;
}

export interface PaginatedReportContacts {
  campaignId: string;
  metric: CampaignMetricKey;
  url: string | null;
  totalContacts: number;
  page: number;
  pageSize: number;
  totalPages: number;
  contacts: ReportContactRow[];
}

const MAX_PAGE_SIZE = 100;

export class CampaignReportService {
  /**
   * Retrieves aggregated metrics, rates, and per-link counts for a campaign.
   */
  static async getCampaignReport(
    tenantId: string,
    campaignId: string
  ): Promise<CampaignReportSummary | null> {
    const campaign = await prisma.broadcastCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: {
        id: true,
        name: true,
        subject: true,
        channel: true,
        status: true,
        senderName: true,
        senderEmail: true,
        createdAt: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        totalRecipients: true,
        sent: true,
        delivered: true,
        read: true,
        replied: true,
        failed: true,
        optedOut: true,
        isAbTest: true,
        abSubjectB: true,
        abWinnerSelected: true,
      },
    });

    if (!campaign) return null;

    // 1. Group jobs by status
    const jobStatusGroups = await prisma.broadcastJob.groupBy({
      by: ['status'],
      where: { tenantId, campaignId },
      _count: { _all: true },
    });

    const jobCounts: Record<string, number> = {};
    let totalJobs = 0;
    for (const group of jobStatusGroups) {
      jobCounts[group.status] = group._count._all;
      totalJobs += group._count._all;
    }

    const sentJobs = (jobCounts['SENT'] || 0) + (jobCounts['DELIVERED'] || 0);
    const failedJobs = jobCounts['FAILED'] || 0;
    const skippedSuppressed = jobCounts['SKIPPED_SUPPRESSED'] || 0;
    const skippedInvalid = jobCounts['SKIPPED_INVALID'] || 0;

    // 2. Fetch distinct counts and event breakdowns from EmailEvent
    const [
      uniqueDelivered,
      uniqueOpens,
      uniqueClicks,
      uniqueUnsubs,
      uniqueComplaints,
      uniqueHardBounces,
      uniqueSoftBounces,
      totalOpenCount,
      totalClickCount,
    ] = await Promise.all([
      prisma.emailEvent.findMany({
        where: { tenantId, campaignId, eventType: 'DELIVERED' },
        distinct: ['email'],
        select: { email: true },
      }),
      prisma.emailEvent.findMany({
        where: { tenantId, campaignId, eventType: 'OPEN' },
        distinct: ['email'],
        select: { email: true },
      }),
      prisma.emailEvent.findMany({
        where: { tenantId, campaignId, eventType: 'CLICK' },
        distinct: ['email'],
        select: { email: true },
      }),
      prisma.emailEvent.findMany({
        where: { tenantId, campaignId, eventType: 'UNSUBSCRIBE' },
        distinct: ['email'],
        select: { email: true },
      }),
      prisma.emailEvent.findMany({
        where: { tenantId, campaignId, eventType: 'COMPLAINT' },
        distinct: ['email'],
        select: { email: true },
      }),
      prisma.emailEvent.findMany({
        where: { tenantId, campaignId, eventType: 'BOUNCE_HARD' },
        distinct: ['email'],
        select: { email: true },
      }),
      prisma.emailEvent.findMany({
        where: { tenantId, campaignId, eventType: 'BOUNCE_SOFT' },
        distinct: ['email'],
        select: { email: true },
      }),
      prisma.emailEvent.count({
        where: { tenantId, campaignId, eventType: 'OPEN' },
      }),
      prisma.emailEvent.count({
        where: { tenantId, campaignId, eventType: 'CLICK' },
      }),
    ]);

    // 3. Per-link click breakdown
    const rawLinks = await prisma.$queryRaw<Array<{ url: string; total: number; uniq: number }>>`
      SELECT "url", COUNT(*)::int AS total, COUNT(DISTINCT "email")::int AS uniq
      FROM "EmailEvent"
      WHERE "tenantId" = ${tenantId}
        AND "campaignId" = ${campaignId}
        AND "eventType" = 'CLICK'::"EmailEventType"
        AND "url" IS NOT NULL
      GROUP BY "url"
      ORDER BY total DESC, "url" ASC
      LIMIT 100
    `;

    const links: CampaignReportLink[] = rawLinks.map((r) => ({
      url: r.url,
      totalClicks: Number(r.total),
      uniqueContacts: Number(r.uniq),
    }));

    // Derive comprehensive metrics
    const recipients = Math.max(totalJobs, campaign.totalRecipients);
    const sent = Math.max(sentJobs, campaign.sent);
    const hardBounces = uniqueHardBounces.length;
    const softBounces = uniqueSoftBounces.length;
    const bounced = hardBounces + softBounces;
    
    // Delivered: from events, or fallback to sent minus bounces if webhooks don't emit DELIVERED
    const delivered = uniqueDelivered.length > 0 
      ? uniqueDelivered.length 
      : Math.max(0, sent - bounced);

    const opened = uniqueOpens.length;
    const clicked = uniqueClicks.length;
    const unsubscribed = Math.max(uniqueUnsubs.length, campaign.optedOut);
    const complained = uniqueComplaints.length;
    const failed = totalJobs > 0
      ? failedJobs + skippedInvalid + skippedSuppressed
      : campaign.failed;

    // Derived Rates
    const calcRate = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

    const rates: CampaignReportRates = {
      deliveryRate: calcRate(delivered, sent),
      openRate: calcRate(opened, delivered || sent),
      clickRate: calcRate(clicked, delivered || sent),
      clickToOpenRate: calcRate(clicked, opened),
      bounceRate: calcRate(bounced, sent),
      unsubscribeRate: calcRate(unsubscribed, delivered || sent),
      complaintRate: calcRate(complained, delivered || sent),
      failureRate: calcRate(failed, recipients),
    };

    const metrics: CampaignReportMetrics = {
      recipients,
      sent,
      delivered,
      deliveredIsEstimated: uniqueDelivered.length === 0 && sent > 0,
      opened,
      totalOpens: totalOpenCount,
      clicked,
      totalClicks: totalClickCount,
      bounced,
      hardBounces,
      softBounces,
      unsubscribed,
      complained,
      failed,
      skippedSuppressed,
      skippedInvalid,
    };

    let abTest: AbTestEvaluationResult | null = null;
    if (campaign.isAbTest) {
      abTest = await AbTestingService.getCampaignAbPerformance(tenantId, campaignId);
    }

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        channel: campaign.channel,
        status: campaign.status,
        senderName: campaign.senderName,
        senderEmail: campaign.senderEmail,
        createdAt: campaign.createdAt,
        scheduledAt: campaign.scheduledAt,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        isAbTest: campaign.isAbTest,
        abSubjectB: campaign.abSubjectB,
        abWinnerSelected: campaign.abWinnerSelected,
      },
      metrics,
      rates,
      links,
      abTest,
    };
  }

  /**
   * Retrieves the contact list behind a specific metric number.
   */
  static async getCampaignMetricContacts(
    tenantId: string,
    campaignId: string,
    metric: CampaignMetricKey,
    opts: {
      url?: string | null;
      page?: number;
      pageSize?: number;
      search?: string | null;
      variant?: 'A' | 'B' | 'REMAINDER' | null;
    } = {}
  ): Promise<PaginatedReportContacts | null> {
    const campaign = await prisma.broadcastCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    });
    if (!campaign) return null;

    const page = Math.max(1, Math.floor(opts.page || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize || 25)));
    const search = opts.search ? opts.search.trim().toLowerCase() : null;
    const url = metric === 'clicked' && opts.url ? opts.url : null;

    let totalContacts = 0;
    let contacts: ReportContactRow[] = [];

    if (metric === 'recipients' || metric === 'sent' || metric === 'failed') {
      // Query from BroadcastJob
      const statusFilter: BroadcastJobStatus | Prisma.EnumBroadcastJobStatusFilter | undefined =
        metric === 'sent'
          ? 'SENT'
          : metric === 'failed'
          ? { in: ['FAILED', 'SKIPPED_INVALID', 'SKIPPED_SUPPRESSED'] }
          : undefined;

      const where: Prisma.BroadcastJobWhereInput = {
        tenantId,
        campaignId,
        ...(opts.variant ? { variant: opts.variant } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search
          ? {
              OR: [
                { recipient: { contains: search, mode: 'insensitive' } },
                { customer: { displayName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };

      totalContacts = await prisma.broadcastJob.count({ where });

      const jobs = await prisma.broadcastJob.findMany({
        where,
        include: {
          customer: {
            select: { id: true, displayName: true, email: true },
          },
        },
        orderBy: [{ processedAt: 'desc' }, { scheduledFor: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      contacts = jobs.map((j) => ({
        email: j.recipient || j.customer.email || '',
        customerId: j.customer?.id || null,
        displayName: j.customer?.displayName || null,
        status: j.status,
        count: 1,
        eventTimestamp: j.processedAt || j.scheduledFor,
        details: j.lastError || null,
      }));
    } else {
      // Query from EmailEvent
      let emailVariantFilter: string[] | undefined;
      if (opts.variant) {
        const variantJobs = await prisma.broadcastJob.findMany({
          where: { tenantId, campaignId, variant: opts.variant },
          select: { recipient: true },
        });
        emailVariantFilter = variantJobs.map((j) => j.recipient.toLowerCase()).filter(Boolean);
      }

      const eventTypeFilter: Prisma.EmailEventWhereInput['eventType'] =
        metric === 'delivered'
          ? 'DELIVERED'
          : metric === 'opened'
          ? 'OPEN'
          : metric === 'clicked'
          ? 'CLICK'
          : metric === 'bounced'
          ? { in: ['BOUNCE_HARD', 'BOUNCE_SOFT'] }
          : metric === 'unsubscribed'
          ? 'UNSUBSCRIBE'
          : metric === 'complained'
          ? 'COMPLAINT'
          : undefined;

      const where: Prisma.EmailEventWhereInput = {
        tenantId,
        campaignId,
        eventType: eventTypeFilter,
        ...(emailVariantFilter ? { email: { in: emailVariantFilter } } : {}),
        ...(url ? { url } : {}),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { customer: { displayName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };

      // Group by email to deduplicate contacts
      const distinctEmails = await prisma.emailEvent.findMany({
        where,
        distinct: ['email'],
        select: { email: true },
      });
      totalContacts = distinctEmails.length;

      const grouped = await prisma.emailEvent.groupBy({
        by: ['email'],
        where,
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
        orderBy: [{ _max: { createdAt: 'desc' } }, { email: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      const emails = grouped.map((g) => g.email);
      const [customers, latestEvents] = await Promise.all([
        emails.length
          ? prisma.customer.findMany({
              where: { tenantId, email: { in: emails } },
              select: { id: true, email: true, displayName: true },
            })
          : [],
        emails.length
          ? prisma.emailEvent.findMany({
              where: {
                tenantId,
                campaignId,
                email: { in: emails },
                eventType: eventTypeFilter,
              },
              orderBy: { createdAt: 'desc' },
              select: { email: true, eventType: true, url: true, metadata: true },
            })
          : [],
      ]);

      const customerMap = new Map(customers.map((c) => [(c.email || '').toLowerCase(), c]));
      const eventMap = new Map(latestEvents.map((e) => [e.email.toLowerCase(), e]));

      contacts = grouped.map((g) => {
        const emailLower = g.email.toLowerCase();
        const customer = customerMap.get(emailLower);
        const latestEvt = eventMap.get(emailLower);

        let details: string | null = null;
        if (metric === 'clicked' && latestEvt?.url) {
          details = latestEvt.url;
        } else if (metric === 'bounced' && latestEvt) {
          details = String(latestEvt.eventType);
        }

        return {
          email: g.email,
          customerId: customer?.id || null,
          displayName: customer?.displayName || null,
          status: String(latestEvt?.eventType || metric.toUpperCase()),
          count: g._count._all,
          eventTimestamp: g._max.createdAt || g._min.createdAt,
          details,
        };
      });
    }

    const totalPages = Math.ceil(totalContacts / pageSize) || 1;

    return {
      campaignId,
      metric,
      url,
      totalContacts,
      page,
      pageSize,
      totalPages,
      contacts,
    };
  }
}
