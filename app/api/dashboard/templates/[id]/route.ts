import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { EmailTemplateEngine } from '@/lib/email/templateEngine';

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

    if (existing.channel === 'WHATSAPP' && existing.status === 'PENDING') {
      return NextResponse.json(
        { error: 'This template is being reviewed by Meta and cannot be changed until the review is finished.' },
        { status: 409 }
      );
    }

    const body = await req.json();
    const rawHtml = body.htmlBody !== undefined ? body.htmlBody : (existing.htmlBody ?? '');
    const finalHtml = rawHtml ? EmailTemplateEngine.sanitizeHtml(rawHtml) : '';
    const finalPlain =
      body.plainText ??
      body.body ??
      (finalHtml ? EmailTemplateEngine.htmlToPlainText(finalHtml) : existing.body);

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
        // Changed WhatsApp content is no longer what Meta approved; it must be submitted again.
        ...(existing.channel === 'WHATSAPP' ? { status: 'DRAFT' as const, rejectionReason: null } : {}),
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
