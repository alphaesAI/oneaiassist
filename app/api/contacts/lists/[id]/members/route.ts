import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { CrossChannelJourneyEngine } from '@/lib/email/journeyEngine';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { id: listId } = await params;
    const body = await req.json();
    const customerIds: string[] = Array.isArray(body.customerIds) ? body.customerIds : [];

    const list = await db.contactList.findFirst({ where: { id: listId, tenantId } });
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });
    if (customerIds.length === 0) return NextResponse.json({ added: 0 });

    // Ensure customers belong to tenantId
    const validCustomers = await db.customer.findMany({
      where: { tenantId, id: { in: customerIds } },
      select: { id: true },
    });

    // Only contacts who were not already on the list count as "joined".
    const alreadyMembers = await db.contactListMember.findMany({
      where: { tenantId, listId, customerId: { in: validCustomers.map((c) => c.id) } },
      select: { customerId: true },
    });
    const alreadyIds = new Set(alreadyMembers.map((m) => m.customerId));
    const newlyJoined = validCustomers.filter((c) => !alreadyIds.has(c.id));

    const result = await db.contactListMember.createMany({
      data: validCustomers.map((c) => ({ tenantId, listId, customerId: c.id })),
      skipDuplicates: true,
    });

    for (const c of newlyJoined) {
      await CrossChannelJourneyEngine.handleTrigger(tenantId, 'LIST_JOINED', { customerId: c.id, listId }).catch(
        (err) => console.error('[Journey Trigger] LIST_JOINED error:', err)
      );
    }

    return NextResponse.json({ added: result.count });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add members' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { id: listId } = await params;
    const body = await req.json().catch(() => ({}));
    const customerIds: string[] = Array.isArray(body.customerIds) ? body.customerIds : [];

    if (customerIds.length === 0) return NextResponse.json({ removed: 0 });

    const result = await db.contactListMember.deleteMany({
      where: { tenantId, listId, customerId: { in: customerIds } },
    });
    return NextResponse.json({ removed: result.count });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to remove members' }, { status: 500 });
  }
}
