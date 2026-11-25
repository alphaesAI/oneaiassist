import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

export const GET = authed(async (_req, user) => {
  const accounts = await prisma.connectedAccount.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      platform: true,
      externalAccountId: true,
      accountName: true,
      status: true,
      lastSyncedAt: true,
      syncError: true,
      leadsEnabled: true,
      createdAt: true,
    },
  });
  return json({ accounts });
});
