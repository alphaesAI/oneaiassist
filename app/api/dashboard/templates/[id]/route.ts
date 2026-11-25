import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const existing = await db.template.findFirst({
      where: { id: params.id, tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const body = await req.json();
    const finalHtml = body.htmlBody ?? existing.htmlBody ?? '';
    const finalPlain =
      body.plainText ??
      body.body ??
      (finalHtml ? finalHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : existing.body);

    const updated = await db.template.update({
      where: { id: params.id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.subject !== undefined ? { subject: body.subject } : {}),
        ...(body.htmlBody !== undefined ? { htmlBody: finalHtml } : {}),
        ...(body.jsonDesign !== undefined ? { jsonDesign: body.jsonDesign } : {}),
        body: finalPlain,
        content: finalPlain,
        plainText: finalPlain,
      },
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update template';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const existing = await db.template.findFirst({
      where: { id: params.id, tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await db.template.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete template';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
