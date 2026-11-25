import type { ConnectedAccount } from '@prisma/client';
import { HttpError } from './http';
import { validToken } from './oauth';
import { metaGraph, PERMISSION_CODES } from './platforms/meta';
import { PublishError } from './platforms/types';
import { prisma } from './prisma';

/** How often each account's comments and metrics are refreshed. */
export const SYNC_INTERVAL_MS = 30 * 60_000;
/** Posts older than this are no longer refreshed. */
export const SYNC_WINDOW_DAYS = 30;
const MAX_POSTS_PER_SYNC = 25;
const MAX_COMMENTS_PER_POST = 50;
const SYNCED_PLATFORMS = ['FACEBOOK', 'INSTAGRAM'];
const GRAPH_ID = /^[\w.-]{1,100}$/;

const PERMISSION_HINT = 'Reconnect this account and allow access to comments and insights.';

// ---------------------------------------------------------------------------
// Reading from Meta
// ---------------------------------------------------------------------------

interface MetricValues {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  views?: number | null;
}

function metaCode(error: unknown): number | null {
  const match = error instanceof PublishError ? error.code?.match(/^META_(\d+)$/) : null;
  return match ? Number(match[1]) : null;
}

function isPermissionError(error: unknown): boolean {
  const code = metaCode(error);
  return code !== null && PERMISSION_CODES.includes(code);
}

/** A dead token: the account must be reconnected before anything works again. */
function isDeadToken(error: unknown): boolean {
  return metaCode(error) === 190;
}

type InsightRow = { name: string; values?: { value: unknown }[]; total_value?: { value: unknown } };

function readInsight(row: InsightRow): number | null {
  const raw = row.total_value?.value ?? row.values?.[0]?.value;
  return typeof raw === 'number' ? raw : null;
}

/**
 * Asks for several insight metrics at once. Meta rejects the whole call when one metric name is
 * not available for this post (and it renames metrics between versions), so on failure each
 * metric is asked for separately and the missing ones are left out.
 */
async function insights(id: string, token: string, metrics: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  const ask = async (names: string[]) => {
    const { data } = await metaGraph<{ data: InsightRow[] }>(`/${id}/insights?metric=${names.join(',')}`, token);
    for (const row of data ?? []) out[row.name] = readInsight(row);
  };
  try {
    await ask(metrics);
  } catch (error) {
    if (isPermissionError(error) || isDeadToken(error)) throw error;
    for (const name of metrics) {
      try {
        await ask([name]);
      } catch (inner) {
        if (isPermissionError(inner) || isDeadToken(inner)) throw inner;
      }
    }
  }
  return out;
}

const first = (values: Record<string, number | null>, names: string[]) =>
  names.map((n) => values[n]).find((v) => typeof v === 'number') ?? null;

/** Counts anyone can see (likes, comments, shares), then reach and views when allowed. */
export async function fetchPostMetrics(platform: string, postId: string, token: string): Promise<MetricValues> {
  if (platform === 'FACEBOOK') {
    const post = await metaGraph<{
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    }>(`/${postId}?fields=reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares`, token);
    const result: MetricValues = {
      likes: post.reactions?.summary?.total_count ?? null,
      comments: post.comments?.summary?.total_count ?? null,
      shares: post.shares?.count ?? 0,
    };
    // Meta is moving Page metrics from "impressions" to "views"; whichever this post supports wins
    const values = await insights(postId, token, [
      'post_media_view', 'post_impressions', 'post_total_media_view_unique', 'post_impressions_unique',
    ]).catch((error) => {
      if (isDeadToken(error)) throw error;
      return {} as Record<string, number | null>;
    });
    result.views = first(values, ['post_media_view', 'post_impressions']);
    result.reach = first(values, ['post_total_media_view_unique', 'post_impressions_unique']);
    return result;
  }

  const media = await metaGraph<{ like_count?: number; comments_count?: number }>(
    `/${postId}?fields=like_count,comments_count`, token,
  );
  const result: MetricValues = { likes: media.like_count ?? null, comments: media.comments_count ?? null };
  const values = await insights(postId, token, ['reach', 'views', 'saved', 'shares']).catch((error) => {
    if (isDeadToken(error)) throw error;
    return {} as Record<string, number | null>;
  });
  result.reach = values.reach ?? null;
  result.views = values.views ?? null;
  result.saves = values.saved ?? null;
  result.shares = values.shares ?? null;
  return result;
}

export interface PlatformComment {
  id: string;
  authorName: string;
  authorHandle: string | null;
  authorId: string | null;
  content: string;
  createdAt: Date;
  likeCount: number;
  isHidden: boolean;
}

