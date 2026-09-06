import 'dotenv/config';
import { AgentRouter } from '../whatsapp-engine/agents/AgentRouter';
import { getTenantPrisma, prisma } from '../lib/db';

async function run() {
  console.log('=== Running Gate 3.2: Brochure RAG Interruption & Interruption Guard Test ===');

  const testTenantId = 'tenant_pme_ff9xl';
  const testPhone = '+15557770002';
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

  // Turn 0: Start intake
  console.log('\n--- Turn 0: Start Intake ---');
  const resp0 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-rag-001',
    rawMessage: 'Hello, I want to explore health coverage',
    wamId: 'wam-rag-0',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp0.replyText);

  // Turn 1: Valid age
  console.log('\n--- Turn 1: Provide Age (30) ---');
  const resp1 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-rag-001',
    rawMessage: '30',
    wamId: 'wam-rag-1',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp1.replyText);

  // Turn 2 (Interruption 1): Ask informational question instead of state
  console.log('\n--- Turn 2 (Interruption 1): Ask Brochure Question ---');
  const resp2 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-rag-001',
    rawMessage: 'What is an insurance deductible and do you cover specialist doctors?',
    wamId: 'wam-rag-2',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp2.replyText);

  if (!resp2.replyText.includes('Returning to your quote') || !resp2.replyText.toLowerCase().includes('state')) {
    throw new Error('Interruption 1 failed to answer and anchor back to State question');
  }

  // Turn 3 (Interruption 2): Ask another question
  console.log('\n--- Turn 3 (Interruption 2): Ask Second Question ---');
  const resp3 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-rag-001',
    rawMessage: 'How do network co-pays work?',
    wamId: 'wam-rag-3',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp3.replyText);
  if (!resp3.replyText.includes('Returning to your quote')) {
    throw new Error('Interruption 2 failed to anchor back to State question');
  }

  // Turn 4 (Interruption 3): Ask third question
  console.log('\n--- Turn 4 (Interruption 3): Ask Third Question ---');
  const resp4 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-rag-001',
    rawMessage: 'Do you offer emergency hospital coverage?',
    wamId: 'wam-rag-4',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp4.replyText);

  // Turn 5 (Interruption 4): Interruption Guard Trigger!
  console.log('\n--- Turn 5 (Interruption 4 - Guard): Interruption Cap Reached ---');
  const resp5 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-rag-001',
    rawMessage: 'Can I also include dental insurance?',
    wamId: 'wam-rag-5',
    senderPhone: testPhone,
  });
  console.log('Bot Response (Interruption Guard):', resp5.replyText);

  if (!resp5.replyText.includes('happy to answer all your policy questions once we finish your quick quote')) {
    throw new Error('Interruption Guard failed to activate after 3 consecutive interruptions');
  }

  // Turn 6: Resume normal intake with State
  console.log('\n--- Turn 6: Resume Normal Intake with State (TX) ---');
  const resp6 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-test-rag-001',
    rawMessage: 'TX',
    wamId: 'wam-rag-6',
    senderPhone: testPhone,
  });
  console.log('Bot Response:', resp6.replyText);

  if (!resp6.replyText.toLowerCase().includes('family') && !resp6.replyText.toLowerCase().includes('many')) {
    throw new Error(`Turn 6 failed to resume state and advance to Family Size. Got: ${resp6.replyText}`);
  }

  console.log('\n✅ Gate 3.2: Brochure RAG Interruption & Interruption Guard Passed Perfectly!');
}

run().catch((err) => {
  console.error('❌ Gate 3.2 Failed:', err);
  process.exit(1);
});
