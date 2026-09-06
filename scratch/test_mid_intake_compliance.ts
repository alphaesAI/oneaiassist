import 'dotenv/config';
import { AgentRouter } from '../whatsapp-engine/agents/AgentRouter';
import { getTenantPrisma, prisma } from '../lib/db';

async function run() {
  console.log('=== Running Gate 3.5: Mid-Intake Hard Compliance Gate Interception Test ===');

  const testTenantId = 'tenant_pme_ff9xl';
  const testPhone = '+15557770005';
  const db = getTenantPrisma(testTenantId, 'ADMIN');

  // Clean up any previous test customer
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

  // Create Customer first
  const customer = await db.customer.create({
    data: {
      tenantId: testTenantId,
      displayName: 'Prospect Inactive',
      primaryPhone: testPhone,
    },
  });

  // Create Conversation record
  let conversation = await db.conversation.create({
    data: {
      tenantId: testTenantId,
      customerId: customer.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
      automationEnabled: true,
      needsEscalation: false,
    },
  });

  // Turn 0: Start intake
  console.log('\n--- Turn 0: Start Intake Session ---');
  const resp0 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: conversation.id,
    rawMessage: 'Hi, I need insurance quote',
    wamId: 'wam-comp-mid-0',
    senderPhone: testPhone,
  });
  console.log('Bot Response 0:', resp0.replyText);

  // Turn 1: Valid age
  console.log('\n--- Turn 1: Provide Age (42) ---');
  const resp1 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: conversation.id,
    rawMessage: '42',
    wamId: 'wam-comp-mid-1',
    senderPhone: testPhone,
  });
  console.log('Bot Response 1:', resp1.replyText);

  // Turn 2: Mid-Intake Hard Compliance Gate Trigger!
  console.log('\n--- Turn 2: Mid-Intake Regulatory & Legal Threat ---');
  const resp2 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: conversation.id,
    rawMessage: 'This company is a scam, I am filing a complaint with the state insurance commissioner and hiring an attorney for a lawsuit!',
    wamId: 'wam-comp-mid-2',
    senderPhone: testPhone,
  });

  console.log('Bot Response 2 (Compliance Holding Message):\n', resp2.replyText);

  if (resp2.agentName !== 'ComplianceSupervisor' || resp2.actionTaken !== 'HUMAN_ESCALATED') {
    throw new Error('Gate 3.5 failed: Message was not intercepted by ComplianceSupervisor');
  }

  // Verify Conversation Escalation Status in DB
  const updatedConv = await db.conversation.findUnique({
    where: { id: conversation.id },
  });

  console.log('\nVerified Conversation in DB:', {
    needsEscalation: updatedConv?.needsEscalation,
    automationEnabled: updatedConv?.automationEnabled,
    escalationReason: updatedConv?.escalationReason,
  });

  if (!updatedConv?.needsEscalation || updatedConv?.automationEnabled !== false) {
    throw new Error('Gate 3.5 failed: Conversation was not escalated in DB');
  }

  // Verify AuditLog record
  const auditLogs = await db.auditLog.findMany({
    where: {
      tenantId: testTenantId,
      action: { contains: 'COMPLIANCE' },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  console.log('Verified AuditLog in DB:', auditLogs[0]?.action);
  if (auditLogs.length === 0) {
    throw new Error('Gate 3.5 failed: No AuditLog created for compliance escalation');
  }

  console.log('\n✅ Gate 3.5: Mid-Intake Hard Compliance Gate Interception Passed Perfectly!');

  // Cleanup
  await db.conversation.delete({ where: { id: conversation.id } });
}

run().catch((err) => {
  console.error('❌ Gate 3.5 Failed:', err);
  process.exit(1);
});
