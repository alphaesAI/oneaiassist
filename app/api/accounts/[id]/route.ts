import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

export const DELETE = authed(async (_req, user, { params }: { params: { id: string } }) => {
  const account = await prisma.connectedAccount.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!account) {
    return json({ error: 'Account not found' }, 404);
  }
  await prisma.connectedAccount.delete({
    where: { id: account.id },
  });
  return json({ success: true });
});
