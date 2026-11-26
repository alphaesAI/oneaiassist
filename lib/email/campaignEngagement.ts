import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type EngagementType = 'OPEN' | 'CLICK';

export interface EngagementContact {
  email: string;
  customerId: string | null;
  displayName: string | null;
  count: number;
  firstAt: Date | null;
  lastAt: Date | null;
}

export interface EngagementLink {
  url: string;
  totalClicks: number;
  uniqueContacts: number;
}

export interface CampaignEngagement {
  campaignId: string;
  type: EngagementType;
  url: string | null;
  totalEvents: number;
  uniqueContacts: number;
  links: EngagementLink[];
  contacts: EngagementContact[];
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 200;

/**
 * Who opened a campaign, who clicked it, and which links were clicked.
 * Everything is read from EmailEvent rows for this tenant and campaign.
 */
export class CampaignEngagementService {
  static async getEngagement(
    tenantId: string,
    campaignId: string,
    opts: { type: EngagementType; url?: string | null; page?: number; pageSize?: number }
  ): Promise<CampaignEngagement | null> {
    const campaign = await prisma.broadcastCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    });
    if (!campaign) return null;

    const type = opts.type;
    const url = type === 'CLICK' && opts.url ? opts.url : null;
    const page = Math.max(1, Math.floor(opts.page || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize || 50)));

    const where: Prisma.EmailEventWhereInput = {
      tenantId,
      campaignId,
      eventType: type,
      ...(url ? { url } : {}),
    };

    const [totalEvents, uniqueRows, grouped] = await Promise.all([
      prisma.emailEvent.count({ where }),
      prisma.emailEvent.findMany({ where, distinct: ['email'], select: { email: true } }),
      prisma.emailEvent.groupBy({
        by: ['email'],
        where,
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
        orderBy: [{ _max: { createdAt: 'desc' } }, { email: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const emails = grouped.map((g) => g.email);
    const customers = emails.length
      ? await prisma.customer.findMany({
          where: { tenantId, email: { in: emails } },
          select: { id: true, email: true, displayName: true },
        })
      : [];
    const byEmail = new Map(customers.map((c) => [(c.email || '').toLowerCase(), c]));

    const contacts: EngagementContact[] = grouped.map((g) => {
      const customer = byEmail.get(g.email.toLowerCase());
      return {
        email: g.email,
        customerId: customer?.id || null,
        displayName: customer?.displayName || null,
        count: g._count._all,
        firstAt: g._min.createdAt,
        lastAt: g._max.createdAt,
      };
    });

    let links: EngagementLink[] = [];
    if (type === 'CLICK') {
      const rows = await prisma.$queryRaw<Array<{ url: string; total: number; uniq: number }>>`
        SELECT "url", COUNT(*)::int AS total, COUNT(DISTINCT "email")::int AS uniq
        FROM "EmailEvent"
        WHERE "tenantId" = ${tenantId}
          AND "campaignId" = ${campaignId}
          AND "eventType" = 'CLICK'::"EmailEventType"
          AND "url" IS NOT NULL
        GROUP BY "url"
        ORDER BY total DESC, "url" ASC
        LIMIT 500
      `;
      links = rows.map((r) => ({ url: r.url, totalClicks: r.total, uniqueContacts: r.uniq }));
    }

    return {
      campaignId,
      type,
      url,
      totalEvents,
      uniqueContacts: uniqueRows.length,
      links,
      contacts,
      page,
      pageSize,
    };
  }
}
