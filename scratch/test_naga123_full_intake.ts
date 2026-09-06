import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';
import { IntakeQualificationSkill } from '../lib/claw/IntakeQualificationSkill';
import { getTenantAIClient } from '../lib/ai/client';

async function runIntakeForNaga123() {
  console.log('================================================================');
  console.log('🚀 TESTING INTAKE QUALIFICATION FLOW FOR LEAD: naga123');
  console.log('================================================================');

  // 1. Get main tenant
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'apex-assurance' },
  });

  if (!tenant) {
    throw new Error('Tenant apex-assurance not found');
  }

  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'ADMIN');
  const aiClient = await getTenantAIClient(tenantId);

  // 2. Find or create Customer naga123
  let customer = await db.customer.findFirst({
    where: { displayName: 'naga123' },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        tenantId,
        displayName: 'naga123',
        primaryPhone: '+1 555-0999',
        otpVerified: true,
        optedIn: true,
      },
    });
    console.log(`✅ Created Customer: ${customer.displayName} (${customer.id})`);
  } else {
    console.log(`ℹ️ Found existing Customer: ${customer.displayName} (${customer.id})`);
  }

  // 3. Find or create Lead naga123
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
        intakeBudgetMax: 30000,
      },
    });
    console.log(`✅ Created Lead: ${lead.id} with status NEW`);
  } else {
    console.log(`ℹ️ Found existing Lead: ${lead.id} with status ${lead.status}`);
  }

  // 4. Find or create Conversation
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

  // Define conversation turn-by-turn messages from customer naga123
  const turns = [
    "Hi, I want to get insurance for my family.",
    "I am 42 years old and reside in TX.",
    "No health conditions. My budget is $150 to $300 per month and I have a family size of 4 members."
  ];

  const history: any[] = [];

  for (let i = 0; i < turns.length; i++) {
    const userMsg = turns[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`💬 TURN ${i + 1} - Customer naga123: "${userMsg}"`);

    // Record user message in DB & local history
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

    // Execute IntakeQualificationSkill turn
    const botReply = await IntakeQualificationSkill.runTurn({
      tenantId,
      lead,
      conversation,
      history,
      aiClient,
      db,
    });

    console.log(`🤖 BOT RESPONSE: "${botReply}"`);

    // Record bot response in DB & local history
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

    // Inspect updated IntakeSession state after turn
    const currentSession = await db.intakeSession.findUnique({
      where: { leadId: lead.id },
    });
    console.log(`📊 IntakeSession Collected Fields after Turn ${i + 1}:`, currentSession?.collectedFields);
  }

  // 5. Final Verification of Lead & Session
  const finalLead = await db.lead.findUnique({
    where: { id: lead.id },
    include: { customer: true, intakeSession: true },
  });

  console.log('\n================================================================');
  console.log('🎉 FINAL VERIFICATION OF LEAD RECORD FOR naga123:');
  console.log('================================================================');
  console.log({
    leadId: finalLead?.id,
    customerName: finalLead?.customer.displayName,
    leadStatus: finalLead?.status,
    intakeAge: finalLead?.intakeAge,
    intakeState: finalLead?.intakeState,
    intakeHealthConditions: finalLead?.intakeHealthConditions,
    intakeBudgetMin: finalLead?.intakeBudgetMin ? `$${finalLead.intakeBudgetMin / 100}` : null,
    intakeBudgetMax: finalLead?.intakeBudgetMax ? `$${finalLead.intakeBudgetMax / 100}` : null,
    intakeFamilySize: finalLead?.intakeFamilySize,
    recommendedPoliciesCount: finalLead?.recommendedPolicyIds?.length || 0,
    sessionStatus: finalLead?.intakeSession?.status,
    collectedFields: finalLead?.intakeSession?.collectedFields,
  });

  if (finalLead?.status === 'QUALIFIED' && finalLead?.intakeAge === 42 && finalLead?.intakeState === 'TX') {
    console.log('\n✅ SUCCESS: All intake qualification information collected and saved for naga123!');
  } else {
    console.error('\n❌ FAILURE: Intake qualification did not complete successfully.');
  }
}

runIntakeForNaga123().catch(console.error).finally(() => prisma.$disconnect());
