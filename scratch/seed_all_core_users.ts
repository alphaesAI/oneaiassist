import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';
import bcrypt from 'bcryptjs';

async function seedCoreUsers() {
  console.log('Seeding core tenants and users in PostgreSQL...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Upsert Prime Marketing Experts Tenant
  const pmeTenant = await prisma.tenant.upsert({
    where: { id: 'tenant_pme_ff9xl' },
    update: {
      name: 'Prime Marketing Experts',
      slug: 'prime-marketing-experts',
      subscriptionPlan: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
      contactEmail: 'admin@primemarketingexperts.com',
    },
    create: {
      id: 'tenant_pme_ff9xl',
      name: 'Prime Marketing Experts',
      slug: 'prime-marketing-experts',
      subscriptionPlan: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
      logoUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=120&auto=format&fit=crop',
      primaryColor: '#004ac6',
      secondaryColor: '#00788c',
      heroTagline: 'Leading Digital Insurance & Growth Marketing',
      heroDescription: 'Enterprise AI assistants and omni-channel campaigns for insurance providers.',
      contactEmail: 'admin@primemarketingexperts.com',
      contactPhone: '+1 (555) 019-2834',
    },
  });
  console.log(`✅ Tenant Prime Marketing Experts: ${pmeTenant.id}`);

  // 2. Upsert Apex Assurance Tenant
  const apexTenant = await prisma.tenant.upsert({
    where: { slug: 'apex-assurance' },
    update: {
      name: 'Apex Assurance Group',
      subscriptionPlan: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
    },
    create: {
      name: 'Apex Assurance Group',
      slug: 'apex-assurance',
      subscriptionPlan: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
      contactEmail: 'support@apex-assurance.com',
    },
  });
  console.log(`✅ Tenant Apex Assurance: ${apexTenant.id}`);

  // 3. Upsert PME Admin & Team Users
  const usersToSeed = [
    {
      email: 'admin@primemarketingexperts.com',
      role: 'ADMIN' as const,
      tenantId: pmeTenant.id,
      twoFactorEnabled: false,
    },
    {
      email: 'manager@primemarketingexperts.com',
      role: 'MANAGER' as const,
      tenantId: pmeTenant.id,
      twoFactorEnabled: false,
    },
    {
      email: 'agent@primemarketingexperts.com',
      role: 'AGENT' as const,
      tenantId: pmeTenant.id,
      twoFactorEnabled: false,
    },
    {
      email: 'admin@agency.com',
      role: 'ADMIN' as const,
      tenantId: apexTenant.id,
      twoFactorEnabled: false,
    },
  ];

  for (const u of usersToSeed) {
    const db = getTenantPrisma(u.tenantId, 'ADMIN');
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {
        hashedPassword,
        role: u.role,
        tenantId: u.tenantId,
        twoFactorEnabled: u.twoFactorEnabled,
      },
      create: {
        email: u.email,
        hashedPassword,
        role: u.role,
        tenantId: u.tenantId,
        twoFactorEnabled: u.twoFactorEnabled,
      },
    });
    console.log(`✅ User: ${user.email} (${user.role}) -> Password 'password123' configured.`);
  }

  console.log('Core users seeded successfully!');
}

seedCoreUsers().catch(console.error).finally(() => prisma.$disconnect());
