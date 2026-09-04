import 'dotenv/config';
import { HardComplianceGate } from '../whatsapp-engine/agents/HardComplianceGate';
import { prisma, getTenantPrisma } from '../lib/db';

async function testComplianceGate() {
  console.log('--- GATE 2.2: Fail-Closed Compliance Gate & Audit Log Test ---');

  const testCases = [
    { text: 'I will have my lawyer sue you in court for bad faith', expectedIntent: 'LEGAL_THREAT' },
    { text: 'I am filing a formal complaint with the insurance commissioner', expectedIntent: 'REGULATORY_COMPLAINT' },
    { text: 'My claim was denied wrongfully and I want to appeal the rejected claim', expectedIntent: 'CLAIM_DISPUTE' },
    { text: 'This is a scam and unauthorized charge grievance', expectedIntent: 'GRIEVANCE' },
    { text: 'Please cancel my policy immediately', expectedIntent: 'POLICY_CANCELLATION' },
    { text: 'Hi, what is the monthly rate for individual health insurance?', expectedIntent: null },
  ];

  for (const tc of testCases) {
    const result = HardComplianceGate.evaluate(tc.text);
    if (tc.expectedIntent) {
      if (!result.isViolation || result.intent !== tc.expectedIntent) {
        throw new Error(`Gate 2.2 FAILED: Expected violation ${tc.expectedIntent} for "${tc.text}", got ${JSON.stringify(result)}`);
      }
      console.log(`✅ Correctly intercepted [${result.intent}]: "${tc.text.slice(0, 45)}..." -> Trigger: "${result.triggerPhrase}"`);
    } else {
      if (result.isViolation) {
        throw new Error(`Gate 2.2 FAILED: False positive violation on safe text: "${tc.text}"`);
      }
      console.log(`✅ Correctly allowed safe message: "${tc.text}"`);
    }
  }

  // Test full escalation execution & AuditLog write
  const tenantId = 'tenant_pme_ff9xl';
  const testPhone = '+15550199999';
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // Find or create a test conversation
  let customer = await db.customer.findFirst({ where: { tenantId } });
  if (!customer) {
    customer = await db.customer.create({
      data: { tenantId, displayName: 'Compliance Test User', primaryPhone: testPhone },
    });
  }

  let conversation = await db.conversation.findFirst({
    where: { tenantId, customerId: customer.id },
  });
  if (!conversation) {
    conversation = await db.conversation.create({
      data: { tenantId, customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN' },
    });
  }

  const violationResult = HardComplianceGate.evaluate('I am contacting the state department of insurance!');
  let alertEmitted = false;
  const mockIo = {
    to: (room: string) => ({
      emit: (event: string, data: any) => {
        if (event === 'compliance_alert') alertEmitted = true;
      },
    }),
  };

  await HardComplianceGate.executeEscalation({
    tenantId,
    conversationId: conversation.id,
    senderPhone: testPhone,
    result: violationResult,
    io: mockIo,
  });

  // Verify conversation updated to HUMAN_AGENT
  const updatedConv = await db.conversation.findUnique({
    where: { id: conversation.id },
  });

  // Verify AuditLog written
  const auditLog = await db.auditLog.findFirst({
    where: {
      tenantId,
      action: 'COMPLIANCE_ESCALATION_TRIGGERED',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (
    updatedConv?.needsEscalation === true &&
    updatedConv?.automationEnabled === false &&
    auditLog !== null &&
    alertEmitted === true
  ) {
    console.log('✅ GATE 2.2 PASSED: Full compliance escalation executed (needsEscalation flag, automation disabled, AuditLog entry, Socket.io alert verified).');
  } else {
    throw new Error(`Gate 2.2 FAILED: Escalation state mismatch (needsEscalation=${updatedConv?.needsEscalation}, automationEnabled=${updatedConv?.automationEnabled}, auditLog=${!!auditLog}, alertEmitted=${alertEmitted})`);
  }

  await prisma.$disconnect();
}

testComplianceGate().catch((err) => {
  console.error('❌ Gate 2.2 execution failed:', err);
  process.exit(1);
});
