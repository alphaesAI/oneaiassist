import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';
import { hash } from 'bcryptjs';

async function main() {
  console.log('Seeding database with foundation data...');

  // 1. Clean up existing records to ensure seed run is clean
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      PERFORM set_config('app.current_user_role', 'PLATFORM_OWNER', false);
      DELETE FROM "public"."AuditLog";
      DELETE FROM "public"."Template";
      DELETE FROM "public"."BroadcastJob";
      DELETE FROM "public"."BroadcastCampaign";
      DELETE FROM "public"."ReminderJob";
      DELETE FROM "public"."PolicyDocumentChunk";
      DELETE FROM "public"."Policy";
      DELETE FROM "public"."PolicyCatalogItem";
      DELETE FROM "public"."Application";
      DELETE FROM "public"."Lead";
      DELETE FROM "public"."Message";
      DELETE FROM "public"."Conversation";
      DELETE FROM "public"."CustomerChannel";
      DELETE FROM "public"."Customer";
      DELETE FROM "public"."TenantAIConfig";
      DELETE FROM "public"."WhatsAppNumber";
      DELETE FROM "public"."User";
      DELETE FROM "public"."Tenant";
    END $$;
  `);

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

  // Obtain tenant-scoped Prisma client for RLS compliance
  const db = getTenantPrisma(tenant.id, 'ADMIN');

  // Define hashes for users
  const hashedPassword = await hash('password123', 10);

  // 3. Create Users under Tenant
  const adminUser = await db.user.create({
    data: {
      email: 'admin@agency.com',
      hashedPassword,
      role: 'ADMIN',
      tenantId: tenant.id,
      totpSecret: 'JBSWY3DPEHPK3PXP', // Base32 for standard authenticator testing
      twoFactorEnabled: true, // Mandatory for ADMIN
    },
  });

  const managerUser = await db.user.create({
    data: {
      email: 'manager@agency.com',
      hashedPassword,
      role: 'MANAGER',
      tenantId: tenant.id,
      twoFactorEnabled: false,
    },
  });

  const agentUser = await db.user.create({
    data: {
      email: 'agent@agency.com',
      hashedPassword,
      role: 'AGENT',
      tenantId: tenant.id,
      twoFactorEnabled: false,
    },
  });

  const pmeUser = await db.user.create({
    data: {
      email: 'admin@primemarketingexperts.com',
      hashedPassword,
      role: 'ADMIN',
      tenantId: tenant.id,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      twoFactorEnabled: false,
    },
  });

  console.log('Admin, PME Admin, Manager, and Agent users created successfully.');

  // 4. Create Policy Catalog Items
  const policyCatalog1 = await db.policyCatalogItem.create({
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

  const policyCatalog2 = await db.policyCatalogItem.create({
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
  const customerA = await db.customer.create({
    data: {
      tenantId: tenant.id,
      displayName: 'Marcus Thorne',
      primaryPhone: '111-222-3333',
      otpVerified: true,
      email: 'marcus.thorne@gmail.com',
      optedIn: true,
    },
  });

  const customerB = await db.customer.create({
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
  const leadA = await db.lead.create({
    data: {
      tenantId: tenant.id,
      customerId: customerA.id,
      status: 'NEW',
      source: 'WhatsApp Broadcast',
      campaignId: 'CAMP-YOUTUBE-001',
      intakeAge: 34,
      intakeState: 'CA',
      intakeFamilySize: 3,
      intakeBudgetMin: 8000,
      intakeBudgetMax: 20000,
      assignedAgentId: agentUser.id,
    },
  });

  const leadB = await db.lead.create({
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
  const conversationA = await db.conversation.create({
    data: {
      tenantId: tenant.id,
      customerId: customerA.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
      assignedAgentId: agentUser.id,
    },
  });

  await db.message.createMany({
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

  const conversationB = await db.conversation.create({
    data: {
      tenantId: tenant.id,
      customerId: customerB.id,
      channel: 'WEBCHAT',
      status: 'OPEN',
      assignedAgentId: adminUser.id,
    },
  });

  await db.message.createMany({
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
  await db.template.create({
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