/** The newest top-level comments on one post. */
export async function fetchPostComments(platform: string, postId: string, token: string): Promise<PlatformComment[]> {
  if (platform === 'FACEBOOK') {
    const { data } = await metaGraph<{
      data?: { id: string; message?: string; created_time?: string; from?: { id?: string; name?: string }; like_count?: number; is_hidden?: boolean }[];
    }>(
      `/${postId}/comments?fields=id,message,created_time,from{id,name},like_count,is_hidden&filter=toplevel&order=reverse_chronological&limit=${MAX_COMMENTS_PER_POST}`,
      token,
    );
    return (data ?? []).map((c) => ({
      id: c.id,
      authorName: c.from?.name || 'Facebook user',
      authorHandle: null,
      authorId: c.from?.id ?? null,
      content: c.message ?? '',
      createdAt: c.created_time ? new Date(c.created_time) : new Date(),
      likeCount: c.like_count ?? 0,
      isHidden: Boolean(c.is_hidden),
    }));
  }

  const { data } = await metaGraph<{
    data?: { id: string; text?: string; username?: string; timestamp?: string; like_count?: number; hidden?: boolean }[];
  }>(`/${postId}/comments?fields=id,text,username,timestamp,like_count,hidden&limit=${MAX_COMMENTS_PER_POST}`, token);
  return (data ?? []).map((c) => ({
    id: c.id,
    authorName: c.username || 'Instagram user',
    authorHandle: c.username ? `@${c.username}` : null,
    authorId: c.username ?? null,
    content: c.text ?? '',
    createdAt: c.timestamp ? new Date(c.timestamp) : new Date(),
    likeCount: c.like_count ?? 0,
    isHidden: Boolean(c.hidden),
  }));
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

function ownComment(account: ConnectedAccount, comment: PlatformComment): boolean {
  if (account.platform === 'FACEBOOK') return comment.authorId === account.externalAccountId;
  return comment.authorId?.toLowerCase() === account.accountName.replace(/^@/, '').toLowerCase();
}

/** Reads metrics and comments for one account's recent posts. Never changes anything on the platform. */
export async function syncAccount(account: ConnectedAccount): Promise<{ posts: number; comments: number; error: string | null }> {
  let token: string;
  try {
    token = await validToken(account);
  } catch (error) {
    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), syncError: error instanceof Error ? error.message.slice(0, 500) : 'Token error' },
    });
    return { posts: 0, comments: 0, error: 'token' };
  }

  const since = new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60_000);
  const jobs = await prisma.publishJob.findMany({
    where: { accountId: account.id, status: 'SUCCESS', externalId: { not: null }, publishedAt: { gte: since } },
    orderBy: { publishedAt: 'desc' },
    take: MAX_POSTS_PER_SYNC,
    select: { id: true, postId: true, externalId: true },
  });

  const problems = new Set<string>();
  let commentCount = 0;
  const note = (error: unknown) => {
    if (isDeadToken(error)) throw error;
    problems.add(isPermissionError(error) ? PERMISSION_HINT : error instanceof Error ? error.message.slice(0, 300) : 'Unknown error');
  };

  try {
    for (const job of jobs) {
      const externalId = job.externalId!;
      if (!GRAPH_ID.test(externalId)) continue;

      try {
        const m = await fetchPostMetrics(account.platform, externalId, token);
        const data = {
          likes: m.likes ?? null, comments: m.comments ?? null, shares: m.shares ?? null,
          saves: m.saves ?? null, reach: m.reach ?? null, views: m.views ?? null, fetchedAt: new Date(),
        };
        await prisma.postMetric.upsert({ where: { jobId: job.id }, create: { jobId: job.id, ...data }, update: data });
      } catch (error) {
        note(error);
      }

      try {
        const comments = await fetchPostComments(account.platform, externalId, token);
        for (const c of comments) {
          if (!GRAPH_ID.test(c.id) || !c.content.trim() || ownComment(account, c)) continue;
          const isQuestion = c.content.includes('?');
          await prisma.marketingComment.upsert({
            where: { accountId_externalId: { accountId: account.id, externalId: c.id } },
            create: {
              tenantId: account.tenantId,
              postId: job.postId,
              accountId: account.id,
              platform: account.platform,
              externalId: c.id,
              authorName: c.authorName.slice(0, 200),
              authorHandle: c.authorHandle?.slice(0, 200) ?? null,
              content: c.content.slice(0, 5000),
              isQuestion,
              sentiment: isQuestion ? 'QUESTION' : 'NEUTRAL',
              likeCount: c.likeCount,
              isHidden: c.isHidden,
              createdAt: c.createdAt,
            },
            update: { content: c.content.slice(0, 5000), likeCount: c.likeCount, isHidden: c.isHidden },
          });
          commentCount += 1;
        }
      } catch (error) {
        note(error);
      }
    }
  } catch (error) {
    // The token stopped working: publishing would fail too, so the person is asked to reconnect
    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: 'NEEDS_RECONNECT', lastSyncedAt: new Date(), syncError: 'The connection expired. Reconnect this account.' },
    });
    return { posts: 0, comments: 0, error: 'token' };
  }

  const error = problems.size ? [...problems].join(' ').slice(0, 1000) : null;
  await prisma.connectedAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(), syncError: error } });
  return { posts: jobs.length, comments: commentCount, error };
}

