import 'dotenv/config';
import { AgentRouter } from '../whatsapp-engine/agents/AgentRouter';
import { getTenantPrisma, prisma } from '../lib/db';

async function run() {
  console.log('=== Running Gate 3.4: Existing Customer SQL & Servicing Test ===');

  const testTenantId = 'tenant_pme_ff9xl';
  const primaryPhone = '+15558880001';
  const dependentPhone = '+15558880002';
  const db = getTenantPrisma(testTenantId, 'ADMIN');

  // Clean up any previous test customers
  const oldCusts = await db.customer.findMany({
    where: { tenantId: testTenantId, primaryPhone: { in: [primaryPhone, dependentPhone] } },
  });
  for (const c of oldCusts) {
    await db.policy.deleteMany({ where: { customerId: c.id } });
    await db.customer.delete({ where: { id: c.id } });
  }

  // 1. Create Policy Catalog Item
  let catalogItem = await db.policyCatalogItem.findFirst({
    where: { tenantId: testTenantId, policyId: 'POL-SERV-001' },
  });

  if (!catalogItem) {
    catalogItem = await db.policyCatalogItem.create({
      data: {
        tenantId: testTenantId,
        policyId: 'POL-SERV-001',
        name: 'Apex Platinum Comprehensive Plan',
        insurerName: 'Apex Health Assurance',
        states: ['TX', 'NY'],
        premiumMin: 25000, // $250
        premiumMax: 35000, // $350
        sumInsured: 100000000, // $1,000,000
        active: true,
        extractedSummary: 'Full specialist, prescription, zero-deductible hospitalization.',
        pdfUrl: 'https://example.com/plat.pdf',
      },
    });
  }

  // 2. Create Primary Customer & Active Policy
  const primaryCustomer = await db.customer.create({
    data: {
      tenantId: testTenantId,
      displayName: 'Sarah Connor',
      primaryPhone,
      otpVerified: true,
      optedIn: true,
    },
  });

  // Find an existing admin user for confirmedByUserId
  const adminUser = await db.user.findFirst({
    where: { tenantId: testTenantId },
  });
  const userId = adminUser?.id || 'usr_seed_admin';

  const activePolicy = await db.policy.create({
    data: {
      tenantId: testTenantId,
      customerId: primaryCustomer.id,
      policyCatalogId: catalogItem.id,
      policyNumber: 'POL-TX-998822',
      effectiveDate: new Date('2026-01-01'),
      expiryDate: new Date('2027-01-01'),
      status: 'ACTIVE',
      confirmedByUserId: userId,
    },
  });

  // Link activePolicyId
  await db.customer.update({
    where: { id: primaryCustomer.id },
    data: { activePolicyId: activePolicy.id },
  });

  // 3. Create Authorized Dependent Customer linked to primaryCustomer
  const dependentCustomer = await db.customer.create({
    data: {
      tenantId: testTenantId,
      displayName: 'John Connor',
      primaryPhone: dependentPhone,
      primaryCustomerId: primaryCustomer.id,
      otpVerified: true,
      optedIn: true,
    },
  });

  // Test Case 1: Parameterized SQL Due Date / Premium Query (Primary Customer)
  console.log('\n--- Test Case 1: Premium & Due Date Query (Primary Holder) ---');
  const resp1 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-exist-001',
    rawMessage: 'When is my next premium payment due and how much is it?',
    wamId: 'wam-exist-1',
    senderPhone: primaryPhone,
  });

  console.log('Bot Response 1:\n', resp1.replyText);
  if (
    !resp1.replyText.includes('POL-TX-998822') ||
    !resp1.replyText.includes('250.00') ||
    !resp1.replyText.includes('Due Date')
  ) {
    throw new Error('Test Case 1 failed: Premium and due date details missing from response');
  }

  // Test Case 2: Parameterized SQL Sum Insured Query (Primary Customer)
  console.log('\n--- Test Case 2: Sum Insured & Policy Limit Query ---');
  const resp2 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-exist-001',
    rawMessage: 'What is my total sum insured and coverage limit?',
    wamId: 'wam-exist-2',
    senderPhone: primaryPhone,
  });

  console.log('Bot Response 2:\n', resp2.replyText);
  if (!resp2.replyText.includes('1,000,000') || !resp2.replyText.includes('POL-TX-998822')) {
    throw new Error('Test Case 2 failed: Sum insured coverage details missing from response');
  }

  // Test Case 3: Dependent Phone Query (Resolves to Primary Holder Policy)
  console.log('\n--- Test Case 3: Dependent Account Servicing ---');
  const resp3 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-exist-002',
    rawMessage: 'Hi, show my active policy details',
    wamId: 'wam-exist-3',
    senderPhone: dependentPhone,
  });

  console.log('Bot Response 3:\n', resp3.replyText);
  if (!resp3.replyText.includes('Sarah Connor') || !resp3.replyText.includes('POL-TX-998822')) {
    throw new Error('Test Case 3 failed: Dependent resolution failed to contextualize primary account');
  }

  // Test Case 4: Servicing Action / Endorsement Escalation
  console.log('\n--- Test Case 4: Human Servicing Escalation ---');
  const resp4 = await AgentRouter.dispatchMessage({
    tenantId: testTenantId,
    conversationId: 'conv-exist-001',
    rawMessage: 'I need to file a medical claim and change my primary beneficiary address',
    wamId: 'wam-exist-4',
    senderPhone: primaryPhone,
  });

  console.log('Bot Response 4:\n', resp4.replyText);
  if (resp4.actionTaken !== 'HUMAN_ESCALATED') {
    throw new Error('Test Case 4 failed: Expected actionTaken to be HUMAN_ESCALATED');
  }

  console.log('\n✅ Gate 3.4: Existing Customer SQL & Servicing Passed Perfectly!');

  // Cleanup
  await db.policy.delete({ where: { id: activePolicy.id } });
  await db.customer.delete({ where: { id: dependentCustomer.id } });
  await db.customer.delete({ where: { id: primaryCustomer.id } });
}

run().catch((err) => {
  console.error('❌ Gate 3.4 Failed:', err);
  process.exit(1);
});
