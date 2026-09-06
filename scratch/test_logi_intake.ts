import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';
import { IntakeQualificationSkill } from '../lib/claw/IntakeQualificationSkill';
import { getTenantAIClient } from '../lib/ai/client';

async function testLogiIntake() {
  console.log('================================================================');
  console.log('🚀 TESTING INTAKE QUALIFICATION & MESSAGING FOR: logi (+91 82208 50596)');
  console.log('================================================================');

  // 1. Fetch main tenant
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'apex-assurance' },
  });

  if (!tenant) throw new Error('Tenant apex-assurance not found');

  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'ADMIN');
  const aiClient = await getTenantAIClient(tenantId, true);

  // 2. Create or find Customer logi
  let customer = await db.customer.findFirst({
    where: { displayName: 'logi' },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        tenantId,
        displayName: 'logi',
        primaryPhone: '+91 82208 50596',
        otpVerified: true,
        optedIn: true,
      },
    });
    console.log(`✅ Created Customer: ${customer.displayName} (+91 82208 50596) ID: ${customer.id}`);
  } else {
    console.log(`ℹ️ Found existing Customer: ${customer.displayName} ID: ${customer.id}`);
  }

  // 3. Create or find Lead logi
  let lead = await db.lead.findFirst({
    where: { customerId: customer.id },
  });

  if (!lead) {
    lead = await db.lead.create({
      data: {
        tenantId,
        customerId: customer.id,
        status: 'NEW',
        source: 'WhatsApp Broadcast',
        intakeBudgetMax: 40000,
      },
    });
    console.log(`✅ Created Lead for logi: ${lead.id}`);
  }

  // 4. Create or find Conversation
  let conversation = await db.conversation.findFirst({
    where: { customerId: customer.id },
  });

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenantId,
        customerId: customer.id,
        channel: 'WHATSAPP',
        status: 'OPEN',
      },
    });
    console.log(`✅ Created Conversation: ${conversation.id}`);
  }

  // Define multi-turn customer answers from logi
  const turns = [
    "Hello! I want to check health insurance policies for my family.",
    "I am 38 years old, living in TX.",
    "No health conditions. My budget is $200 to $400/mo for a family of 3."
  ];

  const history: any[] = [];

  for (let i = 0; i < turns.length; i++) {
    const userMsg = turns[i];
    console.log(`\n💬 TURN ${i + 1} - Customer logi: "${userMsg}"`);

    await db.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: userMsg,
        channel: 'WHATSAPP',
      },
    });

    history.push({ role: 'user', content: userMsg });

    const botReply = await IntakeQualificationSkill.runTurn({
      tenantId,
      lead,
      conversation,
      history,
      aiClient,
      db,
    });

    console.log(`🤖 BOT REPLY: "${botReply}"`);

    await db.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        senderType: 'BOT',
        content: botReply,
        channel: 'WHATSAPP',
      },
    });

    history.push({ role: 'assistant', content: botReply });
  }

  // Final verification
  const finalLead = await db.lead.findUnique({
    where: { id: lead.id },
    include: { customer: true, intakeSession: true },
  });

  console.log('\n================================================================');
  console.log('🎉 FINAL VERIFICATION FOR CUSTOMER logi:');
  console.log('================================================================');
  console.log({
    leadId: finalLead?.id,
    customerName: finalLead?.customer.displayName,
    phone: finalLead?.customer.primaryPhone,
    status: finalLead?.status,
    intakeAge: finalLead?.intakeAge,
    intakeState: finalLead?.intakeState,
    intakeBudgetMin: finalLead?.intakeBudgetMin ? `$${finalLead.intakeBudgetMin / 100}` : null,
    intakeBudgetMax: finalLead?.intakeBudgetMax ? `$${finalLead.intakeBudgetMax / 100}` : null,
    intakeFamilySize: finalLead?.intakeFamilySize,
    sessionStatus: finalLead?.intakeSession?.status,
  });

  if (finalLead?.status === 'QUALIFIED') {
    console.log('\n✅ SUCCESS: All intake qualification details collected and saved for logi!');
  }
}

testLogiIntake().catch(console.error).finally(() => prisma.$disconnect());
