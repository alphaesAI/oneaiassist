import { z } from 'zod';
import { authed, json } from '@/lib/marketing/auth';
import { replyToComment, setCommentHidden, setCommentLiked } from '@/lib/marketing/engagement';
import { prisma } from '@/lib/marketing/prisma';

const UpdateCommentBody = z.union([
  z.object({ replyText: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ hidden: z.boolean() }).strict(),
  z.object({ hasHeart: z.boolean() }).strict(),
  z.object({ status: z.enum(['UNANSWERED', 'REPLIED', 'RESOLVED']) }).strict(),
]);

const include = {
  post: { select: { id: true, title: true, caption: true } },
  account: { select: { id: true, platform: true, accountName: true } },
} as const;

export const PATCH = authed(async (req, user, { params }: { params: { id: string } }) => {
  const body = UpdateCommentBody.parse(await req.json());

  const existing = await prisma.marketingComment.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, authorName: true, account: { select: { platform: true } } },
  });
  if (!existing) return json({ error: 'Comment not found' }, 404);

  const actor = { id: user.id, name: user.email.split('@')[0], tenantId: user.tenantId };

  if ('replyText' in body) await replyToComment(actor, params.id, body.replyText);
  else if ('hidden' in body) await setCommentHidden(actor, params.id, body.hidden);
  else if ('hasHeart' in body) await setCommentLiked(actor, params.id, body.hasHeart);
  else await prisma.marketingComment.update({ where: { id: params.id }, data: { status: body.status } });

  const comment = await prisma.marketingComment.findUnique({ where: { id: params.id }, include });
  return json({ comment });
});

export const DELETE = authed(async (_req, user, { params }: { params: { id: string } }) => {
  const existing = await prisma.marketingComment.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!existing) return json({ error: 'Comment not found' }, 404);
  if (existing.externalId) {
    return json({ error: 'This comment is on the platform. Hide it instead; it would come back on the next sync.' }, 400);
  }
  await prisma.marketingComment.delete({ where: { id: params.id } });
  return json({ success: true });
});
