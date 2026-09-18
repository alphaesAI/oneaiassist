import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { 'tenant-slug': string } }
) {
  try {
    const slug = params['tenant-slug'];
    const { customerId, conversationId, content } = await req.json();

    if (!customerId || !conversationId || !content) {
      return NextResponse.json({ error: 'customerId, conversationId, and content are required' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', $2, true);`,
        tenant.id,
        'PLATFORM_OWNER'
      );

      // 1. Verify conversation matches customer and tenant
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation || conversation.tenantId !== tenant.id || conversation.customerId !== customerId) {
        return { error: 'Conversation mismatch' };
      }

      // 2. Create Inbound Message
      const message = await tx.message.create({
        data: {
          tenantId: tenant.id,
          conversationId,
          direction: 'INBOUND',
          senderType: 'CUSTOMER',
          content,
          channel: 'WEBCHAT',
        },
      });

      // 3. Update conversation last message time
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      return { success: true, messageId: message.id };
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // 4. Trigger Webchat webhook in Baileys engine (running on unified port) to broadcast to socket rooms
    try {
      const baseUrl = process.env.WHATSAPP_ENGINE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
      await fetch(`${baseUrl}/api/whatsapp/webchat/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          conversationId,
          text: content,
          messageId: result.messageId,
        }),
      });
    } catch (err) {
      console.error('[Webchat Hook Trigger Failed]:', err);
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (err: any) {
    console.error('[Webchat Message Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
