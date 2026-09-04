import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';
import { runAIAgentAutoResponse } from '../whatsapp-engine/engine-logic';

async function testInboundAutoResponse() {
  console.log('================================================================');
  console.log('🚀 TESTING INBOUND AI AUTO-RESPONSE & POLICY RECOMMENDATION');
  console.log('================================================================');

  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'apex-assurance' },
  });

  if (!tenant) throw new Error('Tenant apex-assurance not found');

  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // 1. Create a fresh test Customer
  const phone = `+1 555-${Math.floor(1000 + Math.random() * 9000)}`;
  const customer = await db.customer.create({
    data: {
      tenantId,
      displayName: 'Inbound Test Lead',
      primaryPhone: phone,
      otpVerified: true,
      optedIn: true,
    },
  });
  console.log(`✅ Created Customer: ${customer.displayName} (${phone}) ID: ${customer.id}`);

  // 2. Create Conversation
  const conversation = await db.conversation.create({
    data: {
      tenantId,
      customerId: customer.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
      automationEnabled: true,
    },
  });
  console.log(`✅ Created Conversation ID: ${conversation.id}`);

  // Mock Socket.io emitter & Baileys session
  const mockIo = {
    to: () => ({
      emit: (event: string, data: any) => {
        console.log(`📡 Socket Emit [${event}]:`, data?.message?.content?.substring(0, 60) || data);
      },
    }),
  };

  const { sessions } = await import('../whatsapp-engine/engine-logic');
  sessions.set(tenantId, {
    sendMessage: async (jid: string, content: any) => {
      console.log(`📤 Mock Baileys Dispatch to ${jid}: "${content.text?.substring(0, 60)}..."`);
      return { key: { id: `mock_${Date.now()}` } };
    },
  });

  const turns = [
    "Hi, I want to inquire about health insurance coverage options.",
    "I am 35 years old and live in TX.",
    "No health conditions. Budget is $150 to $300/mo for a family of 2."
  ];

  for (let i = 0; i < turns.length; i++) {
    const userText = turns[i];
    console.log(`\n💬 TURN ${i + 1} - Customer: "${userText}"`);

    // Create INBOUND customer message
    await db.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: userText,
        channel: 'WHATSAPP',
      },
    });

    // Execute runAIAgentAutoResponse
    await runAIAgentAutoResponse(tenantId, conversation.id, mockIo);

    // Fetch latest bot reply
    const lastBotMsg = await db.message.findFirst({
      where: { conversationId: conversation.id, senderType: 'BOT' },
      orderBy: { createdAt: 'desc' },
    });

    if (lastBotMsg) {
      console.log(`🤖 AI BOT REPLY: "${lastBotMsg.content}"`);
    }
  }

  // Final database audit
  const lead = await db.lead.findFirst({
    where: { customerId: customer.id },
    include: { intakeSession: true },
  });

  console.log('\n================================================================');
  console.log('🎉 E2E DATABASE VERIFICATION SUMMARY:');
  console.log('================================================================');
  console.log({
    leadId: lead?.id,
    customerPhone: customer.primaryPhone,
    leadStatus: lead?.status,
    intakeAge: lead?.intakeAge,
    intakeState: lead?.intakeState,
    intakeBudgetMin: lead?.intakeBudgetMin ? `$${lead.intakeBudgetMin / 100}` : null,
    intakeBudgetMax: lead?.intakeBudgetMax ? `$${lead.intakeBudgetMax / 100}` : null,
    intakeFamilySize: lead?.intakeFamilySize,
    recommendedPoliciesCount: lead?.recommendedPolicyIds ? (lead.recommendedPolicyIds as string[]).length : 0,
    sessionStatus: lead?.intakeSession?.status,
  });

  if (lead?.status === 'QUALIFIED' && lead.intakeSession?.status === 'COMPLETED') {
    console.log('\n✅ SUCCESS: Full inbound AI qualification & policy recommendation flow passed 100%!');
  }
}

testInboundAutoResponse().catch(console.error).finally(() => prisma.$disconnect());
