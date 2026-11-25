import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

export const GET = authed(async (req, user) => {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const platformParam = url.searchParams.get('platform');
  const sortParam = url.searchParams.get('sort') || 'unanswered';
  const dateRangeParam = url.searchParams.get('dateRange');

  const where: any = {
    tenantId: user.tenantId,
  };

  if (statusParam && statusParam !== 'ALL') {
    where.status = statusParam;
  }

  if (platformParam && platformParam !== 'ALL') {
    where.platform = platformParam;
  }

  if (dateRangeParam) {
    const now = new Date();
    let daysAgo = 365;
    if (dateRangeParam === '7d') daysAgo = 7;
    else if (dateRangeParam === '30d') daysAgo = 30;
    else if (dateRangeParam === '6m') daysAgo = 180;
    else if (dateRangeParam === '12m') daysAgo = 365;
    where.createdAt = {
      gte: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
    };
  }

  let orderBy: any = [{ createdAt: 'desc' }];
  if (sortParam === 'oldest') {
    orderBy = [{ createdAt: 'asc' }];
  } else if (sortParam === 'newest') {
    orderBy = [{ createdAt: 'desc' }];
  } else if (sortParam === 'unanswered') {
    orderBy = [{ status: 'desc' }, { createdAt: 'desc' }];
  }

  const comments = await prisma.marketingComment.findMany({
    where,
    orderBy,
    include: {
      post: {
        select: {
          id: true,
          title: true,
          caption: true,
          mediaAsset: true,
          createdAt: true,
        },
      },
      account: {
        select: {
          id: true,
          platform: true,
          accountName: true,
          lastSyncedAt: true,
          syncError: true,
        },
      },
    },
  });

  return json({ comments });
});
