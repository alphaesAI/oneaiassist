import type { BroadcastJob } from '@prisma/client';
import { prisma } from '@/lib/db';
import { SegmentationService } from '@/lib/email/segmentation';
import { processNextImportJob } from '@/lib/contacts/csvImport';
import { AbTestingService } from '@/lib/email/abTesting';
import { CrossChannelJourneyEngine } from '@/lib/email/journeyEngine';
import { sendEmailJob, type EmailSenderDeps } from './senders/emailSender';
import { sendWhatsAppJob, type WhatsAppSenderDeps } from './senders/whatsappSender';
import { dailyLimitForTier, templateBroadcastProblems, toWhatsAppRecipient } from '@/lib/whatsapp/templateSend';

export interface RunnerOptions {
  workerId?: string;
  perLoopCap?: number;
  concurrency?: number;
  staleTimeoutMs?: number;
  now?: () => Date;
  emailDeps?: EmailSenderDeps;
  whatsappDeps?: WhatsAppSenderDeps;
}

let rotatingTenantOffset = 0;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const safeLimit = Math.max(1, limit);
  let idx = 0;
  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

/**
 * Runs one full cycle of the campaign worker:
 * 0. Recover stale PROCESSING locks
 * 1. Start due QUEUED campaigns
 * 2. Build audiences for SENDING campaigns with audienceBuiltAt = null
 * 3. Claim and send due EMAIL jobs (rotating tenants, respecting hourly/daily quotas)
 * 4. Finish SENDING campaigns whose jobs have all completed
 */
