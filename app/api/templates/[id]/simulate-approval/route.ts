import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const template = await db.template.findUnique({
      where: { id: params.id },
    });

    if (!template || template.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { targetStatus, rejectionReason } = await req.json();

    if (!['APPROVED', 'REJECTED', 'PENDING', 'DRAFT'].includes(targetStatus)) {
      return NextResponse.json(
        { error: 'Invalid target status. Must be APPROVED, REJECTED, PENDING, or DRAFT.' },
        { status: 400 }
      );
    }

    const updated = await db.template.update({
      where: { id: params.id },
      data: {
        status: targetStatus,
      },
    });

    return NextResponse.json({
      success: true,
      template: updated,
      message: `[DEV SIMULATION] Template status set to ${targetStatus}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
