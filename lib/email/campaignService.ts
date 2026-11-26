import { prisma } from '@/lib/db';

export interface CampaignLiveStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skippedSuppressed: number;
  skippedInvalid: number;
  cancelled: number;
}

export class CampaignService {
  /**
   * Fetch a single campaign for a tenant with live job stats from BroadcastJob table
   */
  static async getCampaignWithLiveJobs(tenantId: string, campaignId: string) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId, tenantId },
      include: {
        template: true,
        segment: true,
      },
    });

    if (!campaign) {
      return null;
    }

    const jobStats = await prisma.broadcastJob.groupBy({
      by: ['status'],
      where: { campaignId, tenantId },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    let totalJobs = 0;
    for (const row of jobStats) {
      counts[row.status] = row._count._all;
      totalJobs += row._count._all;
    }

    const liveJobs: CampaignLiveStats = {
      total: totalJobs,
      pending: (counts['PENDING'] || 0) + (counts['PROCESSING'] || 0),
      sent: counts['SENT'] || 0,
      failed: counts['FAILED'] || 0,
      skippedSuppressed: counts['SKIPPED_SUPPRESSED'] || 0,
      skippedInvalid: counts['SKIPPED_INVALID'] || 0,
      cancelled: counts['CANCELLED'] || 0,
    };

    return {
      ...campaign,
      liveJobs,
    };
  }

  /**
   * Fetch all campaigns for a tenant with aggregated live job stats (E6)
   */
  static async listCampaignsWithLiveJobs(
    tenantId: string,
    channelFilter?: string | null,
    opts: { includeJourneySteps?: boolean } = {}
  ) {
    // The containers behind automation email steps are not campaigns a user created,
    // so they stay out of the campaign list unless asked for.
    const where: any = { tenantId, ...(opts.includeJourneySteps ? {} : { kind: 'BROADCAST' }) };
    if (channelFilter && channelFilter !== 'ALL') {
      where.channel = channelFilter;
    }

    const campaigns = await prisma.broadcastCampaign.findMany({
      where,
      include: { template: true, segment: true },
      orderBy: { createdAt: 'desc' },
    });

    const campaignIds = campaigns.map((c) => c.id);
    const jobStatsMap = new Map<string, CampaignLiveStats>();

    if (campaignIds.length > 0) {
      const jobCounts = await prisma.broadcastJob.groupBy({
        by: ['campaignId', 'status'],
        where: {
          campaignId: { in: campaignIds },
          tenantId,
        },
        _count: { _all: true },
      });

      for (const row of jobCounts) {
        if (!jobStatsMap.has(row.campaignId)) {
          jobStatsMap.set(row.campaignId, {
            total: 0,
            pending: 0,
            sent: 0,
            failed: 0,
            skippedSuppressed: 0,
            skippedInvalid: 0,
            cancelled: 0,
          });
        }
        const s = jobStatsMap.get(row.campaignId)!;
        s.total += row._count._all;
        if (row.status === 'SENT') s.sent += row._count._all;
        else if (row.status === 'PENDING' || row.status === 'PROCESSING') s.pending += row._count._all;
        else if (row.status === 'FAILED') s.failed += row._count._all;
        else if (row.status === 'SKIPPED_SUPPRESSED') s.skippedSuppressed += row._count._all;
        else if (row.status === 'SKIPPED_INVALID') s.skippedInvalid += row._count._all;
        else if (row.status === 'CANCELLED') s.cancelled += row._count._all;
      }
    }

    return campaigns.map((c) => {
      const stats = jobStatsMap.get(c.id);
      return {
        ...c,
        liveJobs: stats || {
          total: c.totalRecipients || 0,
          pending: 0,
          sent: c.sent || 0,
          failed: c.failed || 0,
          skippedSuppressed: 0,
          skippedInvalid: 0,
          cancelled: 0,
        },
      };
    });
  }

  /**
   * Delete a broadcast campaign and all associated jobs with tenant isolation (ENG-10)
   */
  static async deleteCampaign(tenantId: string, campaignId: string) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      return { success: false, error: 'Campaign not found', status: 404 };
    }

    // Cascade delete jobs first to preserve referential integrity
    await prisma.broadcastJob.deleteMany({
      where: { campaignId, tenantId },
    });

    // Delete the campaign
    await prisma.broadcastCampaign.delete({
      where: { id: campaignId, tenantId },
    });

    return { success: true, deletedId: campaignId, status: 200 };
  }
}
