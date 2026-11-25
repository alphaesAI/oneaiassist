import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { validToken } from './oauth';
import { adapters, PublishError, type Platform, type PublishMedia } from './platforms';
import { isVideo } from './platforms/validate';
import { prisma } from './prisma';
import { publicMediaUrl, readUpload } from './storage';

export const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];
const BATCH_SIZE = 3;
// Longer than the longest allowed upload, so a live job is never treated as crashed
export const STALE_LOCK_MS = 40 * 60_000;

/** Atomically takes due jobs, so two ticks can never publish the same job. */
export async function claimDueJobs(now = new Date()) {
  const due = await prisma.publishJob.findMany({
    where: { status: 'PENDING', runAt: { lte: now } },
    orderBy: { runAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });
  const claimed: string[] = [];
  for (const { id } of due) {
    const { count } = await prisma.publishJob.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PUBLISHING', lockedAt: now, attempts: { increment: 1 } },
    });
    if (count === 1) claimed.push(id);
  }
  return claimed;
}

/**
 * A job still PUBLISHING after the lock expired means the process died mid-call. The post
 * may or may not be live, so it goes to a person rather than risking a double post.
 */
export async function recoverStaleJobs(now = new Date()) {
  const { count } = await prisma.publishJob.updateMany({
    where: { status: 'PUBLISHING', lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: {
      status: 'NEEDS_REVIEW',
      lockedAt: null,
      errorCode: 'INTERRUPTED',
      errorMessage: 'The server stopped while publishing. Check the platform before retrying.',
    },
  });
  return count;
}

async function finishWithError(jobId: string, attempts: number, accountId: string | null, error: unknown) {
  const failure = error instanceof PublishError
    ? error
    : new PublishError('ambiguous', error instanceof Error ? error.message : 'Unexpected error', 'UNEXPECTED');
  const common = { lockedAt: null, errorCode: failure.code ?? null, errorMessage: failure.message.slice(0, 1000) };

  if (failure.kind === 'retryable' && attempts < MAX_ATTEMPTS) {
    const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
    await prisma.publishJob.update({
      where: { id: jobId },
      data: { ...common, status: 'PENDING', runAt: new Date(Date.now() + Math.max(backoff, failure.retryAfterMs ?? 0)) },
    });
    return;
  }
  if (failure.kind === 'auth' && accountId) {
    await prisma.connectedAccount.update({ where: { id: accountId }, data: { status: 'NEEDS_RECONNECT' } });
  }
  await prisma.publishJob.update({
    where: { id: jobId },
    data: { ...common, status: failure.kind === 'ambiguous' ? 'NEEDS_REVIEW' : 'FAILED' },
  });
}

export async function runJob(jobId: string) {
  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    include: { account: true, post: { include: { mediaAsset: true } } },
  });
  if (!job || job.status !== 'PUBLISHING') return;

  try {
    if (!job.account) throw new PublishError('permanent', 'This account was disconnected.', 'NO_ACCOUNT');
    const asset = job.post.mediaAsset;
    const media: PublishMedia | null = asset && {
      url: publicMediaUrl(asset.storageKey),
      read: () => readUpload(asset.storageKey),
      mimeType: asset.mimeType,
      size: asset.fileSize,
      filename: path.basename(asset.filename),
      kind: isVideo(asset.mimeType) ? 'video' : 'image',
    };

    const token = await validToken(job.account);
    const result = await adapters[job.platform as Platform].publish({
      token,
      externalAccountId: job.account.externalAccountId,
      title: job.post.title,
      caption: job.caption,
      media,
      state: (job.state as Record<string, unknown> | null) ?? {},
      saveState: async (state) => {
        await prisma.publishJob.update({ where: { id: job.id }, data: { state: state as Prisma.InputJsonValue } });
      },
    });

    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCESS',
        lockedAt: null,
        externalId: result.externalId,
        externalUrl: result.externalUrl ?? null,
        errorCode: null,
        errorMessage: null,
        publishedAt: new Date(),
      },
    });
  } catch (error) {
    await finishWithError(job.id, job.attempts, job.accountId, error);
  }
}

export async function tick() {
  await recoverStaleJobs();
  const ids = await claimDueJobs();
  await Promise.all(ids.map(runJob));
  return ids.length;
}
