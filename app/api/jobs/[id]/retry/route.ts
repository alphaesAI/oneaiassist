import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

export const POST = authed(async (_req, user, { params }: { params: { id: string } }) => {
  const { count } = await prisma.publishJob.updateMany({
    where: {
      id: params.id,
      tenantId: user.tenantId,
      status: { in: ['FAILED', 'NEEDS_REVIEW'] },
      accountId: { not: null },
    },
    data: {
      status: 'PENDING',
      runAt: new Date(),
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      lockedAt: null,
    },
  });

  if (!count) {
    return json({ error: 'Only failed jobs on a connected account can be retried.' }, 409);
  }

  return json({ ok: true });
});
