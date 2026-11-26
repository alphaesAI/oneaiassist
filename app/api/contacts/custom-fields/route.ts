import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

const ALLOWED_TYPES = new Set(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT']);

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const fields = await db.customFieldDefinition.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ fields });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch custom fields' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const body = await req.json();

    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const rawKey = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : label;
    const key = rawKey.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    const fieldType = typeof body.fieldType === 'string' && ALLOWED_TYPES.has(body.fieldType.toUpperCase())
      ? body.fieldType.toUpperCase()
      : 'TEXT';

    if (!label || !key) {
      return NextResponse.json({ error: 'Field label and key are required' }, { status: 400 });
    }

    const field = await db.customFieldDefinition.create({
      data: {
        tenantId,
        key,
        label,
        fieldType,
        options: Array.isArray(body.options) ? body.options : undefined,
        required: Boolean(body.required),
      },
    });
    return NextResponse.json({ field }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create custom field' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Field id required' }, { status: 400 });

    const existing = await db.customFieldDefinition.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });

    await db.customFieldDefinition.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete custom field' }, { status: 500 });
  }
}
