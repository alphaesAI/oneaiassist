import 'dotenv/config';
import { prisma } from '../lib/db/index';
import { hash } from 'bcryptjs';

// Helper to set role and tenant in session for RLS compliance during seeding
async function runWithRLSContext(tenantId: string, role: string, fn: () => Promise<void>) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', $2, true);`,
      tenantId,
      role
    );
    await fn();
  });
}

async function main() {
  console.log('Seeding database with foundation data...');

  // 1. Clean up existing records to ensure seed run is clean
  // We execute raw delete queries or bypass RLS using PLATFORM_OWNER
  await prisma.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
  
  await prisma.auditLog.deleteMany({});
  await prisma.template.deleteMany({});
  await prisma.broadcastJob.deleteMany({});
  await prisma.broadcastCampaign.deleteMany({});
  await prisma.reminderJob.deleteMany({});
  await prisma.policyDocumentChunk.deleteMany({});
  await prisma.policy.deleteMany({});
  await prisma.policyCatalogItem.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.customerChannel.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.tenantAIConfig.deleteMany({});
  await prisma.whatsAppNumber.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});

  console.log('Database cleanup completed.');

  // 2. Create the main Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Apex Assurance Group',
      slug: 'apex-assurance',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
      logoUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=120&auto=format&fit=crop',
      primaryColor: '#004ac6',
      secondaryColor: '#00788c',
      heroTagline: 'Next-Gen Protection, Powered by AI',
      heroDescription: 'Get automated, instant insurance qualification and quote assessments via WhatsApp in minutes. Reliable cover, tailormade for you.',
      trustBadges: [
        { "icon": "shield", "text": "Secured by Apex" },
        { "icon": "speed", "text": "Instant Quotes" },
        { "icon": "workspace_premium", "text": "A+ Rated Carrier" }
      ],
      contactEmail: 'support@apex-assurance.com',
      contactPhone: '+1 (555) 019-2834',
      businessHours: 'Mon - Fri, 9:00 AM - 6:00 PM',
      socialLinks: [
        { "platform": "Twitter", "url": "https://twitter.com" },
        { "platform": "LinkedIn", "url": "https://linkedin.com" }
      ]
    },
  });
  console.log(`Tenant created: ${tenant.name} (${tenant.id})`);

  // Define hashes for users
  const hashedPassword = await hash('password123', 10);

  // 3. Create Users under Tenant (Bypassing RLS via PLATFORM_OWNER session)
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@agency.com',
      hashedPassword,
      role: 'ADMIN',
      tenantId: tenant.id,
      totpSecret: 'JBSWY3DPEHPK3PXP', // Base32 for standard authenticator testing
      twoFactorEnabled: true, // Mandatory for ADMIN
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      email: 'manager@agency.com',
      hashedPassword,
      role: 'MANAGER',
      tenantId: tenant.id,
      twoFactorEnabled: false,
    },
  });

  const agentUser = await prisma.user.create({
    data: {
      email: 'agent@agency.com',
      hashedPassword,
      role: 'AGENT',
      tenantId: tenant.id,
      twoFactorEnabled: false,
    },
  });

  console.log('Admin, Manager, and Agent users created successfully.');

  // 4. Create Policy Catalog Items
  const policyCatalog1 = await prisma.policyCatalogItem.create({
    data: {
      tenantId: tenant.id,
      policyId: 'POL-HEALTH-001',
      name: 'Basic Health Plan',
      insurerName: 'Apex Health Care',
      states: ['CA', 'NY'],
      premiumMin: 5000, // $50.00
      premiumMax: 15000, // $150.00
      sumInsured: 1000000, // $10,000.00
      active: true,
      extractedSummary: 'Basic medical expenses coverage including doctor visits and emergency care.',
      pdfUrl: '/files/policies/pol-health-001.pdf',
    },
  });

  const policyCatalog2 = await prisma.policyCatalogItem.create({
    data: {
      tenantId: tenant.id,
      policyId: 'POL-HEALTH-002',
      name: 'Family Premium Care',
      insurerName: 'Apex Health Care',
      states: ['CA', 'TX'],
      premiumMin: 12000, // $120.00
      premiumMax: 35000, // $350.00
      sumInsured: 5000000, // $50,000.00
      active: true,
      extractedSummary: 'Comprehensive family health plan with zero deductible and maternity cover.',
      pdfUrl: '/files/policies/pol-health-002.pdf',
    },
  });
  console.log('Policy Catalog Items seeded.');

  // 5. Create Customers
  const customerA = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      displayName: 'Marcus Thorne',
      primaryPhone: '111-222-3333',
      otpVerified: true,
      email: 'marcus.thorne@gmail.com',
      optedIn: true,
    },
  });

  const customerB = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      displayName: 'Jane Miller',
      primaryPhone: '444-555-6666',
      otpVerified: true,
      email: 'jane.miller@yahoo.com',
      optedIn: true,
    },
  });
  console.log('Customers seeded.');

  // 6. Create Leads
  const leadA = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      customerId: customerA.id,
      status: 'NEW',
      source: 'WhatsApp',
      campaignId: 'CAMP-YOUTUBE-001',
      intakeAge: 34,
      intakeState: 'CA',
      intakeFamilySize: 3,
      intakeBudgetMin: 8000,
      intakeBudgetMax: 20000,
      assignedAgentId: agentUser.id,
    },
  });

  const leadB = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      customerId: customerB.id,
      status: 'QUALIFIED',
      source: 'Webchat',
      intakeAge: 28,
      intakeState: 'TX',
      intakeFamilySize: 1,
      intakeBudgetMin: 5000,
      intakeBudgetMax: 12000,
      assignedAgentId: adminUser.id,
    },
  });
  console.log('Leads seeded.');

  // 7. Create Conversations & Messages
  const conversationA = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      customerId: customerA.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
      assignedAgentId: agentUser.id,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        tenantId: tenant.id,
        conversationId: conversationA.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: 'Hello, I am interested in checking your basic health plan.',
        channel: 'WHATSAPP',
      },
      {
        tenantId: tenant.id,
        conversationId: conversationA.id,
        direction: 'OUTBOUND',
        senderType: 'BOT',
        content: 'Hi Marcus! I can help you with that. Can you please tell me your state and budget?',
        channel: 'WHATSAPP',
      },
      {
        tenantId: tenant.id,
        conversationId: conversationA.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: 'State is CA, budget is around 100-200 dollars per month.',
        channel: 'WHATSAPP',
      },
    ],
  });

  const conversationB = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      customerId: customerB.id,
      channel: 'WEBCHAT',
      status: 'OPEN',
      assignedAgentId: adminUser.id,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        tenantId: tenant.id,
        conversationId: conversationB.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: 'I need to update my billing info.',
        channel: 'WEBCHAT',
      },
      {
        tenantId: tenant.id,
        conversationId: conversationB.id,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        content: 'Sure Jane, I can assist you with your billing updates.',
        channel: 'WEBCHAT',
      },
    ],
  });

  console.log('Conversations and messages seeded.');

  // 8. Create Templates
  await prisma.template.create({
    data: {
      tenantId: tenant.id,
      name: 'Welcome Template',
      content: 'Hello {{name}}! Welcome to Apex Assurance. How can we assist you today?',
    },
  });
  console.log('Templates seeded.');

  console.log('🎉 Seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
