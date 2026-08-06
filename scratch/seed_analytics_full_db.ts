import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'primemarketingexperts' },
  });

  if (!tenant) {
    console.error('Tenant primemarketingexperts not found');
    return;
  }

  const tenantId = tenant.id;
  console.log(`Seeding comprehensive analytics CRM database for tenant: ${tenantId}`);

  const db = getTenantPrisma(tenantId, 'ADMIN');

  const dbOwner = getTenantPrisma(tenantId, 'PLATFORM_OWNER');

  let adminUser = await dbOwner.user.findFirst({
    where: { tenantId },
  });

  if (!adminUser) {
    adminUser = await dbOwner.user.create({
      data: {
        tenantId,
        email: 'admin@primemarketingexperts.com',
        hashedPassword: '$2a$10$YourHashedPasswordHere',
        role: 'ADMIN',
      },
    });
  }

  // 1. Fetch Policy Catalog Items
  const policyItems = await db.policyCatalogItem.findMany({ where: { tenantId } });
  console.log(`Found ${policyItems.length} policy catalog items`);

  // 2. Clear old demo data for clean state
  await db.policy.deleteMany({ where: { tenantId } });
  await db.lead.deleteMany({ where: { tenantId } });
  await db.message.deleteMany({ where: { tenantId } });
  await db.conversation.deleteMany({ where: { tenantId } });
  await db.customer.deleteMany({ where: { tenantId } });
  await db.escalationLog.deleteMany({ where: { tenantId } });

  // 3. Seed Customers & Leads
  const customersData = [
    { name: 'Sarah Jenkins', phone: '+15551234567', email: 'sarah.j@example.com', state: 'FL', stage: 'CONVERTED', source: 'WHATSAPP_BROADCAST', policyIndex: 0 },
    { name: 'Michael Chang', phone: '+15552345678', email: 'mchang@example.com', state: 'TX', stage: 'CONVERTED', source: 'WEBSITE_WEBCHAT', policyIndex: 1 },
    { name: 'David Ross', phone: '+15553456789', email: 'david.ross@example.com', state: 'CA', stage: 'CONVERTED', source: 'ORGANIC_INBOUND', policyIndex: 2 },
    { name: 'Elena Rostova', phone: '+15554567890', email: 'elena.r@example.com', state: 'NY', stage: 'CONVERTED', source: 'AGENT_REFERRAL', policyIndex: 3 },
    { name: 'Robert Miller', phone: '+15555678901', email: 'rmiller@example.com', state: 'NC', stage: 'NEGOTIATION', source: 'WHATSAPP_BROADCAST', policyIndex: 0 },
    { name: 'Amanda Smith', phone: '+15556789012', email: 'amanda.s@example.com', state: 'GA', stage: 'NEGOTIATION', source: 'WEBSITE_WEBCHAT', policyIndex: 1 },
    { name: 'James Wilson', phone: '+15557890123', email: 'jwilson@example.com', state: 'OH', stage: 'APPLICATION_CAPTURED', source: 'FACEBOOK_ADS', policyIndex: 0 },
    { name: 'Jessica Taylor', phone: '+15558901234', email: 'jtaylor@example.com', state: 'PA', stage: 'APPLICATION_CAPTURED', source: 'WHATSAPP_BROADCAST', policyIndex: 4 },
    { name: 'Daniel Martinez', phone: '+15559012345', email: 'dmartinez@example.com', state: 'AZ', stage: 'QUALIFIED', source: 'WEBSITE_WEBCHAT', policyIndex: 1 },
    { name: 'Laura White', phone: '+15550123456', email: 'lwhite@example.com', state: 'MI', stage: 'QUALIFIED', source: 'INSTAGRAM_DIRECT', policyIndex: 0 },
    { name: 'Kevin Harris', phone: '+15551239876', email: 'kharris@example.com', state: 'VA', stage: 'NEW', source: 'ORGANIC_INBOUND', policyIndex: 2 },
    { name: 'Rachel Green', phone: '+15552348765', email: 'rgreen@example.com', state: 'IL', stage: 'NEW', source: 'WHATSAPP_BROADCAST', policyIndex: 0 },
    { name: 'Brian Clark', phone: '+15553457654', email: 'bclark@example.com', state: 'TN', stage: 'NEW', source: 'WEBSITE_WEBCHAT', policyIndex: 1 },
    { name: 'Megan Lewis', phone: '+15554566543', email: 'mlewis@example.com', state: 'MO', stage: 'LOST', source: 'FACEBOOK_ADS', policyIndex: 0 },
  ];

  for (let i = 0; i < customersData.length; i++) {
    const c = customersData[i];
    const customer = await db.customer.create({
      data: {
        tenantId,
        displayName: c.name,
        primaryPhone: c.phone,
        email: c.email,
        location: c.state,
        optedIn: true,
      },
    });

    const lead = await db.lead.create({
      data: {
        tenantId,
        customerId: customer.id,
        status: c.stage as any,
        source: c.source,
        intakeState: c.state,
        intakeAge: 32 + i * 2,
        assignedAgentId: adminUser.id,
        createdAt: new Date(Date.now() - (i + 1) * 2 * 24 * 60 * 60 * 1000),
      },
    });

    // Create Policy if CONVERTED
    if (c.stage === 'CONVERTED' && policyItems.length > 0) {
      const catItem = policyItems[c.policyIndex % policyItems.length];
      const policy = await db.policy.create({
        data: {
          tenantId,
          customerId: customer.id,
          policyCatalogId: catItem.id,
          policyNumber: `POL-PME-2026-${1000 + i}`,
          effectiveDate: new Date(),
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          confirmedByUserId: adminUser.id,
        },
      });

      await db.customer.update({
        where: { id: customer.id },
        data: { activePolicyId: policy.id },
      });
    }

    // Create Conversation & Messages
    const conv = await db.conversation.create({
      data: {
        tenantId,
        customerId: customer.id,
        channel: c.source.includes('WEBCHAT') ? 'WEBCHAT' : 'WHATSAPP',
        status: c.stage === 'CONVERTED' ? 'CLOSED' : 'OPEN',
        assignedAgentId: adminUser.id,
        createdAt: new Date(Date.now() - (i + 1) * 2 * 24 * 60 * 60 * 1000),
      },
    });

    // Inbound Customer Msg
    await db.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        channel: conv.channel,
        content: `Hello, I'm looking for health insurance coverage options in ${c.state}.`,
        createdAt: new Date(conv.createdAt.getTime() + 1000 * 60 * 2),
      },
    });

    // Bot Response Msg
    await db.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: 'OUTBOUND',
        senderType: 'BOT',
        channel: conv.channel,
        content: `Hi ${c.name}! I am Prime AI Assistant. I can help you find affordable health plans in ${c.state}. What is your monthly budget?`,
        createdAt: new Date(conv.createdAt.getTime() + 1000 * 60 * 3),
      },
    });

    // Agent Response Msg for some
    if (i % 2 === 0) {
      await db.message.create({
        data: {
          tenantId,
          conversationId: conv.id,
          direction: 'OUTBOUND',
          senderType: 'AGENT',
          channel: conv.channel,
          content: `Hi ${c.name}, I reviewed your application and recommended the ${policyItems[c.policyIndex % policyItems.length]?.name || 'Health Plan'}. Let me know if you'd like to enroll!`,
          createdAt: new Date(conv.createdAt.getTime() + 1000 * 60 * 15),
        },
      });
    }
  }

  // Seed Escalation Logs
  const sampleEscalations = [
    {
      userQuestion: 'Can I add my 68-year-old parent to the Apex Family Gold Comprehensive Plan?',
      reason: 'Policy age limit complexity & senior rider eligibility check',
      triggeredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'Does the Apex Senior Medicare Advantage supplement cover out-of-network dental surgery in Florida?',
      reason: 'Low RAG vector similarity confidence (< 0.65)',
      triggeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'I want to speak with a licensed human insurance agent immediately regarding a claims dispute.',
      reason: 'User explicitly requested human agent handoff',
      triggeredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'What is the exact deductible for out-of-state emergency room visits under POL-HEALTH-004?',
      reason: 'Complex out-of-state network clause query',
      triggeredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'Can I pay my annual premium in quarterly installments with a corporate credit card?',
      reason: 'Custom payment schedule request',
      triggeredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const esc of sampleEscalations) {
    await db.escalationLog.create({
      data: {
        tenantId,
        userQuestion: esc.userQuestion,
        reason: esc.reason,
        triggeredAt: esc.triggeredAt,
      },
    });
  }

  console.log('Successfully seeded 14 customers, 14 leads, 4 active policies, 14 conversations, and 5 escalation logs!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
