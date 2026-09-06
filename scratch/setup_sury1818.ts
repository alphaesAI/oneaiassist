import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function setupSury1818() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'apex-assurance' },
  });

  if (!tenant) throw new Error('Tenant apex-assurance not found');

  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // 1. Create or find Customer sury1818
  let customer = await db.customer.findFirst({
    where: { displayName: 'sury1818' },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        tenantId,
        displayName: 'sury1818',
        primaryPhone: '+1 555-1818',
        otpVerified: true,
        optedIn: true,
      },
    });
    console.log(`✅ Created Customer sury1818 ID: ${customer.id}`);
  } else {
    console.log(`ℹ️ Existing Customer sury1818 ID: ${customer.id}`);
  }

  // 2. Create or find Lead sury1818
  let lead = await db.lead.findFirst({
    where: { customerId: customer.id },
  });

  if (!lead) {
    lead = await db.lead.create({
      data: {
        tenantId,
        customerId: customer.id,
        status: 'NEW',
        source: 'WhatsApp Organic',
      },
    });
    console.log(`✅ Created Lead sury1818 ID: ${lead.id}`);
  } else {
    console.log(`ℹ️ Existing Lead sury1818 ID: ${lead.id}`);
  }

  // 3. Create or find Conversation
  let conversation = await db.conversation.findFirst({
    where: { customerId: customer.id },
  });

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenantId,
        customerId: customer.id,
        channel: 'WHATSAPP',
        status: 'OPEN',
      },
    });
    console.log(`✅ Created Conversation sury1818 ID: ${conversation.id}`);
  } else {
    console.log(`ℹ️ Existing Conversation sury1818 ID: ${conversation.id}`);
  }

  // 4. Create or reset IntakeSession
  let intakeSession = await db.intakeSession.findFirst({
    where: { leadId: lead.id },
  });

  if (!intakeSession) {
    intakeSession = await db.intakeSession.create({
      data: {
        tenantId,
        leadId: lead.id,
        customerId: customer.id,
        flowId: 'default-flow',
        flowVersion: 'v1.0',
        status: 'IN_PROGRESS',
        collectedFields: {},
      },
    });
    console.log(`✅ Created IntakeSession sury1818 ID: ${intakeSession.id}`);
  } else {
    await db.intakeSession.update({
      where: { id: intakeSession.id },
      data: {
        status: 'IN_PROGRESS',
        collectedFields: {},
      },
    });
    console.log(`🔄 Reset IntakeSession sury1818 ID: ${intakeSession.id}`);
  }

  console.log('\n🎉 Setup completed for sury1818! Ready for live interactive intake chat.');
}

setupSury1818().catch(console.error).finally(() => prisma.$disconnect());
