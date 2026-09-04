import 'dotenv/config';
import { AgentRouter } from '../whatsapp-engine/agents/AgentRouter';
import { getTenantPrisma, prisma } from '../lib/db';

async function run() {
  console.log('=== Running Gate 3.1: Dynamic Intake Progression & Validation Test ===');

  const testTenantId = 'tenant_pme_ff9xl';
  const testPhone = '+15557770001';
  const db = getTenantPrisma(testTenantId, 'ADMIN');

  // Clean up any previous test artifacts for this test phone
  const existingCustomer = await db.customer.findFirst({
    where: { tenantId: testTenantId, primaryPhone: testPhone },
  });

  if (existingCustomer) {
    const existingLeads = await db.lead.findMany({
      where: { tenantId: testTenantId, customerId: existingCustomer.id },
    });
    for (const l of existingLeads) {
      await db.intakeSession.deleteMany({ where: { leadId: l.id } });
      await db.lead.delete({ where: { id: l.id } });
    }
    await db.customer.delete({ where: { id: existingCustomer.id } });
  }

  // Ensure default dynamic intake questions exist for this tenant
  const count = await db.dynamicIntakeQuestion.count({ where: { tenantId: testTenantId } });
  if (count === 0) {
    await db.dynamicIntakeQuestion.createMany({
      data: [
        {
          tenantId: testTenantId,
          stepOrder: 1,
          fieldKey: 'age',
          questionPrompt: 'To find the best rates in your area, what is your current age?',
          validationType: 'NUMBER',
        },
        {
          tenantId: testTenantId,
          stepOrder: 2,
          fieldKey: 'state',
          questionPrompt: 'Which US state do you reside in (e.g. TX, CA, NY)?',
          validationType: 'US_STATE',
        },
        {
          tenantId: testTenantId,
          stepOrder: 3,
          fieldKey: 'family_size',
          questionPrompt: 'How many family members (including yourself) should this policy cover?',
          validationType: 'NUMBER',
        },
        {
          tenantId: testTenantId,
          stepOrder: 4,
          fieldKey: 'budget',
          questionPrompt: 'What is your target monthly budget for health coverage (e.g. $150 or $250/mo)?',
          validationType: 'CURRENCY',
        },
        {
          tenantId: testTenantId,
          stepOrder: 5,
          fieldKey: 'conditions',
          questionPrompt: 'Do you or any covered members have pre-existing conditions?',
          validationType: 'ENUM',
          options: ['None', 'Diabetes', 'Hypertension', 'Other'],
        },
      ],
    });
  }

  // Turn 0: Initial Greeting
  console.log('\n--- Turn 0: Initial Inbound Message ---');
  const resp0 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-001',
    rawMessage: 'Hi, I need health insurance',
    wamId: 'wam-turn-0',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp0.replyText);
  if (!resp0.replyText.toLowerCase().includes('age')) {
    throw new Error(`Turn 0 failed to ask initial age question. Got: ${resp0.replyText}`);
  }

  // Turn 1: Invalid age first (e.g. "I am 999 years old")
  console.log('\n--- Turn 1: Invalid Age Format ---');
  const resp1Bad = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-001',
    rawMessage: 'I am 999 years old',
    wamId: 'wam-turn-1-bad',
    senderPhone: testPhone,
  });
  console.log('Bot Response (Invalid Re-prompt):', resp1Bad.replyText);
  if (!resp1Bad.replyText.toLowerCase().includes('age')) {
    throw new Error('Turn 1 failed to reject out-of-bounds age');
  }

  // Turn 1: Valid age answer ("I am 35 years old")
  console.log('\n--- Turn 1: Valid Age Answer ---');
  const resp1 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-001',
    rawMessage: 'I am 35 years old',
    wamId: 'wam-turn-1',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp1.replyText);
  if (!resp1.replyText.toLowerCase().includes('state')) {
    throw new Error(`Turn 1 failed to advance to State question. Got: ${resp1.replyText}`);
  }

  // Turn 2: State Answer ("Texas")
  console.log('\n--- Turn 2: Valid State Answer ---');
  const resp2 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-001',
    rawMessage: 'Texas',
    wamId: 'wam-turn-2',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp2.replyText);
  if (!resp2.replyText.toLowerCase().includes('family') && !resp2.replyText.toLowerCase().includes('many')) {
    throw new Error(`Turn 2 failed to advance to Family Size question. Got: ${resp2.replyText}`);
  }

  // Turn 3: Family Size Answer ("Just me and my spouse, so 2 people")
  console.log('\n--- Turn 3: Valid Family Size Answer ---');
  const resp3 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-001',
    rawMessage: 'Just me and my spouse, so 2 people',
    wamId: 'wam-turn-3',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp3.replyText);
  if (!resp3.replyText.toLowerCase().includes('budget')) {
    throw new Error(`Turn 3 failed to advance to Budget question. Got: ${resp3.replyText}`);
  }

  // Turn 4: Budget Answer ("how about $150 to $200 per month?") - Tests validation-first
  console.log('\n--- Turn 4: Valid Budget Range Answer ---');
  const resp4 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-001',
    rawMessage: 'how about $150 to $200 per month?',
    wamId: 'wam-turn-4',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp4.replyText);
  if (!resp4.replyText.toLowerCase().includes('condition') && !resp4.replyText.toLowerCase().includes('health')) {
    throw new Error(`Turn 4 failed to advance to Conditions question. Got: ${resp4.replyText}`);
  }

  // Turn 5: Conditions Answer ("None") - Completes Intake!
  console.log('\n--- Turn 5: Conditions Answer (Completion) ---');
  const resp5 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-001',
    rawMessage: 'None',
    wamId: 'wam-turn-5',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp5.replyText);
  if (!resp5.isComplete) {
    throw new Error('Turn 5 failed to complete intake session');
  }

  // Verify DB state
  const lead = await db.lead.findFirst({
    where: { tenantId: testTenantId, customer: { primaryPhone: testPhone } },
  });
  console.log('\nVerified Lead in DB:', {
    status: lead?.status,
    intakeAge: lead?.intakeAge,
    intakeState: lead?.intakeState,
    intakeBudgetMax: lead?.intakeBudgetMax,
    intakeFamilySize: lead?.intakeFamilySize,
    recommendedPolicyIds: lead?.recommendedPolicyIds,
  });

  if (lead?.intakeAge !== 35 || lead?.intakeState !== 'TX' || lead?.intakeBudgetMax !== 20000) {
    throw new Error('Lead qualification parameters did not sync correctly to DB');
  }

  console.log('\n✅ Gate 3.1: Dynamic Intake Progression & Validation Passed Perfectly!');
}

run().catch((err) => {
  console.error('❌ Gate 3.1 Failed:', err);
  process.exit(1);
});
