import { prisma } from '@/lib/db';

export interface AbVariantMetrics {
  subject: string | null;
  senderName: string | null;
  templateId: string | null;
  totalRecipients: number;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  openRate: number;        // opens / (delivered || sent) * 100
  clickRate: number;       // clicks / (delivered || sent) * 100 (CTR)
  clickToOpenRate: number; // clicks / opens * 100 (CTOR)
}

export interface AbTestEvaluationResult {
  campaignId: string;
  isAbTest: boolean;
  winner: 'A' | 'B';
  metric: 'CLICKS' | 'OPENS';
  winnerSelected: 'A' | 'B' | null;
  durationHours: number;
  splitPercent: number;
  variantA: AbVariantMetrics;
  variantB: AbVariantMetrics;
  remainder: {
    total: number;
    sent: number;
    delivered: number;
    winningVariant: 'A' | 'B' | null;
  };
  message: string;
}

export class AbTestingService {
  /**
   * Deterministically splits recipients between Variant A, Variant B, and Remainder holdout.
   */
  static splitRecipients<T>(
    recipients: T[],
    testSplitPercent: number = 50
  ): { variantA: T[]; variantB: T[]; remainder: T[] } {
    const total = recipients.length;
    if (total === 0) {
      return { variantA: [], variantB: [], remainder: [] };
    }
    if (total === 1) {
      return { variantA: [recipients[0]], variantB: [], remainder: [] };
    }

    // Split percent is the percentage of audience dedicated to the test (e.g. 20% or 50%)
    const clampedPercent = Math.max(10, Math.min(100, testSplitPercent));
    const testCount = Math.max(2, Math.min(total, Math.floor((total * clampedPercent) / 100)));
    const countA = Math.floor(testCount / 2);
    const countB = testCount - countA;

    const variantA = recipients.slice(0, countA);
    const variantB = recipients.slice(countA, countA + countB);
    const remainder = recipients.slice(countA + countB);

    return { variantA, variantB, remainder };
  }

  /**
   * Pure calculation helper for determining winner from email events (legacy backward compatibility).
   */
  static calculateWinner(
    events: Array<{ eventType: string; metadata?: any }>,
    metric: 'CLICKS' | 'OPENS' = 'CLICKS',
    totalSent: number = 0
  ): {
    winner: 'A' | 'B' | 'TIE';
    variantA: { sent: number; opens: number; clicks: number; conversionRate: number };
    variantB: { sent: number; opens: number; clicks: number; conversionRate: number };
    message: string;
  } {
    let aOpens = 0, aClicks = 0, aSent = 0;
    let bOpens = 0, bClicks = 0, bSent = 0;

    events.forEach((ev) => {
      const meta = ev.metadata as any;
      const variant = meta?.variant || 'A';
      if (variant === 'B') {
        if (ev.eventType === 'DELIVERED') bSent++;
        if (ev.eventType === 'OPEN') bOpens++;
        if (ev.eventType === 'CLICK') bClicks++;
      } else {
        if (ev.eventType === 'DELIVERED') aSent++;
        if (ev.eventType === 'OPEN') aOpens++;
        if (ev.eventType === 'CLICK') aClicks++;
      }
    });

    if (aSent === 0 && totalSent > 0) aSent = Math.ceil(totalSent / 2);
    if (bSent === 0 && totalSent > 0) bSent = Math.floor(totalSent / 2);

    const scoreA = metric === 'CLICKS' ? aClicks : aOpens;
    const scoreB = metric === 'CLICKS' ? bClicks : bOpens;

    let winner: 'A' | 'B' | 'TIE' = 'TIE';
    if (scoreA > scoreB) winner = 'A';
    else if (scoreB > scoreA) winner = 'B';

    const rateA = aSent > 0 ? (scoreA / aSent) * 100 : 0;
    const rateB = bSent > 0 ? (scoreB / bSent) * 100 : 0;

    return {
      winner,
      variantA: {
        sent: aSent,
        opens: aOpens,
        clicks: aClicks,
        conversionRate: Number(rateA.toFixed(2)),
      },
      variantB: {
        sent: bSent,
        opens: bOpens,
        clicks: bClicks,
        conversionRate: Number(rateB.toFixed(2)),
      },
      message:
        winner === 'TIE'
          ? 'Performance is currently even between Variant A and Variant B.'
          : `Variant ${winner} won with ${winner === 'A' ? scoreA : scoreB} ${metric.toLowerCase()} (${winner === 'A' ? rateA.toFixed(1) : rateB.toFixed(1)}% conversion).`,
    };
  }

