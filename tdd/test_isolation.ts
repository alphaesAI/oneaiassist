import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';
import { hash } from 'bcryptjs';

async function run() {
  console.log('==================================================');
  console.log('Running Tenant Isolation & RLS Verification Script');
  console.log('==================================================');

  // 1. Clean up any previous test records to ensure idempotency
  console.log('\n[1/5] Cleaning up old test records (RLS-compliant)...');
  
  // Retrieve existing test tenants first (Tenant has no RLS policies)
  const oldTenants = await prisma.tenant.findMany({
    where: { slug: { in: ['tenant-a', 'tenant-b'] } },
  });

  for (const tenant of oldTenants) {
    const dbTenant = getTenantPrisma(tenant.id, 'TENANT_ADMIN');
    
    // Delete customers using the tenant-scoped client
    await dbTenant.customer.deleteMany({
      where: { displayName: { in: ['Test Contact A', 'Test Contact B'] } },
    });
    
    // Delete users using the tenant-scoped client
    await dbTenant.user.deleteMany({
      where: { email: { in: ['admin@tenant-a.com', 'admin@tenant-b.com'] } },
    });
  }

  // Delete the tenants themselves (Tenant table has no RLS)
  await prisma.tenant.deleteMany({
    where: { slug: { in: ['tenant-a', 'tenant-b'] } },
  });
  console.log('Cleanup completed.');

  // 2. Create Tenant A + Admin + Contact
  console.log('\n[2/5] Setting up Tenant A (tenant-a)...');
  const tenantA = await prisma.tenant.create({
    data: {
      name: 'Tenant A Agency',
      slug: 'tenant-a',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });

  // To insert tenant-scoped rows, we MUST use the tenant-extended Prisma client
  const dbA = getTenantPrisma(tenantA.id, 'TENANT_ADMIN');

  await dbA.user.create({
    data: {
      email: 'admin@tenant-a.com',
      hashedPassword: await hash('password123', 10),
      role: 'ADMIN',
      tenantId: tenantA.id,
    },
  });

  await dbA.customer.create({
    data: {
      tenantId: tenantA.id,
      displayName: 'Test Contact A',
      primaryPhone: '111-222-3333',
      otpVerified: true,
    },
  });
  console.log(`Tenant A created with ID: ${tenantA.id}`);

  // 3. Create Tenant B + Admin + Contact
  console.log('\n[3/5] Setting up Tenant B (tenant-b)...');
  const tenantB = await prisma.tenant.create({
    data: {
      name: 'Tenant B Agency',
      slug: 'tenant-b',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });

  // To insert tenant-scoped rows, we MUST use the tenant-extended Prisma client
  const dbB = getTenantPrisma(tenantB.id, 'TENANT_ADMIN');

  await dbB.user.create({
    data: {
      email: 'admin@tenant-b.com',
      hashedPassword: await hash('password123', 10),
      role: 'ADMIN',
      tenantId: tenantB.id,
    },
  });

  await dbB.customer.create({
    data: {
      tenantId: tenantB.id,
      displayName: 'Test Contact B',
      primaryPhone: '444-555-6666',
      otpVerified: true,
    },
  });
  console.log(`Tenant B created with ID: ${tenantB.id}`);

  // 4. Test RLS Isolation using getTenantPrisma for Tenant A
  console.log('\n[4/5] Executing database query under Tenant A context...');
  const contactsForA = await dbA.customer.findMany();

  console.log(`- Query count returned: ${contactsForA.length}`);
  console.log(`- Returned display names: ${JSON.stringify(contactsForA.map((c) => c.displayName))}`);

  if (contactsForA.length !== 1 || contactsForA[0].displayName !== 'Test Contact A') {
    throw new Error('CRITICAL FAIL: Tenant isolation breach! Tenant A query returned data from Tenant B or empty.');
  }
  console.log('✅ Tenant A isolation verified. Row-level security blocks Tenant B records.');

  // 5. Test RLS Isolation using getTenantPrisma for Tenant B
  console.log('\n[5/5] Executing database query under Tenant B context...');
  const contactsForB = await dbB.customer.findMany();

  console.log(`- Query count returned: ${contactsForB.length}`);
  console.log(`- Returned display names: ${JSON.stringify(contactsForB.map((c) => c.displayName))}`);

  if (contactsForB.length !== 1 || contactsForB[0].displayName !== 'Test Contact B') {
    throw new Error('CRITICAL FAIL: Tenant isolation breach! Tenant B query returned data from Tenant A or empty.');
  }
  console.log('✅ Tenant B isolation verified. Row-level security blocks Tenant A records.');

  console.log('\n==================================================');
  console.log('🎉 SUCCESS: ALL TENANT ISOLATION TESTS PASSED!');
  console.log('==================================================');
}

run()
  .catch((err) => {
    console.error('\n❌ Verification failed with error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
