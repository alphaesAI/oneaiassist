import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const lists = await db.contactList.findMany({
      where: { tenantId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        memberCount: l._count.members,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch lists' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;

    if (!name) {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }

    const list = await db.contactList.create({
      data: { tenantId, name, description },
    });
    return NextResponse.json({ list }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create list' }, { status: 500 });
  }
}
