import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { prisma, getTenantPrisma } from '@/lib/db';
import { isTrialExceeded } from '@/lib/ai/client';

export async function GET() {
  try {
    const { tenantId, role, userId } = await getTenantContext();

    // Tenant has no RLS, so default client works
    let tenantName = 'Platform (Super Admin)';
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      tenantName = tenant?.name || 'Unknown Tenant';
    }

    // User table has RLS, so we MUST use the tenant-scoped client getTenantPrisma
    const db = getTenantPrisma(tenantId, role);
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const trialExceeded = tenantId ? await isTrialExceeded(tenantId) : false;

    return NextResponse.json({
      tenantName,
      email: user?.email || '',
      role,
      tenantId,
      aiTrialExceeded: trialExceeded,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
