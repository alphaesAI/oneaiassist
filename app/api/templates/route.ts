import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { EmailTemplateEngine } from '@/lib/email/templateEngine';
import { WhatsAppTemplateError, WhatsAppTemplateService } from '@/lib/whatsapp/templateService';
import { normalizeButtons, normalizeTemplateName } from '@/lib/whatsapp/templateRules';

export async function GET(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const channel = searchParams.get('channel');

    const where: any = { tenantId };

    if (channel && channel !== 'ALL') {
      where.channel = channel;
    }
    if (category && category !== 'ALL') {
      where.category = category;
    }
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }

    const templates = await db.template.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        name: true,
        category: true,
        channel: true,
        language: true,
        subject: true,
        previewText: true,
        htmlBody: true,
        plainText: true,
        jsonDesign: true,
        body: true,
        content: true,
        header: true,
        footer: true,
        ctaButtons: true,
        status: true,
        headerType: true,
        variables: true,
        metaTemplateId: true,
        metaStatus: true,
        rejectionReason: true,
        qualityScore: true,
        submittedAt: true,
        lastSyncedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ templates });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const bodyData = await req.json();
    const {
      name,
      channel = 'WHATSAPP',
      category = 'MARKETING',
      language = 'en',
      body = '',
      subject,
      previewText,
      htmlBody,
      plainText,
      jsonDesign,
      headerType = 'NONE',
      header,
      footer,
      ctaButtons,
      variables,
      autoSubmit = false,
    } = bodyData;

    if (!name) {
      return NextResponse.json(
        { error: 'Template name is required.' },
        { status: 400 }
      );
    }

    if (channel === 'EMAIL' && !htmlBody && !body) {
      return NextResponse.json(
        { error: 'Email template HTML body content is required.' },
        { status: 400 }
      );
    }

    // Template names are lowercase letters, numbers and underscores (Meta's rule for WhatsApp).
    const formattedName = normalizeTemplateName(name);
    if (!formattedName) {
      return NextResponse.json({ error: 'Template name must contain letters or numbers.' }, { status: 400 });
    }
    if (channel === 'WHATSAPP' && !String(body || '').trim()) {
      return NextResponse.json({ error: 'The message body is required.' }, { status: 400 });
    }

    // Check duplicate name per tenant
    const existing = await db.template.findFirst({
      where: { tenantId, name: formattedName },
      select: { id: true, name: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Template with name "${formattedName}" already exists.` },
        { status: 400 }
      );
    }

    // A WhatsApp template always starts as a draft. It becomes PENDING only when Meta accepts the
    // submission, and APPROVED only when Meta approves it. Email templates need no outside review.
    const initialStatus = channel === 'EMAIL' ? 'APPROVED' : 'DRAFT';
    const isWhatsApp = channel === 'WHATSAPP';
    const cleanHeaderType = isWhatsApp ? String(headerType || 'NONE').toUpperCase() : 'NONE';

    const rawHtml = htmlBody || (channel === 'EMAIL' ? body : '') || '';
    const finalHtml = rawHtml ? EmailTemplateEngine.sanitizeHtml(rawHtml) : '';
    const finalPlain = plainText || (finalHtml ? EmailTemplateEngine.htmlToPlainText(finalHtml) : '');

    const template = await db.template.create({
      data: {
        tenantId,
        name: formattedName,
        channel: channel as any,
        category,
        language,
        subject: subject || null,
        previewText: previewText || null,
        htmlBody: finalHtml || null,
        plainText: finalPlain || null,
        jsonDesign: jsonDesign || null,
        body: body || finalPlain || '',
        content: body || finalPlain || '',
        headerType: cleanHeaderType,
        header: isWhatsApp && cleanHeaderType === 'NONE' ? null : header,
        footer,
        ctaButtons: isWhatsApp ? (normalizeButtons(ctaButtons) as any) : ctaButtons || [],
        variables: isWhatsApp && variables && typeof variables === 'object' ? variables : undefined,
        status: initialStatus as any,
      },
    });

    if (autoSubmit && isWhatsApp) {
      try {
        const submitted = await WhatsAppTemplateService.submit(tenantId, template.id);
        return NextResponse.json({ template: submitted, success: true, submitted: true }, { status: 201 });
      } catch (err) {
        // The draft is kept so no work is lost; the reason it was not submitted is reported.
        const submitError = err instanceof WhatsAppTemplateError ? err.message : 'The template could not be submitted to Meta.';
        const problems = err instanceof WhatsAppTemplateError ? err.problems : [];
        return NextResponse.json({ template, success: true, submitted: false, submitError, problems }, { status: 201 });
      }
    }

    return NextResponse.json({ template, success: true, submitted: false }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
