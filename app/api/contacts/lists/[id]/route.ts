import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { id } = await params;

    const list = await db.contactList.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { members: true } } },
    });
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    return NextResponse.json({ list: { ...list, memberCount: list._count.members } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch list' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.contactList.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    const list = await db.contactList.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description).trim() : null } : {}),
      },
    });
    return NextResponse.json({ list });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update list' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { id } = await params;

    const existing = await db.contactList.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    await db.contactList.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete list' }, { status: 500 });
  }
}
