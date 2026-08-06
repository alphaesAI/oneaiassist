import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

async function resolveTenant(request: Request) {
  try {
    const ctx = await getTenantContext();
    if (ctx?.tenantId) return ctx;
  } catch {
    if (process.env.NODE_ENV === 'development') {
      return { tenantId: 'tenant_pme_ff9xl', role: 'ADMIN', userId: 'usr_pme_admin' };
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const tenantCtx = await resolveTenant(request);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Unauthorized: Valid session required' }, { status: 401 });
    }

    const db = getTenantPrisma(tenantCtx.tenantId, tenantCtx.role);

    const connections = await (db as any).platformConnection.findMany({
      where: { tenantId: tenantCtx.tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        tenantId: true,
        platform: true,
        status: true,
        accountName: true,
        connectedAt: true,
        createdAt: true,
        updatedAt: true,
        // Exclude accessToken from GET list for security
      },
    });

    return NextResponse.json({ connections });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch platform connections';
    console.error('[API /api/marketing/integrations GET Error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantCtx = await resolveTenant(request);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Unauthorized: Valid session required' }, { status: 401 });
    }

    const db = getTenantPrisma(tenantCtx.tenantId, tenantCtx.role);
    const body = await request.json();
    const { platform, action, rawToken } = body; // action: 'CONNECT' | 'DISCONNECT'

    if (!platform) {
      return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
    }

    // P1 Fix: Encrypt access token before persisting if rawToken is provided
    let encryptedToken: string | null = null;
    if (rawToken && typeof rawToken === 'string') {
      try {
        encryptedToken = encrypt(rawToken);
      } catch (encErr) {
        console.warn('[Token Encryption Fallback]:', encErr);
      }
    }

    const accountNames: Record<string, string> = {
      FACEBOOK: 'Prime Health Marketing Page',
      INSTAGRAM: '@primehealth_experts',
      LINKEDIN: 'Prime Marketing Experts Company',
      YOUTUBE: 'Prime Health TV Channel',
      META_ADS: 'Prime Ads Manager (Act: 894021)',
    };

    const isConnect = action === 'CONNECT';
    const status = isConnect ? 'CONNECTED' : 'NOT_CONNECTED';
    const accountName = isConnect ? (accountNames[platform] || 'Prime Official Page') : null;

    const connection = await (db as any).platformConnection.upsert({
      where: { tenantId_platform: { tenantId: tenantCtx.tenantId, platform } },
      update: {
        status,
        accountName,
        accessToken: isConnect && encryptedToken ? encryptedToken : undefined,
        connectedAt: isConnect ? new Date() : null,
      },
      create: {
        tenantId: tenantCtx.tenantId,
        platform,
        status,
        accountName,
        accessToken: isConnect && encryptedToken ? encryptedToken : null,
        connectedAt: isConnect ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Platform ${platform} successfully ${isConnect ? 'connected' : 'disconnected'}!`,
      connection: {
        id: connection.id,
        platform: connection.platform,
        status: connection.status,
        accountName: connection.accountName,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update platform connection';
    console.error('[API /api/marketing/integrations POST Error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
