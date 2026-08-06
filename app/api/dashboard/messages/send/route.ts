import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { conversationId, text } = await req.json();

    if (!conversationId || !text) {
      return NextResponse.json({ error: 'conversationId and text are required' }, { status: 400 });
    }

    // 1. Fetch Conversation details
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Call WhatsApp send helper (handles RLS and forward to engine)
    const result = await sendWhatsAppMessage({
      tenantId,
      customerId: conversation.customerId,
      text,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
