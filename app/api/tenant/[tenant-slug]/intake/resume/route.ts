import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { 'tenant-slug': string } }
) {
  try {
    const slug = params['tenant-slug'];
    const { customerId, phoneNumber } = await req.json();

    if (!customerId || !phoneNumber) {
      return NextResponse.json({ error: 'customerId and phoneNumber are required' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const resumeLink = `http://localhost:3000/${slug}/intake?customerId=${customerId}`;

    // Print to dev server console logs for audit / stub delivery
    console.log('\n==================================================');
    console.log(`[WIZARD RESUME STUB] Sending resume link to ${cleanPhone}:`);
    console.log(resumeLink);
    console.log('==================================================\n');

    // Optional: send to Socket.io to log in Live Inbox if conversation exists
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', $2, true);`,
          tenant.id,
          'PLATFORM_OWNER'
        );

        // Find conversation
        const conversation = await tx.conversation.findFirst({
          where: {
            tenantId: tenant.id,
            customerId,
            channel: 'WEBCHAT',
            status: 'OPEN',
          },
        });

        if (conversation) {
          // Log outbound system/bot message in chat history
          const msg = await tx.message.create({
            data: {
              tenantId: tenant.id,
              conversationId: conversation.id,
              direction: 'OUTBOUND',
              senderType: 'BOT',
              content: `Here is the link to resume your intake wizard: ${resumeLink}`,
              channel: 'WEBCHAT',
            },
          });

          // Trigger webhook on port 3001
          await fetch('http://localhost:3001/api/whatsapp/webchat/inbound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenantId: tenant.id,
              conversationId: conversation.id,
              text: msg.content,
              messageId: msg.id,
            }),
          });
        }
      });
    } catch (err) {
      console.error('[Webchat System Resume Hook Trigger Failed]:', err);
    }

    return NextResponse.json({ success: true, resumeLink });
  } catch (err: any) {
    console.error('[Intake Resume Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
