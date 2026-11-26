import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    // 1. Overall Channel Breakdown (Email vs WhatsApp vs Instagram)
    const [
      emailDelivered,
      emailOpens,
      emailClicks,
      emailBounces,
      emailComplaints,
      whatsAppSent,
      whatsAppDelivered,
      whatsAppRead,
    ] = await Promise.all([
      db.emailEvent.count({ where: { tenantId, eventType: 'DELIVERED', ...(campaignId ? { campaignId } : {}) } }),
      db.emailEvent.count({ where: { tenantId, eventType: 'OPEN', ...(campaignId ? { campaignId } : {}) } }),
      db.emailEvent.count({ where: { tenantId, eventType: 'CLICK', ...(campaignId ? { campaignId } : {}) } }),
      db.emailEvent.count({ where: { tenantId, eventType: 'BOUNCE_HARD', ...(campaignId ? { campaignId } : {}) } }),
      db.emailEvent.count({ where: { tenantId, eventType: 'COMPLAINT', ...(campaignId ? { campaignId } : {}) } }),
      db.message.count({ where: { tenantId, channel: 'WHATSAPP', direction: 'OUTBOUND' } }),
      db.message.count({ where: { tenantId, channel: 'WHATSAPP', direction: 'OUTBOUND', status: 'DELIVERED' } }),
      db.message.count({ where: { tenantId, channel: 'WHATSAPP', direction: 'OUTBOUND', status: 'READ' } }),
    ]);

    // 2. Per-Campaign funnel metrics if campaignId passed
    let campaignFunnel: any = null;
    if (campaignId) {
      const campaign = await db.broadcastCampaign.findUnique({
        where: { id: campaignId, tenantId },
        include: { template: true },
      });

      if (campaign) {
        campaignFunnel = {
          id: campaign.id,
          name: campaign.name,
          channel: campaign.channel,
          sent: campaign.sent,
          delivered: campaign.delivered,
          opens: campaign.read,
          clicks: campaign.replied,
          converted: campaign.converted,
          bounced: campaign.failed,
          unsubscribed: campaign.optedOut,
          cost: campaign.cost,
        };
      }
    }

    // 3. Top Clicked Links (counted in the database, not by loading every click into memory)
    const linkGroups = await db.emailEvent.groupBy({
      by: ['url'],
      where: {
        tenantId,
        eventType: 'CLICK',
        NOT: { url: null },
        ...(campaignId ? { campaignId } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { url: 'desc' } },
      take: 5,
    });

    const topLinks = linkGroups
      .filter((g) => g.url)
      .map((g) => ({ url: g.url as string, clicks: g._count._all }));

    // 4. Deliverability health status
    const tenantConfig = await db.tenantEmailConfig.findUnique({
      where: { tenantId },
    });

    const complaintRate = tenantConfig?.complaintRate || 0.0;
    const isAutoPaused = tenantConfig?.isAutoPaused || false;
    const warning = complaintRate >= 0.1 && complaintRate < 0.3;

    return NextResponse.json({
      email: {
        delivered: emailDelivered,
        approximateOpens: emailOpens,
        clicks: emailClicks,
        bounces: emailBounces,
        complaints: emailComplaints,
        topLinks,
        deliverability: {
          complaintRate,
          isAutoPaused,
          warning,
          status: isAutoPaused ? 'PAUSED' : warning ? 'WARNING' : 'HEALTHY',
        },
      },
      whatsApp: {
        sent: whatsAppSent,
        delivered: whatsAppDelivered,
        read: whatsAppRead,
      },
      campaignFunnel,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Analytics error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
