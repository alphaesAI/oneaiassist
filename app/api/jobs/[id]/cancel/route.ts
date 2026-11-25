import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

export const POST = authed(async (_req, user, { params }: { params: { id: string } }) => {
  const { count } = await prisma.publishJob.updateMany({
    where: {
      id: params.id,
      tenantId: user.tenantId,
      status: 'PENDING',
    },
    data: {
      status: 'CANCELLED',
      lockedAt: null,
    },
  });

  if (!count) {
    return json({ error: 'Only pending jobs can be cancelled.' }, 409);
  }

  return json({ ok: true });
});
