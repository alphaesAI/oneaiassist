import { decrypt, encrypt } from './crypto';
import { prisma } from './prisma';

/** Warn this long before a connection stops working. */
export const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60_000;

export interface ConnectionWarning {
  kind: 'channel' | 'ads';
  id: string;
  name: string;
  platform: string;
  problem: 'RECONNECT' | 'EXPIRED' | 'EXPIRING';
  expiresAt: Date | null;
}

export async function connectionWarnings(tenantId: string, now = new Date()): Promise<ConnectionWarning[]> {
  const soon = new Date(now.getTime() + EXPIRY_WARNING_MS);
  const channels = await prisma.connectedAccount.findMany({
    where: {
      tenantId,
      OR: [{ status: 'NEEDS_RECONNECT' }, { refreshTokenEnc: null, expiresAt: { lte: soon } }],
    },
    select: { id: true, accountName: true, platform: true, status: true, expiresAt: true },
  });

  const problem = (status: string, expiresAt: Date | null): ConnectionWarning['problem'] =>
    status === 'NEEDS_RECONNECT' ? 'RECONNECT' : expiresAt && expiresAt <= now ? 'EXPIRED' : 'EXPIRING';

  return channels.map((c) => ({
    kind: 'channel' as const,
    id: c.id,
    name: c.accountName,
    platform: c.platform,
    problem: problem(c.status, c.expiresAt),
    expiresAt: c.expiresAt,
  }));
}

export async function refreshThreadsTokens(now = new Date()): Promise<number> {
  const accounts = await prisma.connectedAccount.findMany({
    where: { platform: 'THREADS', status: 'ACTIVE', expiresAt: { gt: now, lte: new Date(now.getTime() + EXPIRY_WARNING_MS) } },
    take: 20,
  });
  let refreshed = 0;
  for (const account of accounts) {
    const res = await fetch(`https://graph.threads.com/refresh_access_token?${new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: decrypt(account.accessTokenEnc),
    })}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    if (!data?.access_token || !data.expires_in) continue;
    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encrypt(data.access_token),
        expiresAt: new Date(Date.now() + Number(data.expires_in) * 1000),
      },
    });
    refreshed += 1;
  }
  return refreshed;
}
