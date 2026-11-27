import { z } from 'zod';
import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';
import { FeedArticle, parseRssXml } from '@/lib/marketing/rss';
import { isSafeUrl, safeFetch } from '@/lib/marketing/safe-fetch';

const AddFeedBody = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  feedUrl: z.string().url('Please provide a valid RSS/Atom URL'),
  siteUrl: z.string().nullish(),
  category: z.string().trim().max(50).default('Featured'),
});

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req, user) => {
  const feeds = await prisma.feed.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  const allArticles: FeedArticle[] = [];

  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const xml = await safeFetch(feed.feedUrl);
        if (xml) {
          const parsed = parseRssXml(xml, feed.title);
          allArticles.push(...parsed);
          return;
        }
      } catch {
        // unreachable feed
      }
    })
  );

  return json({
    feeds,
    articles: allArticles.sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    ),
  });
});

export const POST = authed(async (req, user) => {
  const input = AddFeedBody.parse(await req.json());

  const safe = await isSafeUrl(input.feedUrl);
  if (!safe) {
    return json({ error: 'Feed URL must be a publicly accessible HTTP/HTTPS address.' }, 400);
  }

  const existing = await prisma.feed.findFirst({
    where: {
      tenantId: user.tenantId,
      feedUrl: input.feedUrl,
    },
  });

  if (existing) {
    return json({ feed: existing, alreadySubscribed: true });
  }

  const feed = await prisma.feed.create({
    data: {
      tenantId: user.tenantId,
      title: input.title,
      feedUrl: input.feedUrl,
      siteUrl: input.siteUrl ?? null,
      category: input.category,
    },
  });

  return json({ feed, success: true }, 201);
});
