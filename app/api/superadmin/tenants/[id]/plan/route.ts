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

    const { plan } = await req.json();
    if (!plan) {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 });
    }

    // No RLS on Tenant table, so we can update directly
    const updatedTenant = await prisma.tenant.update({
      where: { id: params.id },
      data: {
        subscriptionPlan: plan,
      },
    });

    // Log the change in AuditLog
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
      await tx.auditLog.create({
        data: {
          tenantId: params.id,
          userId: session.user.id,
          action: 'OVERRIDE_PLAN',
          metadata: {
            newPlan: plan,
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
