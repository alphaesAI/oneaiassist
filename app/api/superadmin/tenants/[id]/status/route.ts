import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { status } = await req.json();
    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Toggle status (e.g. ACTIVE or SUSPENDED)
    const updatedTenant = await prisma.tenant.update({
      where: { id: params.id },
      data: {
        status,
      },
    });

    // Log this action to AuditLog
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
      await tx.auditLog.create({
        data: {
          tenantId: params.id,
          userId: session.user.id,
          action: status === 'SUSPENDED' ? 'SUSPEND_TENANT' : 'REACTIVATE_TENANT',
          metadata: {
            status,
            timestamp: new Date().toISOString()
          }
        }
      });
    });

    return NextResponse.json({ success: true, tenant: updatedTenant });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
