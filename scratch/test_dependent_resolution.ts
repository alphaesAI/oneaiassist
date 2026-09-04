import 'dotenv/config';
import { IdentityResolver } from '../whatsapp-engine/agents/IdentityResolver';
import { prisma, getTenantPrisma } from '../lib/db';

async function testDependentResolution() {
  console.log('--- GATE 2.3: Dependent Phone Number Resolution Test ---');

  const tenantId = 'tenant_pme_ff9xl';
  const primaryPhone = '+15551110001';
  const dependentPhone = '+15551110002';
  const unknownPhone = '+15559998877';
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // Find or create admin user for policy confirmation
  let adminUser = await db.user.findFirst({ where: { tenantId } });
  if (!adminUser) {
    adminUser = await db.user.create({
      data: {
        tenantId,
        email: `admin_${Date.now()}@test.com`,
        hashedPassword: 'hash',
        role: 'ADMIN',
      },
    });
  }

  // Find or create a catalog item
  let catalogItem = await db.policyCatalogItem.findFirst({ where: { tenantId } });
  if (!catalogItem) {
    catalogItem = await db.policyCatalogItem.create({
      data: {
        tenantId,
        policyId: 'CAT_HEALTH_TEST',
        name: 'Apex Health Shield',
        insurerName: 'Apex Insurance Corp',
        states: ['NY', 'TX', 'CA'],
        premiumMin: 12000,
        premiumMax: 25000,
        sumInsured: 50000000,
        extractedSummary: 'Comprehensive health coverage',
        pdfUrl: 'https://example.com/health.pdf',
      },
    });
  }

  // 1. Create a Primary Policyholder with a Policy
  const primaryCustomer = await db.customer.create({
    data: {
      tenantId,
      displayName: 'Jane Doe (Primary)',
      primaryPhone,
      policies: {
        create: {
          tenantId,
          policyNumber: 'POL-FAMILY-2026',
          status: 'ACTIVE',
          policyCatalogId: catalogItem.id,
          confirmedByUserId: adminUser.id,
          effectiveDate: new Date(),
          expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        },
      },
    },
    include: {
      policies: true,
    },
  });

  // 2. Create a Dependent Customer linked via primaryCustomerId
  const dependentCustomer = await db.customer.create({
    data: {
      tenantId,
      displayName: 'Billy Doe (Son)',
      primaryPhone: dependentPhone,
      primaryCustomerId: primaryCustomer.id,
    },
  });

  try {
    // Test Resolution 1: Dependent phone resolution
    const resDependent = await IdentityResolver.resolve(tenantId, dependentPhone);
    console.log('Resolved Dependent:', {
      type: resDependent.type,
      displayName: resDependent.displayName,
      primaryCustomer: resDependent.primaryCustomer?.displayName,
      policiesCount: resDependent.policies?.length,
    });

    if (
      resDependent.type !== 'DEPENDENT' ||
      resDependent.primaryCustomer?.id !== primaryCustomer.id ||
      resDependent.policies?.[0]?.policyNumber !== 'POL-FAMILY-2026'
    ) {
      throw new Error(`Gate 2.3 FAILED: Dependent did not resolve to primary customer account.`);
    }

    // Test Resolution 2: Primary customer phone resolution
    const resPrimary = await IdentityResolver.resolve(tenantId, primaryPhone);
    console.log('Resolved Primary:', {
      type: resPrimary.type,
      displayName: resPrimary.displayName,
      policiesCount: resPrimary.policies?.length,
    });

    if (resPrimary.type !== 'PRIMARY_POLICYHOLDER' || resPrimary.policies?.[0]?.policyNumber !== 'POL-FAMILY-2026') {
      throw new Error(`Gate 2.3 FAILED: Primary policyholder not recognized.`);
    }

    // Test Resolution 3: Unknown phone resolution -> PROSPECT
    const resUnknown = await IdentityResolver.resolve(tenantId, unknownPhone);
    console.log('Resolved Unknown:', {
      type: resUnknown.type,
      displayName: resUnknown.displayName,
    });

    if (resUnknown.type !== 'PROSPECT') {
      throw new Error(`Gate 2.3 FAILED: Unknown phone did not resolve as PROSPECT.`);
    }

    console.log('✅ GATE 2.3 PASSED: Dependent, Primary Policyholder, and Prospect correctly resolved.');
  } finally {
    // Cleanup
    await db.policy.deleteMany({ where: { tenantId, policyNumber: 'POL-FAMILY-2026' } });
    await db.customer.deleteMany({ where: { id: { in: [dependentCustomer.id, primaryCustomer.id] } } });
    await prisma.$disconnect();
  }
}

testDependentResolution().catch((err) => {
  console.error('❌ Gate 2.3 execution failed:', err);
  process.exit(1);
});
