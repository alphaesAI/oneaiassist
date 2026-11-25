import { authed, json } from '@/lib/marketing/auth';
import { CreatePostBody, createPost } from '@/lib/marketing/posts';
import { prisma } from '@/lib/marketing/prisma';
import { tick } from '@/lib/marketing/publisher';

export const GET = authed(async (_req, user) => {
  const posts = await prisma.marketingPost.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { jobs: { orderBy: { platform: 'asc' } }, mediaAsset: true },
  });
  return json({ posts });
});

export const POST = authed(async (req, user) => {
  const post = await createPost(user, CreatePostBody.parse(await req.json()));
  if (!post.scheduledAt) {
    // Non-blocking trigger of publishing tick
    setTimeout(() => {
      tick().catch(console.error);
    }, 100);
  }
  return json({ post }, 201);
});
