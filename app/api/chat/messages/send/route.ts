import { NextResponse } from 'next/server';
import { getTenantPrisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { conversationId, tenantId, content } = await req.json();

    if (!conversationId || !tenantId || !content) {
      return NextResponse.json({ error: 'conversationId, tenantId, and content are required' }, { status: 400 });
    }

    // 1. Get tenant-scoped RLS client
    const db = getTenantPrisma(tenantId, 'ADMIN');

    // 2. Save INBOUND Message to DB using tenant-scoped client
    const dbMessage = await db.$transaction(async (tx) => {
      // Verify conversation exists
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          direction: 'INBOUND',
          senderType: 'CUSTOMER',
          content,
          channel: 'WEBCHAT',
        },
      });

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      return message;
    });

    // 3. Forward to whatsapp-engine webhook to broadcast and trigger bot replies
    const baseUrl = process.env.WHATSAPP_ENGINE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const engineRes = await fetch(`${baseUrl}/api/whatsapp/webchat/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        conversationId,
        text: content,
        messageId: dbMessage.id,
      }),
    });

    if (!engineRes.ok) {
      console.warn('[Chat Send] Failed to notify whatsapp-engine about inbound webchat message.');
    }

    return NextResponse.json({ success: true, messageId: dbMessage.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Message send failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
