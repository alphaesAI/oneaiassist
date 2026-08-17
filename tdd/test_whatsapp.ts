import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';
import { sendWhatsAppMessage } from '../lib/whatsapp';

// Mock function that mimics WhatsApp inbound handling logic
async function simulateInboundMessage(tenantId: string, rawPhone: string, text: string) {
  const db = getTenantPrisma(tenantId, 'ADMIN');

  return db.$transaction(async (tx) => {
    // 1. Identity Unification Check
    const customers = await tx.customer.findMany();
    let targetCustomer = null;

    for (const c of customers) {
      if (c.primaryPhone === rawPhone) {
        if (!targetCustomer || c.otpVerified) {
          targetCustomer = c;
        }
      }
    }

    // 2. Link or Create Customer
    if (!targetCustomer) {
      console.log(`[Simulate] Creating new Customer for phone: ${rawPhone}`);
      targetCustomer = await tx.customer.create({
        data: {
          tenantId,
          displayName: `Mock Customer ${rawPhone}`,
          primaryPhone: rawPhone,
          otpVerified: false,
          optedIn: true,
        },
      });

      await tx.customerChannel.create({
        data: {
          tenantId,
          customerId: targetCustomer.id,
          channel: 'WHATSAPP',
          channelIdentifier: `${rawPhone}@s.whatsapp.net`,
        },
      });
    } else {
      console.log(`[Simulate] Unified! Phone ${rawPhone} matched existing Customer ID: ${targetCustomer.id} (otpVerified = ${targetCustomer.otpVerified})`);
    }

    // 3. Find or Create Conversation
    let conversation = await tx.conversation.findFirst({
      where: {
        customerId: targetCustomer.id,
        channel: 'WHATSAPP',
        status: 'OPEN',
      },
    });

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          tenantId,
          customerId: targetCustomer.id,
          channel: 'WHATSAPP',
          status: 'OPEN',
          lastMessageAt: new Date(),
        },
      });
    }

    // 4. Save Message
    const message = await tx.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: text,
        channel: 'WHATSAPP',
        channelMessageId: `mock-msg-${Date.now()}`,
      },
    });

    return { customer: targetCustomer, conversation, message };
  }, { timeout: 20000 });
}

async function run() {
  console.log('==================================================');
  console.log('Running WhatsApp Integration & Compliance Tests');
  console.log('==================================================');

  // 1. Setup Tenant
  console.log('\n[1/3] Setting up test tenant...');
  const tenant = await prisma.tenant.create({
    data: {
      name: 'WhatsApp Test Agency',
      slug: 'wa-test-' + Date.now(),
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });
  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'ADMIN');

  try {
    // 2. Scenario 1: Broadcast Campaign Opt-out Check
    console.log('\n[2/3] Scenario 1: Verification of Campaign Broadcast Opt-out compliance...');
    
    // Create customer who has OPTED OUT
    const optOutCustomer = await db.customer.create({
      data: {
        tenantId,
        displayName: 'Opted Out Customer',
        primaryPhone: '5550001111',
        otpVerified: false,
        optedIn: false,
        optedOutAt: new Date(),
      },
    });

    const campaign = await db.broadcastCampaign.create({
      data: {
        tenantId,
        name: 'Promo Blast 1',
        status: 'SENDING',
      },
    });

    const job = await db.broadcastJob.create({
      data: {
        tenantId,
        campaignId: campaign.id,
        customerId: optOutCustomer.id,
        status: 'PENDING',
        scheduledFor: new Date(),
      },
    });

    // Call Next.js send helper
    console.log('Triggering campaign message send...');
    const sendResult = await sendWhatsAppMessage({
      tenantId,
      customerId: optOutCustomer.id,
      text: 'Hello! Save 20% on your auto coverage today!',
      campaignId: campaign.id,
      broadcastJobId: job.id,
    });

    // Assert that the message was skipped
    console.log(`- Send status returned: ${sendResult.status}`);
    
    const updatedJob = await db.broadcastJob.findUnique({
      where: { id: job.id },
    });
    console.log(`- Database BroadcastJob status: ${updatedJob?.status}`);

    if (sendResult.status !== 'SKIPPED_OPTED_OUT' || updatedJob?.status !== 'SKIPPED_OPTED_OUT') {
      throw new Error('CRITICAL FAIL: Opt-out check failed! Campaign broadcast was sent or job status not marked as SKIPPED_OPTED_OUT.');
    }
    console.log('✅ Success: Campaign broadcast skipped and marked SKIPPED_OPTED_OUT successfully.');

    // 3. Scenario 2: Identity Unification
    console.log('\n[3/3] Scenario 2: Verification of phone number identity unification...');
    const testPhone = '9998887777';

    // Create a verified OTP customer
    console.log('Creating existing verified Customer...');
    const verifiedCustomer = await db.customer.create({
      data: {
        tenantId,
        displayName: 'Verified Webchat User',
        primaryPhone: testPhone,
        otpVerified: true,
        optedIn: true,
      },
    });

    // Simulate incoming WhatsApp message from the same phone number
    console.log('Simulating incoming WhatsApp message from same phone...');
    const inboundResult = await simulateInboundMessage(tenantId, testPhone, 'Hi, I need info about home policies.');

    console.log(`- Unified customer ID: ${inboundResult.customer.id}`);
    console.log(`- Original verified ID: ${verifiedCustomer.id}`);

    if (inboundResult.customer.id !== verifiedCustomer.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! New customer duplicate was created instead of linking to verified user.');
    }
    console.log('✅ Success: Inbound WhatsApp message resolved to verified OTP Customer successfully.');

    console.log('\n==================================================');
    console.log('🎉 SUCCESS: ALL COMPLIANCE AND UNIFICATION TESTS PASSED!');
    console.log('==================================================');

  } finally {
    // Cleanup test tenant database entries
    console.log('\nCleaning up database entries...');
    await db.broadcastJob.deleteMany();
    await db.broadcastCampaign.deleteMany();
    await db.message.deleteMany();
    await db.conversation.deleteMany();
    await db.customerChannel.deleteMany();
    await db.customer.deleteMany();
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
