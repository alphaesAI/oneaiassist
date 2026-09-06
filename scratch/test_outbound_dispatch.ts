import 'dotenv/config';
import { MessageService } from '../whatsapp-engine/MessageService';
import { getTenantPrisma, prisma } from '../lib/db';
import { sessions } from '../whatsapp-engine/engine-logic';

async function run() {
  console.log('=== Running Gate 4.2: Outbound WhatsApp Dispatch & Delivery Sync Test ===');

  const testTenantId = 'tenant_pme_ff9xl';
  const testPhone = '+15559990001';
  const db = getTenantPrisma(testTenantId, 'ADMIN');

  // Register mock session for testing
  sessions.set(testTenantId, {
    sendMessage: async (jid: string, content: any) => ({
      key: { id: `wamid.outbound.test.${Date.now()}` },
    }),
    ws: { readyState: 1 },
  } as any);

  // Clean up
  const oldCust = await db.customer.findFirst({
    where: { tenantId: testTenantId, primaryPhone: testPhone },
  });
  if (oldCust) {
    await db.conversation.deleteMany({ where: { customerId: oldCust.id } });
    await db.customer.delete({ where: { id: oldCust.id } });
  }

  // 1. Create Customer & Conversation
  const customer = await db.customer.create({
    data: {
      tenantId: testTenantId,
      displayName: 'Dispatch Test Customer',
      primaryPhone: testPhone,
    },
  });

  const conversation = await db.conversation.create({
    data: {
      tenantId: testTenantId,
      customerId: customer.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
      automationEnabled: true,
    },
  });

  // Mock Socket.io
  const emittedEvents: Array<{ event: string; data: any }> = [];
  const mockIo = {
    to: (room: string) => ({
      emit: (event: string, data: any) => {
        emittedEvents.push({ event, data });
      },
    }),
  };

  // 2. Dispatch Outbound Message
  console.log('\n--- Step 1: Send Outbound WhatsApp Message ---');
  const clientMsgId = `cmsg_${Date.now()}_1`;
  const result = await MessageService.sendMessage(
    testTenantId,
    {
      to: testPhone,
      text: 'Hello! Here is your requested health insurance quote summary.',
      clientMessageId: clientMsgId,
      conversationId: conversation.id,
    },
    mockIo
  );

  console.log('Outbound Result:', result);
  if (!result.success || !result.messageId) {
    throw new Error('Step 1 failed: Outbound message sending failed');
  }

  // 3. Test ClientMessageId Idempotency
  console.log('\n--- Step 2: Idempotent Re-Send with Same clientMessageId ---');
  const duplicateResult = await MessageService.sendMessage(
    testTenantId,
    {
      to: testPhone,
      text: 'Duplicate message attempt',
      clientMessageId: clientMsgId,
      conversationId: conversation.id,
    },
    mockIo
  );

  console.log('Duplicate Result:', duplicateResult);
  if (!duplicateResult.duplicated || duplicateResult.messageId !== result.messageId) {
    throw new Error('Step 2 failed: Idempotent duplicate check failed');
  }

  // 4. Verify Message in Database & Socket.io Event
  const dbMsg = await db.message.findUnique({
    where: { id: result.messageId },
  });

  console.log('\nVerified DB Message:', {
    id: dbMsg?.id,
    direction: dbMsg?.direction,
    senderType: dbMsg?.senderType,
    status: dbMsg?.status,
  });

  if (dbMsg?.direction !== 'OUTBOUND' || dbMsg?.status !== 'SENT') {
    throw new Error('Step 4 failed: DB message status mismatch');
  }

  const newMsgEvent = emittedEvents.find((e) => e.event === 'new_message');
  if (!newMsgEvent) {
    throw new Error('Step 4 failed: Socket.io new_message event not emitted');
  }

  console.log('\n✅ Gate 4.2: Outbound WhatsApp Dispatch & Delivery Sync Passed Perfectly!');

  // Cleanup
  await db.message.deleteMany({ where: { conversationId: conversation.id } });
  await db.conversation.delete({ where: { id: conversation.id } });
  await db.customer.delete({ where: { id: customer.id } });
}

run().catch((err) => {
  console.error('❌ Gate 4.2 Failed:', err);
  process.exit(1);
});
