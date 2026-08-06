import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: any = { tenantId };

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
      ];
    }

    const templates = await db.template.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        name: true,
        category: true,
        language: true,
        body: true,
        content: true,
        header: true,
        footer: true,
        ctaButtons: true,
        status: true,
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
      category = 'MARKETING',
      language = 'en',
      body,
      headerType = 'NONE',
      header,
      footer,
      ctaButtons,
      autoSubmit = false,
    } = bodyData;

    if (!name || !body) {
      return NextResponse.json(
        { error: 'Template name and body content are required.' },
        { status: 400 }
      );
    }

    // Format name to lowercase with underscores
    const formattedName = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_');

    // Check duplicate name
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

    let initialStatus = 'DRAFT';

    if (autoSubmit) {
      // Stub Meta API Submission
      // TODO: WhatsApp Business API / Meta Graph API Submission
      // POST https://graph.facebook.com/v18.0/{WABA_ID}/message_templates
      // Authorization: Bearer {META_ACCESS_TOKEN}
      // Payload: { name: formattedName, category, language, components: [...] }
      console.log(`[META TEMPLATE STUB] Submitting template "${formattedName}" to Meta WABA endpoint...`);
      initialStatus = 'PENDING';
    }

    const template = await db.template.create({
      data: {
        tenantId,
        name: formattedName,
        category,
        language,
        body,
        content: body, // compatibility
        header,
        footer,
        ctaButtons: ctaButtons || [],
        status: initialStatus as any,
      },
    });

    return NextResponse.json({ template, success: true }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
