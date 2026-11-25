import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

export const POST = authed(async (_req, user, { params }: { params: { id: string } }) => {
  const { count } = await prisma.publishJob.updateMany({
    where: {
      id: params.id,
      tenantId: user.tenantId,
      status: 'NEEDS_REVIEW',
    },
    data: {
      status: 'SUCCESS',
      lockedAt: null,
      publishedAt: new Date(),
    },
  });

  if (!count) {
    return json({ error: 'Only jobs under review can be resolved.' }, 409);
  }

  return json({ ok: true });
});
