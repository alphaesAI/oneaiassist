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
    const customerId = params.id;

    const notes = await db.customerNote.findMany({
      where: { customerId, tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(notes);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const customerId = params.id;

    const { content } = await req.json();
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Note content cannot be empty' }, { status: 400 });
    }

    const note = await db.customerNote.create({
      data: {
        tenantId,
        customerId,
        userId,
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          }
        }
      }
    });

    return NextResponse.json(note);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
