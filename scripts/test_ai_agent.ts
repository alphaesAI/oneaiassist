import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';
import { encrypt, decrypt } from '../lib/encryption';
import { runAIAgentAutoResponse, sessions } from '../whatsapp-engine/engine-logic';

async function run() {
  console.log('==================================================');
  console.log('Running AI Sales Agent & Bot Config Verification');
  console.log('==================================================');

  // 1. Setup Tenant & Mock Baileys session
  console.log('\n[1/4] Setting up test tenant...');
  const tenant = await prisma.tenant.create({
    data: {
      name: 'AI Agent Test Agency',
      slug: 'ai-agent-test-' + Date.now().toString().slice(-6),
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });
  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'TENANT_ADMIN');

  // Register mock Baileys connection to prevent actual WhatsApp connection attempts
  let mockedMessagesSent: string[] = [];
  sessions.set(tenantId, {
    sendMessage: async (jid: string, content: any) => {
      console.log(`[Mock Baileys] Outbound JID: ${jid}, text: "${content.text}"`);
      mockedMessagesSent.push(content.text);
      return { key: { id: `mock-outbound-${Date.now()}` } };
    },
  });

  const mockIo = {
    to: () => ({
      emit: (event: string, data: any) => {
        console.log(`[Mock Socket.io] Emit event "${event}":`, data);
      },
    }),
  };

  try {
    // 2. Setup Policy Catalog details
    console.log('\n[2/4] Initializing Policy Catalog products...');
    
    // Plan A: Budget overlap ($100 to $200), State TX, Active
    const policyA = await db.policyCatalogItem.create({
      data: {
        tenantId,
        policyId: 'bronze-tx-01',
        name: 'Humana Bronze Core',
        insurerName: 'Humana',
        states: ['TX', 'CA'],
        premiumMin: 10000, // $100 in cents
        premiumMax: 20000, // $200 in cents
        sumInsured: 5000000, // $50,000
        active: true,
        extractedSummary: 'Basic medical coverage for individuals.',
        pdfUrl: 'https://example.com/bronze.pdf',
      },
    });

    // Plan B: No Budget overlap ($300 to $400), State TX, Active
    await db.policyCatalogItem.create({
      data: {
        tenantId,
        policyId: 'gold-tx-02',
        name: 'Aetna Gold Premier',
        insurerName: 'Aetna',
        states: ['TX'],
        premiumMin: 30000, // $300 in cents
        premiumMax: 40000, // $400 in cents
        sumInsured: 15000000, // $150,000
        active: true,
        extractedSummary: 'High tier coverage.',
        pdfUrl: 'https://example.com/gold.pdf',
      },
    });

    // Setup Contact and Conversation
    const contact = await db.customer.create({
      data: {
        tenantId,
        displayName: 'John Test Lead',
        primaryPhone: encrypt('8887776666'),
        otpVerified: true,
        optedIn: true,
      },
    });

    const conversation = await db.conversation.create({
      data: {
        tenantId,
        customerId: contact.id,
        channel: 'WHATSAPP',
        status: 'OPEN',
      },
    });

    // Setup bot config (Auto-respond is active)
    await db.tenantAIConfig.create({
      data: {
        tenantId,
        provider: 'OPENAI',
        encryptedApiKey: '', // Empty -> uses mock platform fallback API
        isActive: true,
      },
    });

    // 3. Scenario 1: Intake & Recommendation Matching
    console.log('\n[3/4] Scenario 1: Intake completion and product matching...');
    
    // Simulate user sending message with all five details
    await db.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: 'Hi, my age is 35, I live in TX, no health conditions, my budget is $100 to $200 and family size is 1.',
        channel: 'WHATSAPP',
      },
    });

    // Execute bot auto-responder (which invokes mock LLM response returning [[INTAKE_DATA:...]] due to "budget" trigger)
    await runAIAgentAutoResponse(tenantId, conversation.id, mockIo);

    // Verify database updates on Lead record
    const lead = await db.lead.findFirst({
      where: { customerId: contact.id },
    });

    console.log(`- Lead status: ${lead?.status}`);
    console.log(`- Intake Age parsed: ${lead?.intakeAge}`);
    console.log(`- Intake State parsed: ${lead?.intakeState}`);
    console.log(`- Budget Min/Max: $${(lead?.intakeBudgetMin || 0)/100} to $${(lead?.intakeBudgetMax || 0)/100}`);
    console.log(`- Recommended policy IDs: ${JSON.stringify(lead?.recommendedPolicyIds)}`);

    if (
      lead?.status !== 'QUALIFIED' ||
      lead?.intakeAge !== 35 ||
      lead?.intakeState !== 'TX' ||
      lead?.intakeBudgetMin !== 10000 ||
      lead?.intakeBudgetMax !== 20000
    ) {
      throw new Error('CRITICAL FAIL: Intake fields parsing and transition failed.');
    }

    if (lead?.recommendedPolicyIds.length !== 1 || lead.recommendedPolicyIds[0] !== policyA.id) {
      throw new Error('CRITICAL FAIL: Recommendation selector failed! Gold plan or non-overlapping states plan was recommended.');
    }
    console.log('✅ Success: Lead intake captured, status QUALIFIED, and correct Bronze plan recommended.');

    // 4. Scenario 2: Trial Cap Enforcement
    console.log('\n[4/4] Scenario 2: Verification of trial auto-response usage cap...');
    
    // Clear out mocked messages sent
    mockedMessagesSent = [];

    // Reset bot config back to active
    await db.tenantAIConfig.update({
      where: { tenantId },
      data: { isActive: true },
    });

    // Insert 5 mock BOT messages in database to reach trial cap limit (5)
    console.log('Simulating 5 bot messages...');
    for (let i = 0; i < 5; i++) {
      await db.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          senderType: 'BOT',
          content: `Mock bot answer ${i}`,
          channel: 'WHATSAPP',
        },
      });
    }

    // Trigger auto-response again
    console.log('Triggering auto-response at capped state...');
    await runAIAgentAutoResponse(tenantId, conversation.id, mockIo);

    // Verify config isActive is set to false and no outbound message was mocked
    const config = await db.tenantAIConfig.findUnique({
      where: { tenantId },
    });
    console.log(`- AI Config isActive state: ${config?.isActive}`);
    console.log(`- Outbound messages sent during capped run: ${mockedMessagesSent.length}`);

    if (config?.isActive !== false || mockedMessagesSent.length > 0) {
      throw new Error('CRITICAL FAIL: Trial cap check failed! Bot did not auto-disable or dispatched a message after cap was hit.');
    }
    console.log('✅ Success: Auto-reply disabled itself automatically upon reaching the usage cap.');

    console.log('\n==================================================');
    console.log('🎉 SUCCESS: ALL AI AGENT AND CONFIG TESTS PASSED!');
    console.log('==================================================');

  } finally {
    // Clean up
    console.log('\nCleaning up database entries...');
    await db.tenantAIConfig.deleteMany();
    await db.lead.deleteMany();
    await db.message.deleteMany();
    await db.conversation.deleteMany();
    await db.customer.deleteMany();
    await db.policyCatalogItem.deleteMany();
    await prisma.tenant.delete({
      where: { id: tenantId },
    });
    console.log('Cleanup completed.');
  }
}

run()
  .catch((err) => {
    console.error('\n❌ Verification failed with error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
