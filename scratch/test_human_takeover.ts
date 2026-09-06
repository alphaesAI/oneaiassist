import 'dotenv/config';
import { getTenantPrisma } from '../lib/db';
import { IngressService } from '../whatsapp-engine/IngressService';
import { InboundJobWorker } from '../whatsapp-engine/InboundJobWorker';
import { sessions } from '../whatsapp-engine/engine-logic';

async function runGate43() {
  console.log('=== Running Gate 4.3: Live Inbox Human Takeover & AI Auto-Pilot Test ===');
  const tenantId = 'tenant_pme_ff9xl';
  const prisma = getTenantPrisma(tenantId, 'ADMIN');
  const testPhone = '+15554320099';
  const customerName = 'Human Takeover Test Customer';

  sessions.set(tenantId, {
    sendMessage: async (jid: string, content: any) => ({
      key: { id: `wamid.outbound.takeover.${Date.now()}` },
    }),
    ws: { readyState: 1 },
  } as any);

  const oldCust = await prisma.customer.findFirst({
    where: { tenantId, primaryPhone: testPhone },
  });
  if (oldCust) {
    await prisma.intakeSession.deleteMany({ where: { customerId: oldCust.id } });
    await prisma.inboundMessageJob.deleteMany({ where: { tenantId, customerId: oldCust.id } });
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

  const conversation = await prisma.conversation.create({
    data: {
      tenantId,
      customerId: customer.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
      automationEnabled: true,
    },
  });

  console.log('\n--- Step 1: Inbound Message with AI Auto-Pilot Enabled (automationEnabled = true) ---');
  const wamId1 = `wamid.takeover.test.${Date.now()}.1`;
  const ingressRes1 = await IngressService.receiveInboundMessage({
    tenantId,
    wamId: wamId1,
    from: testPhone,
    text: 'Hello, I want to start my health quote.',
  });
  console.log('Ingress Result 1 (AI Active):', ingressRes1);

  const job1 = await prisma.inboundMessageJob.findUnique({
    where: { tenantId_wamId: { tenantId, wamId: wamId1 } },
  });
  if (!job1) throw new Error('Job 1 not found in queue');

  const workerResult1 = await InboundJobWorker.processJob(job1);
  console.log('Worker Result 1:', workerResult1);

  if (!workerResult1.dispatchedAgent || workerResult1.dispatchedAgent !== 'NewCustomerAgent') {
    throw new Error(`Expected NewCustomerAgent dispatch, got ${workerResult1.dispatchedAgent}`);
  }

  console.log('\n--- Step 2: Human Agent Takes Over (automationEnabled = false) ---');
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { automationEnabled: false },
  });

  const wamId2 = `wamid.takeover.test.${Date.now()}.2`;
  const ingressRes2 = await IngressService.receiveInboundMessage({
    tenantId,
    wamId: wamId2,
    from: testPhone,
    text: 'I am 34 years old living in Dallas.',
  });
  console.log('Ingress Result 2 (AI Paused):', ingressRes2);

  const job2 = await prisma.inboundMessageJob.findUnique({
    where: { tenantId_wamId: { tenantId, wamId: wamId2 } },
  });
  if (!job2) throw new Error('Job 2 not found in queue');

  const workerResult2 = await InboundJobWorker.processJob(job2);
  console.log('Worker Result 2 (While Paused):', workerResult2);

  if (workerResult2.dispatchedAgent) {
    throw new Error(`Expected no agent dispatch during human takeover, got ${workerResult2.dispatchedAgent}`);
  }

  console.log('\n--- Step 3: Human Agent Resumes AI Auto-Pilot (automationEnabled = true) ---');
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { automationEnabled: true },
  });

  const wamId3 = `wamid.takeover.test.${Date.now()}.3`;
  await IngressService.receiveInboundMessage({
    tenantId,
    wamId: wamId3,
    from: testPhone,
    text: 'Can the AI helper take over again?',
  });

  const job3 = await prisma.inboundMessageJob.findUnique({
    where: { tenantId_wamId: { tenantId, wamId: wamId3 } },
  });
  if (!job3) throw new Error('Job 3 not found in queue');

  const workerResult3 = await InboundJobWorker.processJob(job3);
  console.log('Worker Result 3 (AI Resumed):', workerResult3);

  if (!workerResult3.dispatchedAgent) {
    throw new Error('Expected AI agent dispatch after resuming AI active mode');
  }

  console.log('\n✅ Gate 4.3: Live Inbox Human Takeover & AI Auto-Pilot Passed Perfectly!');

  await prisma.intakeSession.deleteMany({ where: { customerId: customer.id } });
  await prisma.inboundMessageJob.deleteMany({ where: { tenantId, customerId: customer.id } });
  await prisma.message.deleteMany({ where: { tenantId, conversationId: conversation.id } });
  await prisma.conversation.delete({ where: { id: conversation.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

runGate43().catch((err) => {
  console.error('❌ Gate 4.3 Failed:', err);
  process.exit(1);
});
