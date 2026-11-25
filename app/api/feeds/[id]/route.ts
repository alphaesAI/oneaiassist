import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

export const DELETE = authed(async (_req, user, { params }: { params: { id: string } }) => {
  const existing = await prisma.feed.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!existing) return json({ error: 'Feed not found' }, 404);

  await prisma.feed.delete({
    where: { id: params.id },
  });

  return json({ ok: true });
});
