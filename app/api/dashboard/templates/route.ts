import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const templates = await db.template.findMany({
      where: { tenantId },
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
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(templates);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const { name, category, language, body: templateBody, header, footer, ctaButtons, status } = body;

    if (!name || !templateBody) {
      return NextResponse.json({ error: 'Name and Body template are required' }, { status: 400 });
    }

    const template = await db.template.create({
      data: {
        tenantId,
        name,
        category: category || 'MARKETING',
        language: language || 'en',
        body: templateBody,
        content: templateBody, // keep content in sync
        header: header || null,
        footer: footer || null,
        ctaButtons: ctaButtons || null,
        status: status || 'APPROVED',
      },
    });

    return NextResponse.json(template);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
