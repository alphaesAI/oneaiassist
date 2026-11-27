import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { EmailTemplateEngine } from '@/lib/email/templateEngine';
import { WhatsAppTemplateError, WhatsAppTemplateService } from '@/lib/whatsapp/templateService';
import { normalizeButtons, normalizeTemplateName } from '@/lib/whatsapp/templateRules';

export async function GET(
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

    return NextResponse.json({ template });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const existing = await db.template.findUnique({
      where: { id: params.id },
    });

    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const bodyData = await req.json();
    const { name, category, language, body, headerType, header, footer, ctaButtons, variables } = bodyData;

    const isWhatsApp = existing.channel === 'WHATSAPP';
    const knownToMeta = isWhatsApp && Boolean(existing.metaTemplateId);

    if (isWhatsApp && existing.status === 'PENDING') {
      return NextResponse.json(
        { error: 'This template is being reviewed by Meta and cannot be changed until the review is finished.' },
        { status: 409 }
      );
    }
    if (isWhatsApp && existing.status === 'DISABLED') {
      return NextResponse.json({ error: 'Meta disabled this template. Create a new one with a different name.' }, { status: 409 });
    }

    const formattedName = name ? normalizeTemplateName(name) || existing.name : existing.name;
    const nextLanguage = language || existing.language;
    // Meta identifies a template by its name and language, so they cannot change after submission.
    if (knownToMeta && (formattedName !== existing.name || nextLanguage !== existing.language)) {
      return NextResponse.json(
        { error: 'The name and language cannot be changed after a template was submitted to Meta. Create a new template instead.' },
        { status: 409 }
      );
    }
    if (formattedName !== existing.name) {
      const clash = await db.template.findFirst({ where: { tenantId, name: formattedName, NOT: { id: existing.id } }, select: { id: true } });
      if (clash) return NextResponse.json({ error: `Template with name "${formattedName}" already exists.` }, { status: 400 });
    }

    const sanitizedBody = body !== undefined ? (existing.channel === 'EMAIL' ? EmailTemplateEngine.sanitizeHtml(body) : body) : existing.body;
    const nextHeaderType = isWhatsApp ? String(headerType ?? existing.headerType ?? 'NONE').toUpperCase() : existing.headerType;

    const updated = await db.template.update({
      where: { id: params.id },
      data: {
        name: formattedName,
        category: category || existing.category,
        language: nextLanguage,
        body: sanitizedBody,
        content: sanitizedBody,
        ...(existing.channel === 'EMAIL' && body !== undefined ? { htmlBody: sanitizedBody } : {}),
        headerType: nextHeaderType,
        header: isWhatsApp && nextHeaderType === 'NONE' ? null : header ?? existing.header,
        footer: footer ?? existing.footer,
        ctaButtons: isWhatsApp && ctaButtons !== undefined ? (normalizeButtons(ctaButtons) as any) : ctaButtons ?? existing.ctaButtons,
        ...(isWhatsApp && variables && typeof variables === 'object' ? { variables } : {}),
        // Changed WhatsApp content is no longer what Meta approved: it must be submitted again
        // before it can be sent.
        ...(isWhatsApp ? { status: 'DRAFT' as const, rejectionReason: null } : {}),
      },
    });

    return NextResponse.json({ template: updated, success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId } = await getTenantContext();

    // Also deletes the template at Meta when it was submitted there.
    await WhatsAppTemplateService.remove(tenantId, params.id);

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (err: unknown) {
    if (err instanceof WhatsAppTemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
