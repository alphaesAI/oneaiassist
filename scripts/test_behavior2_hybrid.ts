import 'dotenv/config';
import { getTenantPrisma } from '../lib/db';
import { AgentRouter } from '../whatsapp-engine/agents/AgentRouter';
import { InboundJobWorker } from '../whatsapp-engine/InboundJobWorker';

async function runBehavior2HybridTest() {
  console.log('=== Running Test: Behavior 2 (Hybrid) Post-Escalation RAG & Human Takeover ===');
  const tenantId = 'tenant_pme_ff9xl';
  const prisma = getTenantPrisma(tenantId, 'ADMIN');
  const testPhone = '+15559988776';
  const customerName = 'Behavior 2 Hybrid Test Customer';

  // Clean up any existing test records
  const oldCust = await prisma.customer.findFirst({
    where: { tenantId, primaryPhone: testPhone },
  });
  if (oldCust) {
    await prisma.intakeSession.deleteMany({ where: { customerId: oldCust.id } });
    await prisma.inboundMessageJob.deleteMany({ where: { tenantId, senderPhone: testPhone } });
    await prisma.message.deleteMany({ where: { tenantId, conversation: { customerId: oldCust.id } } });
    await prisma.conversation.deleteMany({ where: { tenantId, customerId: oldCust.id } });
    await prisma.customer.delete({ where: { id: oldCust.id } });
  }

  const customer = await prisma.customer.create({
    data: {
      tenantId,
      displayName: customerName,
      primaryPhone: testPhone,
    },
  });

  const lead = await prisma.lead.create({
    data: {
      tenantId,
      customerId: customer.id,
      source: 'WhatsApp Inbound',
      status: 'QUALIFIED',
    },
  });

  await prisma.intakeSession.create({
    data: {
      tenantId,
      leadId: lead.id,
      customerId: customer.id,
      flowId: 'dynamic-intake-v1',
      flowVersion: '1.0',
      status: 'COMPLETED',
      currentFieldKey: null,
      collectedFields: { age: 35, state: 'TX', family_size: 2, budget: 200 },
      interruptionCount: 0,
      isComplete: true,
      completedAt: new Date(),
    },
  });

  // Create conversation that is ESCALATED (needsEscalation = true) but human hasn't clicked Take Over (automationEnabled = true)
  const conversation = await prisma.conversation.create({
    data: {
      tenantId,
      customerId: customer.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
      needsEscalation: true,
      escalationReason: 'Requested advisor to finalize enrollment',
      automationEnabled: true,
    },
  });

  console.log('\n--- Step 1: Inbound RAG Policy Query on Escalated Conversation (needsEscalation = true, automationEnabled = true) ---');
  const wamId1 = `wamid.b2.test.${Date.now()}.1`;

  const agentResponse1 = await AgentRouter.dispatchMessage({
    tenantId,
    conversationId: conversation.id,
    rawMessage: 'Is cataract covered and what is the waiting period?',
    wamId: wamId1,
    senderPhone: testPhone,
  });

  console.log('Agent Response 1 Agent Name:', agentResponse1.agentName);
  console.log('Agent Response 1 Action Taken:', agentResponse1.actionTaken);
  console.log('Agent Response 1 Reply Text:\n', agentResponse1.replyText);

  if (!agentResponse1.replyText || !agentResponse1.replyText.toLowerCase().includes('cataract')) {
    throw new Error('FAILED: Bot failed to retrieve RAG document answer for policy question on escalated conversation!');
  }

  // Check DB to ensure automationEnabled was NOT set to false by RAG query
  const convAfterStep1 = await prisma.conversation.findUnique({
    where: { id: conversation.id },
  });
  if (convAfterStep1?.automationEnabled === false) {
    throw new Error('FAILED: automationEnabled was set to false during hybrid RAG response!');
  }
  console.log('✅ Step 1 Verified: Bot successfully answered RAG document query on escalated conversation while keeping automationEnabled = true.');

  console.log('\n--- Step 2: Human Representative Clicks "Take Over" in Inbox Dashboard (automationEnabled = false) ---');
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      needsEscalation: true,
      automationEnabled: false,
    },
  });

  const wamId2 = `wamid.b2.test.${Date.now()}.2`;
  const job2 = await prisma.inboundMessageJob.create({
    data: {
      tenantId,
      wamId: wamId2,
      senderPhone: testPhone,
      payload: {
        text: 'Is maternity covered under this plan?',
        from: testPhone,
      },
      status: 'RECEIVED',
      attempts: 0,
      conversationId: conversation.id,
    },
  });

  // Test InboundJobWorker automation guard
  await InboundJobWorker.processSingleJob(job2.id, null);

  const updatedJob2 = await prisma.inboundMessageJob.findUnique({
    where: { id: job2.id },
  });
  console.log('Job 2 Status After Takeover Guard:', updatedJob2?.status);

  if (updatedJob2?.status !== 'COMPLETED') {
    throw new Error(`FAILED: Job status should be COMPLETED (skipped automated reply)! Got: ${updatedJob2?.status}`);
  }

  console.log('\n🎉 ✅ Behavior 2 (Hybrid) Test Passed Successfully!');

  // Clean up
  await prisma.intakeSession.deleteMany({ where: { customerId: customer.id } });
  await prisma.lead.deleteMany({ where: { customerId: customer.id } });
  await prisma.inboundMessageJob.deleteMany({ where: { tenantId, senderPhone: testPhone } });
  await prisma.message.deleteMany({ where: { tenantId, conversationId: conversation.id } });
  await prisma.conversation.delete({ where: { id: conversation.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

runBehavior2HybridTest().catch((err) => {
  console.error('❌ Behavior 2 (Hybrid) Test Failed:', err);
  process.exit(1);
});

