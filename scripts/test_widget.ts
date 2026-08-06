import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';
import { encrypt, decrypt } from '../lib/encryption';
import { otpService } from '../lib/otp';

async function simulateVerifyOTP(tenantId: string, cleanPhone: string) {
  // Mimics /api/chat/verify-otp transaction unification rules using tenant-scoped client
  const db = getTenantPrisma(tenantId, 'TENANT_ADMIN');

  return db.$transaction(async (tx) => {
    const contacts = await tx.contact.findMany();
    let targetContact = null;

    for (const c of contacts) {
      try {
        const decPhone = decrypt(c.primaryPhone);
        if (decPhone === cleanPhone) {
          if (!targetContact || c.otpVerified) {
            targetContact = c;
          }
        }
      } catch (e) {
        // Ignore decryption failures
      }
    }

    if (targetContact) {
      if (!targetContact.otpVerified) {
        targetContact = await tx.contact.update({
          where: { id: targetContact.id },
          data: { otpVerified: true, optedIn: true },
        });
      }
    } else {
      targetContact = await tx.contact.create({
        data: {
          tenantId,
          displayName: `Visitor ${cleanPhone.slice(-4)}`,
          primaryPhone: encrypt(cleanPhone),
          otpVerified: true,
          optedIn: true,
          optedInAt: new Date(),
        },
      });
    }

    // WEBCHAT Conversation
    let conversation = await tx.conversation.findFirst({
      where: {
        contactId: targetContact.id,
        channel: 'WEBCHAT',
        status: 'OPEN',
      },
    });

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          tenantId,
          contactId: targetContact.id,
          channel: 'WEBCHAT',
          status: 'OPEN',
        },
      });
    }

    // Lead
    let lead = await tx.lead.findFirst({
      where: { contactId: targetContact.id },
    });

    if (!lead) {
      lead = await tx.lead.create({
        data: {
          tenantId,
          contactId: targetContact.id,
          status: 'NEW',
          source: 'WEBSITE_CHAT',
        },
      });
    }

    return { contact: targetContact, conversation, lead };
  }, { timeout: 20000 });
}

async function simulateInboundWhatsApp(tenantId: string, cleanPhone: string) {
  // Mimics whatsapp-engine/engine-logic.ts inbound unification rules using tenant-scoped client
  const db = getTenantPrisma(tenantId, 'TENANT_ADMIN');

  return db.$transaction(async (tx) => {
    const contacts = await tx.contact.findMany();
    let targetContact = null;

    for (const c of contacts) {
      try {
        const decPhone = decrypt(c.primaryPhone);
        if (decPhone === cleanPhone) {
          if (!targetContact || c.otpVerified) {
            targetContact = c;
          }
        }
      } catch (e) {
        // Ignore decryption failures
      }
    }

    if (!targetContact) {
      targetContact = await tx.contact.create({
        data: {
          tenantId,
          displayName: `Mock WhatsApp ${cleanPhone.slice(-4)}`,
          primaryPhone: encrypt(cleanPhone),
          otpVerified: false,
          optedIn: true,
        },
      });
    }

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
        },
      });
    }

    let lead = await tx.lead.findFirst({
      where: { contactId: targetContact.id },
    });

    if (!lead) {
      lead = await tx.lead.create({
        data: {
          tenantId,
          contactId: targetContact.id,
          status: 'NEW',
          source: 'WHATSAPP_BOT',
        },
      });
    }

    return { contact: targetContact, conversation, lead };
  }, { timeout: 20000 });
}

