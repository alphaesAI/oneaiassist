import { NextResponse, NextRequest } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // 1. Resolve Tenant ID by fetching conversation (via direct query without interactive transaction)
    const conversations = await prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT id, "tenantId" FROM "Conversation" WHERE id = ${conversationId} LIMIT 1;
    `;
    const conversation = conversations[0];

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Fetch messages using tenant-scoped RLS client
    const db = getTenantPrisma(conversation.tenantId, 'ADMIN');
    const messages = await db.message.findMany({
      where: { conversationId, tenantId: conversation.tenantId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(messages);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch messages';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
