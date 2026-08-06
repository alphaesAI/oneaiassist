import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';
import { encrypt, decrypt } from '../lib/encryption';
import { sendWhatsAppMessage } from '../lib/whatsapp';

// Mock function that mimics Baileys upsert handler logic
async function simulateInboundMessage(tenantId: string, rawPhone: string, text: string) {
  const db = getTenantPrisma(tenantId, 'TENANT_ADMIN');

  return db.$transaction(async (tx) => {
    // 1. Identity Unification Check (similar to engine-logic.ts)
    const contacts = await tx.contact.findMany();
    let targetContact = null;

    for (const c of contacts) {
      try {
        const decPhone = decrypt(c.primaryPhone);
        if (decPhone === rawPhone) {
          // Unification priority: prefer verified OTP contact, but any match works
          if (!targetContact || c.otpVerified) {
            targetContact = c;
          }
        }
      } catch (e) {
        // Ignore decryption failures
      }
    }

    // 2. Link or Create Contact
    if (!targetContact) {
      console.log(`[Simulate] Creating new Contact for phone: ${rawPhone}`);
      targetContact = await tx.contact.create({
        data: {
          tenantId,
          displayName: `Mock Contact ${rawPhone}`,
          primaryPhone: encrypt(rawPhone),
          otpVerified: false,
          optedIn: true,
        },
      });

      await tx.contactChannel.create({
        data: {
          tenantId,
          contactId: targetContact.id,
          channel: 'WHATSAPP',
          channelIdentifier: `${rawPhone}@s.whatsapp.net`,
          channelMetadata: {},
        },
      });
    } else {
      console.log(`[Simulate] Unified! Phone ${rawPhone} matched existing Contact ID: ${targetContact.id} (otpVerified = ${targetContact.otpVerified})`);
    }

    // 3. Find or Create Conversation
    let conversation = await tx.conversation.findFirst({
      where: {
        contactId: targetContact.id,
        channel: 'WHATSAPP',
        status: 'OPEN',
      },
    });

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          tenantId,
          contactId: targetContact.id,
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
        senderType: 'CONTACT',
        content: text,
        channel: 'WHATSAPP',
        channelMessageId: `mock-msg-${Date.now()}`,
      },
    });

    return { contact: targetContact, conversation, message };
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
      slug: 'wa-test',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });
  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'TENANT_ADMIN');

  try {
    // 2. Scenario 1: Broadcast Campaign Opt-out Check
    console.log('\n[2/3] Scenario 1: Verification of Campaign Broadcast Opt-out compliance...');
    
    // Create contact who has OPTED OUT (optedIn: false)
    const optOutContact = await db.contact.create({
      data: {
        tenantId,
        displayName: 'Opted Out Customer',
        primaryPhone: encrypt('5550001111'),
        otpVerified: false,
        optedIn: false, // Explicitly opted out
      },
    });

    const campaign = await db.broadcastCampaign.create({
      data: {
        tenantId,
        name: 'Promo Blast 1',
        messageTemplate: 'Hello! Save 20% on your auto coverage today!',
        status: 'SENDING',
      },
    });

    const job = await db.broadcastJob.create({
      data: {
        tenantId,
        campaignId: campaign.id,
        contactId: optOutContact.id,
        status: 'PENDING',
        scheduledFor: new Date(),
      },
    });

    // Call Next.js send helper
    console.log('Triggering campaign message send...');
    const sendResult = await sendWhatsAppMessage({
      tenantId,
      contactId: optOutContact.id,
      text: campaign.messageTemplate,
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

    // Create a verified OTP contact (e.g. from webchat OTP session)
    console.log('Creating existing verified Contact...');
    const verifiedContact = await db.contact.create({
      data: {
        tenantId,
        displayName: 'Verified Webchat User',
        primaryPhone: encrypt(testPhone),
        otpVerified: true, // Canonical Verified contact
        optedIn: true,
      },
    });

    // Simulate incoming WhatsApp message from the same phone number
    console.log('Simulating incoming WhatsApp message from same phone...');
    const inboundResult = await simulateInboundMessage(tenantId, testPhone, 'Hi, I need info about home policies.');

    console.log(`- Unified contact ID: ${inboundResult.contact.id}`);
    console.log(`- Original verified ID: ${verifiedContact.id}`);

    if (inboundResult.contact.id !== verifiedContact.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! New contact duplicate was created instead of linking to verified user.');
    }
    console.log('✅ Success: Inbound WhatsApp message resolved to verified OTP Contact successfully.');

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
    await db.contactChannel.deleteMany();
    await db.contact.deleteMany();
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