const dueWhere = (cutoff: Date) => ({
  platform: { in: SYNCED_PLATFORMS },
  status: 'ACTIVE',
  OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }],
});

/**
 * Syncs the accounts that are due. Each account is claimed first, so overlapping runs (cron and
 * worker, or two cron calls) never sync the same account at once.
 */
export async function syncDueAccounts(limit = 2): Promise<number> {
  const cutoff = new Date(Date.now() - SYNC_INTERVAL_MS);
  const due = await prisma.connectedAccount.findMany({
    where: dueWhere(cutoff),
    orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
  });
  let synced = 0;
  for (const account of due) {
    const { count } = await prisma.connectedAccount.updateMany({
      where: { id: account.id, ...dueWhere(cutoff) },
      data: { lastSyncedAt: new Date() },
    });
    if (count !== 1) continue;
    await syncAccount(account).catch((error) => console.error('Engagement sync failed:', error));
    synced += 1;
  }
  return synced;
}

/** "Sync now" for the workspace's Facebook and Instagram accounts. */
export async function syncWorkspaceAccounts(tenantId: string) {
  const accounts = await prisma.connectedAccount.findMany({
    where: { tenantId, platform: { in: SYNCED_PLATFORMS }, status: 'ACTIVE' },
  });
  const results = [];
  for (const account of accounts) {
    results.push({ accountId: account.id, accountName: account.accountName, ...(await syncAccount(account)) });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Acting on comments (only ever at the person's request)
// ---------------------------------------------------------------------------

async function ownedPlatformComment(userId: string, tenantId: string, commentId: string) {
  const comment = await prisma.marketingComment.findFirst({
    where: { id: commentId, tenantId, account: { tenantId } },
    include: { account: true },
  });
  if (!comment) throw new HttpError(404, 'Comment not found');
  if (!comment.externalId || !comment.account || !GRAPH_ID.test(comment.externalId)) {
    throw new HttpError(400, 'This comment was not read from a platform, so it cannot be answered there.');
  }
  if (!SYNCED_PLATFORMS.includes(comment.account.platform)) {
    throw new HttpError(400, 'Replying is only available for Facebook and Instagram.');
  }
  return { comment, account: comment.account, externalId: comment.externalId };
}

function platformFailure(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (isPermissionError(error)) throw new HttpError(403, PERMISSION_HINT);
  if (isDeadToken(error)) throw new HttpError(409, 'The connection expired. Reconnect this account.');
  throw new HttpError(502, error instanceof Error ? error.message : 'The platform did not accept the request.');
}

export async function replyToComment(user: { id: string; name: string; tenantId: string }, commentId: string, text: string) {
  const message = text.trim();
  if (!message) throw new HttpError(400, 'Write a reply first');
  const { comment, account, externalId } = await ownedPlatformComment(user.id, user.tenantId, commentId);
  try {
    const token = await validToken(account);
    const edge = account.platform === 'FACEBOOK' ? 'comments' : 'replies';
    await metaGraph(`/${externalId}/${edge}`, token, { body: { message }, options: { idempotent: false } });
  } catch (error) {
    platformFailure(error);
  }
  return prisma.marketingComment.update({
    where: { id: comment.id },
    data: { replyText: message, repliedAt: new Date(), repliedBy: user.name, status: 'REPLIED' },
  });
}

export async function setCommentHidden(user: { id: string; tenantId: string }, commentId: string, hidden: boolean) {
  const { comment, account, externalId } = await ownedPlatformComment(user.id, user.tenantId, commentId);
  try {
    const token = await validToken(account);
    const body: Record<string, string> = account.platform === 'FACEBOOK' ? { is_hidden: String(hidden) } : { hide: String(hidden) };
    await metaGraph(`/${externalId}`, token, { body, options: { idempotent: true } });
  } catch (error) {
    platformFailure(error);
  }
  return prisma.marketingComment.update({ where: { id: comment.id }, data: { isHidden: hidden } });
}

export async function setCommentLiked(user: { id: string; tenantId: string }, commentId: string, liked: boolean) {
  const { comment, account, externalId } = await ownedPlatformComment(user.id, user.tenantId, commentId);
  if (account.platform !== 'FACEBOOK') {
    throw new HttpError(400, 'Instagram does not let apps like comments. Reply instead.');
  }
  try {
    const token = await validToken(account);
    await metaGraph(`/${externalId}/likes`, token, liked
      ? { body: {}, options: { idempotent: true } }
      : { method: 'DELETE', options: { idempotent: true } });
  } catch (error) {
    platformFailure(error);
  }
  return prisma.marketingComment.update({ where: { id: comment.id }, data: { hasHeart: liked } });
}
