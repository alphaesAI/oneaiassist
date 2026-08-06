import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { tenantId, reason } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    if (!reason || reason.trim() === '') {
      return NextResponse.json({ error: 'A reason for impersonation is required' }, { status: 400 });
    }

    // 1. Verify the target tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Target tenant not found' }, { status: 404 });
    }

    // 2. Log impersonation event to AuditLog (Bypassing RLS because it's a platform admin action)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: 'IMPERSONATE_TENANT',
          metadata: {
            reason,
            timestamp: new Date().toISOString()
          }
        }
      });
    });

    // 3. Set the impersonation cookie
    const res = NextResponse.json({ success: true, tenantName: tenant.name });
    res.cookies.set('impersonated_tenant_id', tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return res;
  } catch (error: unknown) {
    console.error('Error during impersonation login:', error);
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Clear the impersonation cookie
    const res = NextResponse.json({ success: true });
    res.cookies.delete('impersonated_tenant_id');
    return res;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
