import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const account = await db.instagramAccount.findUnique({
      where: { tenantId },
    });

    return NextResponse.json({
      connected: !!account,
      instagramId: account?.instagramId || '',
      username: account?.username || '',
      pageId: account?.pageId || '',
      status: account?.status || 'DISCONNECTED',
      createdAt: account?.createdAt || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const { instagramId, username, pageId, pageAccessToken } = body;

    if (!instagramId || !pageAccessToken) {
      return NextResponse.json({ error: 'instagramId and pageAccessToken are required' }, { status: 400 });
    }

    let encryptedToken = pageAccessToken;
    try {
      encryptedToken = encrypt(pageAccessToken);
    } catch {
      // Fallback
    }

    const cleanUsername = username ? username.replace(/^@/, '') : '';

    const account = await db.instagramAccount.upsert({
      where: { tenantId },
      create: {
        tenantId,
        instagramId,
        username: cleanUsername,
        pageId: pageId || '',
        pageAccessToken: encryptedToken,
        status: 'CONNECTED',
      },
      update: {
        instagramId,
        username: cleanUsername,
        pageId: pageId || '',
        pageAccessToken: encryptedToken,
        status: 'CONNECTED',
      },
    });

    await db.auditLog.create({
      data: {
        userId,
        tenantId,
        action: 'INSTAGRAM_CHANNEL_CONNECTED',
        metadata: { instagramId, username: cleanUsername },
      },
    });

    return NextResponse.json({
      success: true,
      connected: true,
      instagramId: account.instagramId,
      username: account.username,
      status: account.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating Instagram configuration';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    await db.instagramAccount.deleteMany({
      where: { tenantId },
    });

    await db.auditLog.create({
      data: {
        userId,
        tenantId,
        action: 'INSTAGRAM_CHANNEL_DISCONNECTED',
        metadata: {},
      },
    });

    return NextResponse.json({ success: true, connected: false, status: 'DISCONNECTED' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error disconnecting Instagram';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
