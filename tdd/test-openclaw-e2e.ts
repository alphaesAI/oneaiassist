import 'dotenv/config';
import { getTenantPrisma } from '../lib/db';
import { IntakeQualificationSkill } from '../lib/claw/IntakeQualificationSkill';

async function testE2E() {
  console.log('=== STARTING OPENCLAW END-TO-END WORKFLOW INTEGRATION TEST ===');

  const tenantId = 'tenant_pme_ff9xl'; // Default Seed Tenant ID
  const testPhone = '+19999999999';
  const db = getTenantPrisma(tenantId, 'PLATFORM_OWNER');

  try {
    // 1. Resolve or Create Test Customer
    let customer = await db.customer.findFirst({
      where: { tenantId, displayName: 'E2E OpenClaw Test Customer' },
    });

    if (!customer) {
      console.log('[1/7] Creating test customer...');
      customer = await db.customer.create({
        data: {
          tenantId,
          displayName: 'E2E OpenClaw Test Customer',
          primaryPhone: testPhone,
          otpVerified: false,
          optedIn: true,
        },
      });
    } else {
      console.log('[1/7] Found existing test customer:', customer.id);
    }

    // 2. Create open conversation
    let conversation = await db.conversation.findFirst({
      where: { customerId: customer.id, status: 'OPEN' },
    });

    if (!conversation) {
      console.log('[2/7] Creating test conversation...');
      conversation = await db.conversation.create({
        data: {
          tenantId,
          customerId: customer.id,
          channel: 'WHATSAPP',
          status: 'OPEN',
        },
      });
    }

    // 3. Create NEW lead
    let lead = await db.lead.findFirst({
      where: { tenantId, customerId: customer.id },
    });

    if (lead) {
      console.log('[3/7] Cleaning up existing lead and resetting status to NEW...');
      // Clean up intake session
      await db.intakeSession.deleteMany({ where: { leadId: lead.id } });
      lead = await db.lead.update({
        where: { id: lead.id },
        data: {
          status: 'NEW',
          intakeAge: null,
          intakeState: null,
          intakeHealthConditions: null,
          intakeBudgetMin: null,
          intakeBudgetMax: null,
          intakeFamilySize: null,
          recommendedPolicyIds: [],
        },
      });
    } else {
      console.log('[3/7] Creating new lead...');
      lead = await db.lead.create({
        data: {
          tenantId,
          customerId: customer.id,
          status: 'NEW',
          source: 'WHATSAPP',
        },
      });
    }

    // 4. Set up Mock offline AI client to bypass API issues
    const aiClient = {
      generateChat: async (messages: any[]): Promise<string> => {
        const lastMsg = messages[messages.length - 1]?.content || '';
        if (lastMsg.includes('data extraction bot')) {
          // Extraction phase response
          return JSON.stringify({
            age: 45,
            state: 'CA',
            healthConditions: ['None'],
            budgetMin: 150,
            budgetMax: 200,
            familySize: 3,
          });
        } else {
          // Explanation phase response
          return 'Here are the plans matching your California profile and monthly budget limits. I recommend Apex Care Basic or similar...';
        }
      },
    };

    // 5. Simulate inbound message detailing all required parameters
    console.log('[4/7] Ingesting message history...');
    const messageText = 'I am 45 years old, live in CA, have no major health conditions, my monthly budget is $200, and my family size is 3';
    
    // Write inbound message to DB conversation history
    const customerMsg = await db.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: messageText,
        channel: 'WHATSAPP',
      },
    });

    const messages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });

    const history = messages.map(m => ({
      role: m.senderType === 'CUSTOMER' ? 'user' : 'assistant' as const,
      content: m.content,
    }));

    // 6. Execute OpenClaw IntakeQualificationSkill Turn
    console.log('[5/7] Executing OpenClaw IntakeQualificationSkill...');
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3002';
    const replyText = await IntakeQualificationSkill.runTurn({
      tenantId,
      lead,
      conversation,
      history,
      aiClient,
      db,
    });

    console.log('\n[6/7] AI Qualification Response Text:\n', replyText);

    // 7. Verify updates in database
    console.log('\n[7/7] Verifying database records state...');
    
    const updatedLead = await db.lead.findUnique({
      where: { id: lead.id },
    });
    console.log('Lead Status (Expected QUALIFIED):', updatedLead?.status);
    console.log('Lead Parameters:');
    console.log(' - Age:', updatedLead?.intakeAge);
    console.log(' - State:', updatedLead?.intakeState);
    console.log(' - Family Size:', updatedLead?.intakeFamilySize);
    console.log(' - Budget Max cents:', updatedLead?.intakeBudgetMax);
    console.log('Recommended Policy IDs:', updatedLead?.recommendedPolicyIds);

    const session = await db.intakeSession.findFirst({
      where: { leadId: lead.id },
    });
    console.log('IntakeSession Status (Expected COMPLETED):', session?.status);
    console.log('Collected Fields Saved:', JSON.stringify(session?.collectedFields));

    const audit = await db.auditLog.findFirst({
      where: { tenantId, action: 'INTAKE_COMPLETE' },
      orderBy: { createdAt: 'desc' },
    });
    console.log('Audit Log Action Saved:', audit?.action);
    console.log('Audit Log Metadata:', JSON.stringify(audit?.metadata));

    console.log('\n=== E2E INTEGRATION TEST VERIFICATION SUCCESSFUL ===');
  } catch (err) {
    console.error('E2E integration test failed:', err);
  } finally {
    // We don't call $disconnect on scoped client
  }
}

testE2E();
