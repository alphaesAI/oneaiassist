import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

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
    const {
      name,
      category,
      language,
      body,
      headerType,
      header,
      footer,
      ctaButtons,
    } = bodyData;

    const formattedName = name
      ? name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')
      : existing.name;

    const updated = await db.template.update({
      where: { id: params.id },
      data: {
        name: formattedName,
        category: category || existing.category,
        language: language || existing.language,
        body: body ?? existing.body,
        content: body ?? existing.content,
        header: header ?? existing.header,
        footer: footer ?? existing.footer,
        ctaButtons: ctaButtons ?? existing.ctaButtons,
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
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const existing = await db.template.findUnique({
      where: { id: params.id },
    });

    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await db.template.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