async function run() {
  console.log('==================================================');
  console.log('Running OTP Service & Identity Unification Tests');
  console.log('==================================================');

  // 1. Setup Tenant (Tenant has no RLS, so default client is fine)
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Unification Test Agency',
      slug: 'unify-test',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });
  const tenantId = tenant.id;

  try {
    // 2. Test OTP Service Configuration
    console.log('\n[1/3] Testing Swappable OTP service configuration...');
    const testPhone = '1112223333';
    
    // Trigger OTP SMS dispatch
    const sendResult = await otpService.sendOTP(testPhone);
    console.log(`- Send OTP result: ${sendResult}`);
    if (!sendResult) throw new Error('OTP send failed.');

    // Verify OTP Code (mock code is 123456)
    const verifySuccess = await otpService.verifyOTP(testPhone, '123456');
    console.log(`- Verify OTP with code "123456": ${verifySuccess}`);
    const verifyFail = await otpService.verifyOTP(testPhone, '999999');
    console.log(`- Verify OTP with code "999999" (expected false): ${verifyFail}`);

    if (!verifySuccess || verifyFail) {
      throw new Error('CRITICAL FAIL: Swappable OTP Verify client logic error.');
    }
    console.log('✅ OTP Service Verification passed.');

    // 3. Scenario 1: Visitor verifies via OTP first, then writes on WhatsApp
    console.log('\n[2/3] Scenario 1: Web chat widget OTP session -> WhatsApp connection...');
    const userPhoneA = '9991112222';

    // Step A: Verifies on website chat widget
    console.log('Visitor completes OTP verify on website chat widget...');
    const webResult = await simulateVerifyOTP(tenantId, userPhoneA);
    console.log(`- Contact created on WEBCHAT: ID = ${webResult.contact.id}, otpVerified = ${webResult.contact.otpVerified}`);

    // Step B: Later sends message on WhatsApp JID channel
    console.log('Same contact sends a WhatsApp message...');
    const waResult = await simulateInboundWhatsApp(tenantId, userPhoneA);
    console.log(`- Contact resolved on WHATSAPP: ID = ${waResult.contact.id}`);

    if (webResult.contact.id !== waResult.contact.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! Web OTP contact and WhatsApp contact created duplicate records.');
    }
    if (webResult.lead.id !== waResult.lead.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! Contacts resolved to different Lead pipelines.');
    }
    console.log('✅ Success: Webchat OTP contact resolved to same Contact and Lead on WhatsApp.');

    // 4. Scenario 2: Unverified WhatsApp contact joins, then verifies via OTP on website
    console.log('\n[3/3] Scenario 2: WhatsApp inbound (unverified) -> Web chat widget OTP verified...');
    const userPhoneB = '9993334444';

    // Step A: Inbound WhatsApp message first (not verified yet)
    console.log('Inbound WhatsApp message received first (unverified)...');
    const firstWaResult = await simulateInboundWhatsApp(tenantId, userPhoneB);
    console.log(`- Contact created on WHATSAPP: ID = ${firstWaResult.contact.id}, otpVerified = ${firstWaResult.contact.otpVerified}`);

    // Step B: Later visits website, consents, and verifies via OTP
    console.log('Same user completes website OTP verification...');
    const secondWebResult = await simulateVerifyOTP(tenantId, userPhoneB);
    console.log(`- Contact resolved on WEBCHAT: ID = ${secondWebResult.contact.id}, otpVerified = ${secondWebResult.contact.otpVerified}`);

    if (firstWaResult.contact.id !== secondWebResult.contact.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! WhatsApp contact and Web OTP contact created duplicate records.');
    }
    if (secondWebResult.contact.otpVerified !== true) {
      throw new Error('CRITICAL FAIL: Contact otpVerified status not updated to true upon website OTP verification.');
    }
    console.log('✅ Success: Unverified WhatsApp contact correctly unified and marked otpVerified = true upon Web OTP verify.');

    console.log('\n==================================================');
    console.log('🎉 SUCCESS: ALL UNIFICATION AND OTP TESTS PASSED!');
    console.log('==================================================');

  } finally {
    // Clean up
    console.log('\nCleaning up database entries...');
    const db = getTenantPrisma(tenantId, 'TENANT_ADMIN');
    await db.message.deleteMany();
    await db.conversation.deleteMany();
    await db.contactChannel.deleteMany();
    await db.lead.deleteMany();
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
