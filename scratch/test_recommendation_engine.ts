import 'dotenv/config';
import { RecommendationEngine } from '../whatsapp-engine/agents/RecommendationEngine';
import { getTenantPrisma, prisma } from '../lib/db';

async function run() {
  console.log('=== Running Gate 3.3: Two-Stage Recommendation Grounding & Branching Test ===');

  const testTenantId = 'tenant_pme_ff9xl';
  const testPhone = '+15557770003';
  const db = getTenantPrisma(testTenantId, 'ADMIN');

  // Clean up any test catalog items for isolation
  await db.policyCatalogItem.deleteMany({
    where: {
      tenantId: testTenantId,
      policyId: { in: ['TEST-REC-POL-1', 'TEST-REC-POL-2', 'TEST-REC-POL-3'] },
    },
  });

  // Seed 3 structured test catalog items
  await db.policyCatalogItem.createMany({
    data: [
      {
        tenantId: testTenantId,
        policyId: 'TEST-REC-POL-1',
        name: 'Apex Bronze Essential Plan',
        insurerName: 'Apex Health Corp',
        states: ['TX', 'FL'],
        premiumMin: 10000, // $100
        premiumMax: 15000, // $150
        sumInsured: 25000000, // $250,000
        active: true,
        extractedSummary: 'Basic in-network coverage with low deductible.',
        pdfUrl: 'https://example.com/bronze.pdf',
      },
      {
        tenantId: testTenantId,
        policyId: 'TEST-REC-POL-2',
        name: 'Apex Gold Premium Care',
        insurerName: 'Apex Health Corp',
        states: ['TX', 'CA', 'NY'],
        premiumMin: 18000, // $180
        premiumMax: 25000, // $250
        sumInsured: 75000000, // $750,000
        active: true,
        extractedSummary: 'Comprehensive zero-deductible coverage with specialist access.',
        pdfUrl: 'https://example.com/gold.pdf',
      },
      {
        tenantId: testTenantId,
        policyId: 'TEST-REC-POL-3',
        name: 'California Regional Care',
        insurerName: 'Pacific Health Co',
        states: ['CA'],
        premiumMin: 22000, // $220
        premiumMax: 30000, // $300
        sumInsured: 50000000, // $500,000
        active: true,
        extractedSummary: 'California HMO plan with full pharmacy benefit.',
        pdfUrl: 'https://example.com/ca.pdf',
      },
    ],
  });

  // Test Case 1: Zero Matches (State with no active plans or budget too low)
  console.log('\n--- Test Case 1: Zero Matches (Branch 1 -> Human Escalation) ---');
  const res0 = await RecommendationEngine.generateRecommendation({
    tenantId: testTenantId,
    intakeData: {
      age: 45,
      state: 'AK', // Alaska - No plans available
      budgetMax: 50,
      familySize: 1,
    },
    customerPhone: testPhone,
  });

  console.log('Result 0:', { status: res0.status, candidateCount: res0.candidateCount });
  console.log('Reply Text 0:\n', res0.replyText);

  if (res0.status !== 'HUMAN_ESCALATED' || res0.candidateCount !== 0) {
    throw new Error('Test Case 1 failed: Expected HUMAN_ESCALATED with 0 candidates');
  }
  if (!res0.replyText.includes('licensed insurance specialists') && !res0.replyText.includes('customized quote')) {
    throw new Error('Test Case 1 failed to explain escalation to specialist');
  }

  // Test Case 2: Exactly 1 Match (Branch 2 -> Direct formatting without LLM)
  console.log('\n--- Test Case 2: Exactly 1 Match (Branch 2 -> Direct Formatting) ---');
  const res1 = await RecommendationEngine.generateRecommendation({
    tenantId: testTenantId,
    intakeData: {
      age: 28,
      state: 'FL', // Only TEST-REC-POL-1 covers FL with $120 budget
      budgetMax: 120,
      familySize: 1,
    },
    customerPhone: testPhone,
  });

  console.log('Result 1:', { status: res1.status, candidateCount: res1.candidateCount });
  console.log('Reply Text 1:\n', res1.replyText);

  if (res1.status !== 'PROPOSAL_SENT' || res1.candidateCount !== 1) {
    throw new Error('Test Case 2 failed: Expected PROPOSAL_SENT with exactly 1 candidate');
  }
  if (!res1.replyText.includes('Apex Bronze Essential Plan')) {
    throw new Error('Test Case 2 failed to format single policy directly');
  }

  // Test Case 3: Multiple (>1) Matches (Branch 3 -> Stage 2 Grounded Synthesis)
  console.log('\n--- Test Case 3: Multiple Matches (Branch 3 -> Grounded LLM Comparison) ---');
  const resMulti = await RecommendationEngine.generateRecommendation({
    tenantId: testTenantId,
    intakeData: {
      age: 35,
      state: 'TX', // Both Bronze ($100) and Gold ($180) cover TX
      budgetMax: 200,
      familySize: 2,
    },
    customerPhone: testPhone,
  });

  console.log('Result Multi:', { status: resMulti.status, candidateCount: resMulti.candidateCount });
  console.log('Reply Text Multi:\n', resMulti.replyText);

  if (resMulti.status !== 'PROPOSAL_SENT' || resMulti.candidateCount < 2) {
    throw new Error('Test Case 3 failed: Expected PROPOSAL_SENT with >= 2 candidates');
  }
  if (!resMulti.replyText.includes('Apex') || !resMulti.replyText.includes('$')) {
    throw new Error('Test Case 3 failed to generate grounded comparison pitch');
  }

  console.log('\n✅ Gate 3.3: Two-Stage Recommendation Grounding & Branching Passed Perfectly!');

  // Cleanup test catalog items
  await db.policyCatalogItem.deleteMany({
    where: {
      tenantId: testTenantId,
      policyId: { in: ['TEST-REC-POL-1', 'TEST-REC-POL-2', 'TEST-REC-POL-3'] },
    },
  });
}

run().catch((err) => {
  console.error('❌ Gate 3.3 Failed:', err);
  process.exit(1);
});
