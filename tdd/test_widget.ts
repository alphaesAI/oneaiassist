import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';
import { otpService } from '../lib/otp';

async function simulateVerifyOTP(tenantId: string, cleanPhone: string) {
  // Mimics /api/chat/verify-otp transaction unification rules using tenant-scoped client
  const db = getTenantPrisma(tenantId, 'ADMIN');

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_user_role', $2, false);`,
      tenantId,
      'PLATFORM_OWNER'
    );
    const customers = await tx.customer.findMany();
    let targetCustomer = null;

    for (const c of customers) {
      if (c.primaryPhone === cleanPhone) {
        if (!targetCustomer || c.otpVerified) {
          targetCustomer = c;
        }
      }
    }

    if (targetCustomer) {
      if (!targetCustomer.otpVerified) {
        targetCustomer = await tx.customer.update({
          where: { id: targetCustomer.id },
          data: { otpVerified: true, optedIn: true },
        });
      }
    } else {
      targetCustomer = await tx.customer.create({
        data: {
          tenantId,
          displayName: `Visitor ${cleanPhone.slice(-4)}`,
          primaryPhone: cleanPhone,
          otpVerified: true,
          optedIn: true,
          optedInAt: new Date(),
        },
      });
    }

    // WEBCHAT Conversation
    let conversation = await tx.conversation.findFirst({
      where: {
        customerId: targetCustomer.id,
        channel: 'WEBCHAT',
        status: 'OPEN',
      },
    });

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          tenantId,
          customerId: targetCustomer.id,
          channel: 'WEBCHAT',
          status: 'OPEN',
        },
      });
    }

    // Lead
    let lead = await tx.lead.findFirst({
      where: { customerId: targetCustomer.id },
    });

    if (!lead) {
      lead = await tx.lead.create({
        data: {
          tenantId,
          customerId: targetCustomer.id,
          status: 'NEW',
          source: 'WEBSITE_CHAT',
        },
      });
    }

    return { customer: targetCustomer, conversation, lead };
  }, { timeout: 20000 });
}

async function simulateInboundWhatsApp(tenantId: string, cleanPhone: string) {
  // Mimics whatsapp-engine/engine-logic.ts inbound unification rules using tenant-scoped client
  const db = getTenantPrisma(tenantId, 'ADMIN');

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_user_role', $2, false);`,
      tenantId,
      'PLATFORM_OWNER'
    );
    const customers = await tx.customer.findMany();
    let targetCustomer = null;

    for (const c of customers) {
      if (c.primaryPhone === cleanPhone) {
        if (!targetCustomer || c.otpVerified) {
          targetCustomer = c;
        }
      }
    }

    if (!targetCustomer) {
      targetCustomer = await tx.customer.create({
        data: {
          tenantId,
          displayName: `Mock WhatsApp ${cleanPhone.slice(-4)}`,
          primaryPhone: cleanPhone,
          otpVerified: false,
          optedIn: true,
        },
      });
    }

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
        },
      });
    }

    let lead = await tx.lead.findFirst({
      where: { customerId: targetCustomer.id },
    });

    if (!lead) {
      lead = await tx.lead.create({
        data: {
          tenantId,
          customerId: targetCustomer.id,
          status: 'NEW',
          source: 'WHATSAPP_BOT',
        },
      });
    }

    return { customer: targetCustomer, conversation, lead };
  }, { timeout: 20000 });
}

async function run() {
  console.log('==================================================');
  console.log('Running OTP Service & Identity Unification Tests');
  console.log('==================================================');

  // 1. Setup Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Unification Test Agency',
      slug: 'unify-test-' + Date.now(),
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
    console.log(`- Customer created on WEBCHAT: ID = ${webResult.customer.id}, otpVerified = ${webResult.customer.otpVerified}`);

    // Step B: Later sends message on WhatsApp JID channel
    console.log('Same customer sends a WhatsApp message...');
    const waResult = await simulateInboundWhatsApp(tenantId, userPhoneA);
    console.log(`- Customer resolved on WHATSAPP: ID = ${waResult.customer.id}`);

    if (webResult.customer.id !== waResult.customer.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! Web OTP customer and WhatsApp customer created duplicate records.');
    }
    if (webResult.lead.id !== waResult.lead.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! Customers resolved to different Lead pipelines.');
    }
    console.log('✅ Success: Webchat OTP customer resolved to same Customer and Lead on WhatsApp.');

    // 4. Scenario 2: Unverified WhatsApp customer joins, then verifies via OTP on website
    console.log('\n[3/3] Scenario 2: WhatsApp inbound (unverified) -> Web chat widget OTP verified...');
    const userPhoneB = '9993334444';

    // Step A: Inbound WhatsApp message first (not verified yet)
    console.log('Inbound WhatsApp message received first (unverified)...');
    const firstWaResult = await simulateInboundWhatsApp(tenantId, userPhoneB);
    console.log(`- Customer created on WHATSAPP: ID = ${firstWaResult.customer.id}, otpVerified = ${firstWaResult.customer.otpVerified}`);

    // Step B: Later visits website, consents, and verifies via OTP
    console.log('Same user completes website OTP verification...');
    const secondWebResult = await simulateVerifyOTP(tenantId, userPhoneB);
    console.log(`- Customer resolved on WEBCHAT: ID = ${secondWebResult.customer.id}, otpVerified = ${secondWebResult.customer.otpVerified}`);

    if (firstWaResult.customer.id !== secondWebResult.customer.id) {
      throw new Error('CRITICAL FAIL: Identity unification failed! WhatsApp customer and Web OTP customer created duplicate records.');
    }
    if (secondWebResult.customer.otpVerified !== true) {
      throw new Error('CRITICAL FAIL: Customer otpVerified status not updated to true upon website OTP verification.');
    }
    console.log('✅ Success: Unverified WhatsApp customer correctly unified and marked otpVerified = true upon Web OTP verify.');

    console.log('\n==================================================');
    console.log('🎉 SUCCESS: ALL UNIFICATION AND OTP TESTS PASSED!');
    console.log('==================================================');

  } finally {
    // Clean up
    console.log('\nCleaning up database entries...');
    const db = getTenantPrisma(tenantId, 'ADMIN');
    await db.message.deleteMany();
    await db.conversation.deleteMany();
    await db.customerChannel.deleteMany();
    await db.lead.deleteMany();
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
