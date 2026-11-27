import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  // Development aid only. In production a template status can only come from Meta.
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_TEMPLATE_SIMULATION !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    // An account on the official WhatsApp Cloud API never has its template status faked.
    const number = await db.whatsAppNumber.findUnique({ where: { tenantId }, select: { provider: true } });
    if (number?.provider === 'META_CLOUD_API') {
      return NextResponse.json(
        { error: 'This account uses the official WhatsApp API. Template status comes only from Meta.' },
        { status: 409 }
      );
    }

    const template = await db.template.findUnique({
      where: { id: params.id },
    });

    if (!template || template.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { targetStatus } = await req.json();

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