export async function runCampaignTick(opts: RunnerOptions = {}): Promise<{
  recoveredLocks: number;
  startedCampaigns: number;
  builtAudiences: number;
  claimedJobs: number;
  finishedCampaigns: number;
  processedJourneys?: number;
}> {
  const nowFn = opts.now || (() => new Date());
  const now = nowFn();
  const workerId = opts.workerId || `worker_${process.pid}`;
  const perLoopCap = opts.perLoopCap ?? Number(process.env.WORKER_PER_LOOP_CAP || 50);
  const concurrency = opts.concurrency ?? Number(process.env.WORKER_CONCURRENCY || 5);
  const staleTimeoutMs = opts.staleTimeoutMs ?? Number(process.env.WORKER_STALE_LOCK_MS || 10 * 60_000);

  // 0. Recover stale locks
  const staleCutoff = new Date(now.getTime() - staleTimeoutMs);
  const recovered = await prisma.broadcastJob.updateMany({
    where: {
      status: 'PROCESSING',
      lockedAt: { lt: staleCutoff },
    },
    data: {
      status: 'PENDING',
      lockedAt: null,
      lockedBy: null,
    },
  });

  // 1. Start due campaigns (QUEUED -> SENDING)
  const dueCampaigns = await prisma.broadcastCampaign.findMany({
    where: {
      channel: 'EMAIL',
      kind: 'BROADCAST',
      status: 'QUEUED',
      scheduledAt: { lte: now },
    },
    select: { id: true, tenantId: true, senderEmail: true },
  });

  let startedCampaigns = 0;
  for (const camp of dueCampaigns) {
    const emailConfig = await prisma.tenantEmailConfig.findUnique({
      where: { tenantId: camp.tenantId },
      select: { fromEmail: true, encryptedApiKey: true },
    });

    if (!emailConfig || !emailConfig.encryptedApiKey) {
      await prisma.broadcastCampaign.updateMany({
        where: { id: camp.id, tenantId: camp.tenantId, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          lastError: 'Tenant has no email provider configured. Please configure an email provider in Settings > Email.',
          completedAt: now,
        },
      });
      continue;
    }

    const fromEmail = (camp.senderEmail || emailConfig.fromEmail || '').trim().toLowerCase();
    const domain = fromEmail.includes('@') ? fromEmail.split('@')[1] : '';

    const verifiedDomain = await prisma.tenantSendingDomain.findFirst({
      where: {
        tenantId: camp.tenantId,
        domain: { equals: domain, mode: 'insensitive' },
        status: 'VERIFIED',
      },
    });

    if (!verifiedDomain) {
      const errorMsg = `From address domain "${domain || 'unknown'}" is not a verified sending domain for this organization. Please add and verify this sending domain under Settings > Email Domains.`;
      await prisma.broadcastCampaign.updateMany({
        where: { id: camp.id, tenantId: camp.tenantId, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          lastError: errorMsg,
          completedAt: now,
        },
      });
      continue;
    }

    const { count } = await prisma.broadcastCampaign.updateMany({
      where: { id: camp.id, tenantId: camp.tenantId, status: 'QUEUED' },
      data: { status: 'SENDING', startedAt: now },
    });
    if (count === 1) startedCampaigns++;
  }

  // 1b. Start due WhatsApp campaigns. Only accounts on the official Cloud API are sent by this
  // worker; campaigns of accounts on another WhatsApp connection are left exactly as they are.
  const dueWhatsApp = await prisma.broadcastCampaign.findMany({
    where: { channel: 'WHATSAPP', kind: 'BROADCAST', status: 'QUEUED', scheduledAt: { lte: now } },
    select: { id: true, tenantId: true, template: true },
  });
  for (const camp of dueWhatsApp) {
    const number = await prisma.whatsAppNumber.findUnique({
      where: { tenantId: camp.tenantId },
      select: { provider: true, status: true, metaPhoneNumberId: true, metaAccessToken: true },
    });
    if (number?.provider !== 'META_CLOUD_API') continue;

    let problem: string | null = null;
    if (number.status !== 'CONNECTED' || !number.metaPhoneNumberId || !number.metaAccessToken) {
      problem = 'WhatsApp is not connected. Connect the WhatsApp Cloud API in Settings > WhatsApp and create the campaign again.';
    } else if (!camp.template) {
      problem = 'The template for this campaign was deleted.';
    } else if (camp.template.channel !== 'WHATSAPP' || camp.template.status !== 'APPROVED' || !camp.template.metaTemplateId) {
      problem = `The template "${camp.template.name}" is not approved by Meta (status: ${camp.template.status}). Only approved templates can be sent.`;
    } else {
      const templateProblems = templateBroadcastProblems(camp.template);
      if (templateProblems.length > 0) problem = templateProblems.join(' ');
    }

    if (problem) {
      await prisma.broadcastCampaign.updateMany({
        where: { id: camp.id, tenantId: camp.tenantId, status: 'QUEUED' },
        data: { status: 'FAILED', lastError: problem, completedAt: now },
      });
      continue;
    }
    const { count } = await prisma.broadcastCampaign.updateMany({
      where: { id: camp.id, tenantId: camp.tenantId, status: 'QUEUED' },
      data: { status: 'SENDING', startedAt: now },
    });
    if (count === 1) startedCampaigns++;
  }

  // 2. Build audience for SENDING campaigns with audienceBuiltAt = null
  const unbuiltCampaigns = await prisma.broadcastCampaign.findMany({
    where: {
      channel: { in: ['EMAIL', 'WHATSAPP'] },
      // Journey step campaigns receive their jobs one contact at a time from the journey
      // engine. Building an audience for one would email people who never entered the journey.
      kind: 'BROADCAST',
      status: 'SENDING',
      audienceBuiltAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      channel: true,
      recipientFilter: true,
      segmentId: true,
      isAbTest: true,
      abTestSplit: true,
      abDurationHours: true,
    },
  });

  let builtAudiences = 0;
  for (const camp of unbuiltCampaigns) {
    // A campaign must say who it is for. "Everyone" is only ever an explicit choice
    // ({ type: 'all' }) made when the campaign was created, never a default for a missing audience.
    if (!camp.recipientFilter && !camp.segmentId) {
      await prisma.broadcastCampaign.updateMany({
        where: { id: camp.id, tenantId: camp.tenantId, status: 'SENDING' },
        data: {
          status: 'FAILED',
          lastError: 'Campaign has no audience defined. Choose a segment or recipients and create it again.',
          completedAt: now,
        },
      });
      continue;
    }

    let filterInput: any = camp.recipientFilter as any;
    if (camp.segmentId) {
      const seg = await prisma.segment.findUnique({
        where: { id: camp.segmentId, tenantId: camp.tenantId },
        select: { rules: true },
      });
      if (seg?.rules) {
        filterInput = seg.rules;
      }
    }

    if (!filterInput) {
      await prisma.broadcastCampaign.updateMany({
        where: { id: camp.id, tenantId: camp.tenantId, status: 'SENDING' },
        data: {
          status: 'FAILED',
          lastError: 'The segment chosen for this campaign no longer exists. Choose a segment and create the campaign again.',
          completedAt: now,
        },
      });
      continue;
    }

    const whereClause = await SegmentationService.buildUnifiedCustomerFilter(
      camp.tenantId,
      filterInput,
      camp.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL'
    );
    const isWhatsApp = camp.channel === 'WHATSAPP';

    const totalAudience = await prisma.customer.count({ where: whereClause });
    // A/B testing is an email feature; a WhatsApp campaign sends one approved template to everyone.
    const isAb = Boolean(camp.isAbTest) && !isWhatsApp;
    const testPercent = Math.max(10, Math.min(100, camp.abTestSplit ?? 50));
    const testCount = Math.max(2, Math.min(totalAudience, Math.floor((totalAudience * testPercent) / 100)));
    const countA = isAb && totalAudience > 1 ? Math.floor(testCount / 2) : totalAudience;
    const countB = isAb && totalAudience > 1 ? testCount - countA : 0;
    const durationHours = camp.abDurationHours ?? 4;
    const testEndTime = new Date(now.getTime() + durationHours * 3600_000);

    let overallIndex = 0;
    let cursorId: string | undefined;
    const pageSize = 1000;

    while (true) {
      const page = await prisma.customer.findMany({
        where: whereClause,
        select: { id: true, email: true, primaryPhone: true },
        orderBy: { id: 'asc' },
        take: pageSize,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });

      if (page.length === 0) break;

      await prisma.broadcastJob.createMany({
        data: page.map((c) => {
          const email = c.email?.trim().toLowerCase() || '';
          const phone = isWhatsApp ? toWhatsAppRecipient(c.primaryPhone) : null;
          const hasAddress = isWhatsApp ? Boolean(phone) : Boolean(email && email.includes('@'));

          const variant = isAb
            ? overallIndex < countA
              ? 'A'
              : overallIndex < countA + countB
              ? 'B'
              : 'REMAINDER'
            : 'A';
          const scheduledFor = variant === 'REMAINDER' ? testEndTime : now;
          overallIndex++;

          return {
            tenantId: camp.tenantId,
            campaignId: camp.id,
            customerId: c.id,
            channel: isWhatsApp ? ('WHATSAPP' as const) : ('EMAIL' as const),
            recipient: isWhatsApp ? phone || '' : email,
            variant,
            status: hasAddress ? ('PENDING' as const) : ('SKIPPED_INVALID' as const),
            lastError: hasAddress ? null : isWhatsApp ? 'Missing or invalid phone number' : 'Missing or invalid email address',
            scheduledFor,
          };
        }),
        skipDuplicates: true,
      });

      cursorId = page[page.length - 1].id;
      if (page.length < pageSize) break;
    }

    const totalRecipients = await prisma.broadcastJob.count({
      where: { campaignId: camp.id, tenantId: camp.tenantId },
    });

    await prisma.broadcastCampaign.updateMany({
      where: { id: camp.id, tenantId: camp.tenantId, audienceBuiltAt: null },
      data: { totalRecipients, audienceBuiltAt: now },
    });
    builtAudiences++;
  }

  // 2.5. Evaluate due A/B test campaigns and unlock remainder
  const dueAbCampaigns = await prisma.broadcastCampaign.findMany({
    where: {
      channel: 'EMAIL',
      kind: 'BROADCAST',
      status: 'SENDING',
      isAbTest: true,
      abWinnerSelected: null,
      audienceBuiltAt: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      abDurationHours: true,
      audienceBuiltAt: true,
      startedAt: true,
    },
  });

  for (const abCamp of dueAbCampaigns) {
    const durationHours = abCamp.abDurationHours ?? 4;
    const startTime = abCamp.startedAt || abCamp.audienceBuiltAt || now;
    const testEndTime = new Date(startTime.getTime() + durationHours * 3600_000);

    const hasDueRemainder = await prisma.broadcastJob.findFirst({
      where: {
        tenantId: abCamp.tenantId,
        campaignId: abCamp.id,
        variant: 'REMAINDER',
        status: 'PENDING',
        scheduledFor: { lte: now },
      },
      select: { id: true },
    });

    if (now >= testEndTime || hasDueRemainder) {
      await AbTestingService.evaluateAbWinner(abCamp.tenantId, abCamp.id, now);
    }
  }

  // 3. Claim and send due EMAIL jobs (rotating tenants)
  const tenantRows = await prisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT DISTINCT j."tenantId"
    FROM "BroadcastJob" j
    JOIN "BroadcastCampaign" c ON c.id = j."campaignId"
    WHERE j.channel = 'EMAIL'
      AND j.status = 'PENDING'
      AND j."scheduledFor" <= ${now}
      AND c.status = 'SENDING'
    ORDER BY j."tenantId" ASC
  `;

  let claimedJobs = 0;
  if (tenantRows.length > 0) {
    const startIdx = rotatingTenantOffset % tenantRows.length;
    const orderedTenants = [
      ...tenantRows.slice(startIdx),
      ...tenantRows.slice(0, startIdx),
    ];
    rotatingTenantOffset = (startIdx + 1) % tenantRows.length;

    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

    for (const { tenantId } of orderedTenants) {
      const emailConfig = await prisma.tenantEmailConfig.findUnique({
        where: { tenantId },
        select: { isAutoPaused: true, hourlySendRate: true, dailySendQuota: true },
      });

      if (emailConfig?.isAutoPaused) continue;

      const hourlyRate = emailConfig?.hourlySendRate ?? 100;
      const dailyQuota = emailConfig?.dailySendQuota ?? 100;

      const [sentLastHour, sentLastDay] = await Promise.all([
        prisma.broadcastJob.count({
          where: {
            tenantId,
            channel: 'EMAIL',
            status: 'SENT',
            processedAt: { gte: oneHourAgo },
          },
        }),
        prisma.broadcastJob.count({
          where: {
            tenantId,
            channel: 'EMAIL',
            status: 'SENT',
            processedAt: { gte: oneDayAgo },
          },
        }),
      ]);

      const allowance = Math.min(
        Math.max(0, hourlyRate - sentLastHour),
        Math.max(0, dailyQuota - sentLastDay),
        perLoopCap
      );

      if (allowance <= 0) continue;

      const claimed = await prisma.$queryRaw<BroadcastJob[]>`
        UPDATE "BroadcastJob"
        SET status = 'PROCESSING', "lockedAt" = ${now}, "lockedBy" = ${workerId}, attempts = attempts + 1
        WHERE id IN (
          SELECT j.id
          FROM "BroadcastJob" j
          JOIN "BroadcastCampaign" c ON c.id = j."campaignId"
          WHERE j."tenantId" = ${tenantId}
            AND j.channel = 'EMAIL'
            AND j.status = 'PENDING'
            AND j."scheduledFor" <= ${now}
            AND c.status = 'SENDING'
          ORDER BY j."scheduledFor" ASC
          LIMIT ${allowance}
          FOR UPDATE OF j SKIP LOCKED
        )
        RETURNING *
      `;

      if (claimed.length === 0) continue;
      claimedJobs += claimed.length;

      await runWithConcurrency(claimed, concurrency, async (job) => {
        await sendEmailJob(job, { ...opts.emailDeps, now: nowFn });
      });
    }
  }

  // 3b. Claim and send due WHATSAPP jobs, within each number's Meta messaging limit
  const waTenantRows = await prisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT DISTINCT j."tenantId"
    FROM "BroadcastJob" j
    JOIN "BroadcastCampaign" c ON c.id = j."campaignId"
    WHERE j.channel = 'WHATSAPP'
      AND j.status = 'PENDING'
      AND j."scheduledFor" <= ${now}
      AND c.status = 'SENDING'
    ORDER BY j."tenantId" ASC
  `;
  if (waTenantRows.length > 0) {
    const startIdx = rotatingTenantOffset % waTenantRows.length;
    const orderedTenants = [...waTenantRows.slice(startIdx), ...waTenantRows.slice(0, startIdx)];
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

    for (const { tenantId } of orderedTenants) {
      const number = await prisma.whatsAppNumber.findUnique({
        where: { tenantId },
        select: { provider: true, messagingLimitTier: true },
      });
      // Never sent through anything but the official Cloud API.
      if (number?.provider !== 'META_CLOUD_API') continue;

      const sentLastDay = await prisma.broadcastJob.count({
        where: { tenantId, channel: 'WHATSAPP', status: 'SENT', processedAt: { gte: oneDayAgo } },
      });
      const allowance = Math.min(Math.max(0, dailyLimitForTier(number.messagingLimitTier) - sentLastDay), perLoopCap);
      if (allowance <= 0) continue;

      const claimed = await prisma.$queryRaw<BroadcastJob[]>`
        UPDATE "BroadcastJob"
        SET status = 'PROCESSING', "lockedAt" = ${now}, "lockedBy" = ${workerId}, attempts = attempts + 1
        WHERE id IN (
          SELECT j.id
          FROM "BroadcastJob" j
          JOIN "BroadcastCampaign" c ON c.id = j."campaignId"
          WHERE j."tenantId" = ${tenantId}
            AND j.channel = 'WHATSAPP'
            AND j.status = 'PENDING'
            AND j."scheduledFor" <= ${now}
            AND c.status = 'SENDING'
          ORDER BY j."scheduledFor" ASC
          LIMIT ${allowance}
          FOR UPDATE OF j SKIP LOCKED
        )
        RETURNING *
      `;
      if (claimed.length === 0) continue;
      claimedJobs += claimed.length;

      await runWithConcurrency(claimed, concurrency, async (job) => {
        await sendWhatsAppJob(job, { ...opts.whatsappDeps, now: nowFn });
      });
    }
  }

  // 4. Finish campaigns
  const activeCampaigns = await prisma.broadcastCampaign.findMany({
    where: {
      channel: { in: ['EMAIL', 'WHATSAPP'] },
      // Journey step campaigns stay open for as long as the journey exists; they are never "finished".
      kind: 'BROADCAST',
      status: 'SENDING',
      audienceBuiltAt: { not: null },
    },
    select: { id: true, tenantId: true },
  });

  let finishedCampaigns = 0;
  for (const camp of activeCampaigns) {
    const remaining = await prisma.broadcastJob.count({
      where: {
        campaignId: camp.id,
        tenantId: camp.tenantId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    if (remaining > 0) continue;

    // If an A/B test campaign finishes without having evaluated winner (e.g. 100% test split), evaluate it now
    const campaignRecord = await prisma.broadcastCampaign.findUnique({
      where: { id: camp.id, tenantId: camp.tenantId },
      select: { isAbTest: true, abWinnerSelected: true },
    });
    if (campaignRecord?.isAbTest && !campaignRecord.abWinnerSelected) {
      await AbTestingService.evaluateAbWinner(camp.tenantId, camp.id, now);
    }

    const counts = await prisma.broadcastJob.groupBy({
      by: ['status'],
      where: { campaignId: camp.id, tenantId: camp.tenantId },
      _count: { _all: true },
    });

    let sentCount = 0;
    let failedCount = 0;
    for (const row of counts) {
      if (row.status === 'SENT') sentCount = row._count._all;
      if (row.status === 'FAILED') failedCount = row._count._all;
    }

    await prisma.broadcastCampaign.updateMany({
      where: { id: camp.id, tenantId: camp.tenantId, status: 'SENDING' },
      data: {
        sent: sentCount,
        failed: failedCount,
        completedAt: now,
        status: sentCount > 0 ? 'COMPLETED' : 'FAILED',
      },
    });
    finishedCampaigns++;
  }

  // 5. Process one pending CSV contact import job
  await processNextImportJob().catch((err) => console.error('[Worker] CSV import job error:', err));

  // 6. Process due cross-channel journey enrollments (E10)
  const journeyResult = await CrossChannelJourneyEngine.processDueEnrollments(
    undefined,
    workerId,
    20,
    { now: nowFn }
  ).catch((err) => {
    console.error('[Worker] Journey processing error:', err);
    return { processed: 0, claimed: 0, errors: 0 };
  });

  return {
    recoveredLocks: recovered.count,
    startedCampaigns,
    builtAudiences,
    claimedJobs,
    finishedCampaigns,
    processedJourneys: journeyResult.processed,
  };
}