  /**
   * Retrieves live, real-time A/B performance metrics directly from database rows.
   */
  static async getCampaignAbPerformance(
    tenantId: string,
    campaignId: string
  ): Promise<AbTestEvaluationResult | null> {
    const campaign = await prisma.broadcastCampaign.findFirst({
      where: { id: campaignId, tenantId },
      include: { template: true },
    });

    if (!campaign || !campaign.isAbTest) {
      return null;
    }

    // 1. Fetch all BroadcastJob rows for this campaign
    const jobs = await prisma.broadcastJob.findMany({
      where: { tenantId, campaignId },
      select: {
        id: true,
        customerId: true,
        recipient: true,
        variant: true,
        status: true,
      },
    });

    const jobsA = jobs.filter((j) => j.variant === 'A' || !j.variant);
    const jobsB = jobs.filter((j) => j.variant === 'B');
    const jobsRemainder = jobs.filter((j) => j.variant === 'REMAINDER');

    const emailsA = new Set(jobsA.map((j) => j.recipient.toLowerCase()).filter(Boolean));
    const emailsB = new Set(jobsB.map((j) => j.recipient.toLowerCase()).filter(Boolean));
    const emailsRemainder = new Set(jobsRemainder.map((j) => j.recipient.toLowerCase()).filter(Boolean));

    const sentA = jobsA.filter((j) => j.status === 'SENT').length;
    const sentB = jobsB.filter((j) => j.status === 'SENT').length;
    const sentRemainder = jobsRemainder.filter((j) => j.status === 'SENT').length;

    // 2. Fetch all EmailEvent rows for this campaign
    const events = await prisma.emailEvent.findMany({
      where: {
        tenantId,
        campaignId,
        eventType: { in: ['DELIVERED', 'OPEN', 'CLICK'] },
      },
      select: {
        email: true,
        eventType: true,
      },
    });

    // Count distinct contacts per event type per variant
    const deliveredEmailsA = new Set<string>();
    const openEmailsA = new Set<string>();
    const clickEmailsA = new Set<string>();

    const deliveredEmailsB = new Set<string>();
    const openEmailsB = new Set<string>();
    const clickEmailsB = new Set<string>();

    const deliveredEmailsRemainder = new Set<string>();

    for (const ev of events) {
      const email = (ev.email || '').toLowerCase();
      if (emailsA.has(email)) {
        if (ev.eventType === 'DELIVERED') deliveredEmailsA.add(email);
        if (ev.eventType === 'OPEN') openEmailsA.add(email);
        if (ev.eventType === 'CLICK') clickEmailsA.add(email);
      } else if (emailsB.has(email)) {
        if (ev.eventType === 'DELIVERED') deliveredEmailsB.add(email);
        if (ev.eventType === 'OPEN') openEmailsB.add(email);
        if (ev.eventType === 'CLICK') clickEmailsB.add(email);
      } else if (emailsRemainder.has(email)) {
        if (ev.eventType === 'DELIVERED') deliveredEmailsRemainder.add(email);
      }
    }

    const deliveredA = deliveredEmailsA.size > 0 ? deliveredEmailsA.size : sentA;
    const deliveredB = deliveredEmailsB.size > 0 ? deliveredEmailsB.size : sentB;
    const deliveredRemainder = deliveredEmailsRemainder.size > 0 ? deliveredEmailsRemainder.size : sentRemainder;

    const opensA = openEmailsA.size;
    const opensB = openEmailsB.size;

    const clicksA = clickEmailsA.size;
    const clicksB = clickEmailsB.size;

    const calcRate = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

    const variantA: AbVariantMetrics = {
      subject: campaign.subject || campaign.template?.subject || null,
      senderName: campaign.senderName || null,
      templateId: campaign.templateId,
      totalRecipients: jobsA.length,
      sent: sentA,
      delivered: deliveredA,
      opens: opensA,
      clicks: clicksA,
      openRate: calcRate(opensA, deliveredA || sentA),
      clickRate: calcRate(clicksA, deliveredA || sentA),
      clickToOpenRate: calcRate(clicksA, opensA),
    };

    const variantB: AbVariantMetrics = {
      subject: campaign.abSubjectB || campaign.subject || null,
      senderName: campaign.abSenderNameB || campaign.senderName || null,
      templateId: campaign.abTemplateIdB || campaign.templateId,
      totalRecipients: jobsB.length,
      sent: sentB,
      delivered: deliveredB,
      opens: opensB,
      clicks: clicksB,
      openRate: calcRate(opensB, deliveredB || sentB),
      clickRate: calcRate(clicksB, deliveredB || sentB),
      clickToOpenRate: calcRate(clicksB, opensB),
    };

    const metric = (campaign.abWinnerMetric === 'OPENS' ? 'OPENS' : 'CLICKS') as 'CLICKS' | 'OPENS';

    // Winning evaluation
    const scoreA = metric === 'CLICKS' ? variantA.clickRate : variantA.openRate;
    const scoreB = metric === 'CLICKS' ? variantB.clickRate : variantB.openRate;

    // Default to A if tied or equal
    let calculatedWinner: 'A' | 'B' = scoreB > scoreA ? 'B' : 'A';

    let message = '';
    if (scoreB > scoreA) {
      const diff = Math.round((scoreB - scoreA) * 10) / 10;
      message = `Variant B won with ${scoreB}% ${metric.toLowerCase()} rate (+${diff}% margin).`;
    } else if (scoreA > scoreB) {
      const diff = Math.round((scoreA - scoreB) * 10) / 10;
      message = `Variant A won with ${scoreA}% ${metric.toLowerCase()} rate (+${diff}% margin).`;
    } else {
      message = `Performance is even (${scoreA}% ${metric.toLowerCase()} rate). Baseline Variant A selected.`;
    }

    return {
      campaignId,
      isAbTest: true,
      winner: calculatedWinner,
      metric,
      winnerSelected: (campaign.abWinnerSelected as 'A' | 'B' | null) || null,
      durationHours: campaign.abDurationHours ?? 4,
      splitPercent: campaign.abTestSplit ?? 50,
      variantA,
      variantB,
      remainder: {
        total: jobsRemainder.length,
        sent: sentRemainder,
        delivered: deliveredRemainder,
        winningVariant: (campaign.abWinnerSelected as 'A' | 'B' | null) || null,
      },
      message,
    };
  }

  /**
   * Evaluates performance of an active A/B test campaign, selects the winner,
   * updates the campaign row, and unlocks the remainder jobs for immediate dispatch.
   */
  static async evaluateAbWinner(
    tenantId: string,
    campaignId: string,
    now: Date = new Date()
  ): Promise<AbTestEvaluationResult | null> {
    const performance = await this.getCampaignAbPerformance(tenantId, campaignId);
    if (!performance) {
      return null;
    }

    const winner = performance.winner;

    // 1. Update BroadcastCampaign with winning variant
    await prisma.broadcastCampaign.updateMany({
      where: { id: campaignId, tenantId },
      data: { abWinnerSelected: winner },
    });

    // 2. Unlock remainder jobs: set scheduledFor = now so the worker immediately picks them up
    await prisma.broadcastJob.updateMany({
      where: {
        tenantId,
        campaignId,
        variant: 'REMAINDER',
        status: 'PENDING',
      },
      data: {
        scheduledFor: now,
      },
    });

    performance.winnerSelected = winner;
    performance.remainder.winningVariant = winner;

    return performance;
  }
}
