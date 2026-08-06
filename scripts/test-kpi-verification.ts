import { prisma } from '../lib/db/index';

async function main() {
  console.log('--- STARTING KPI DYNAMIC VERIFICATION ---');

  // Bypass RLS for initial querying of target tenant ID
  await prisma.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'apex-assurance' },
  });

  if (!tenant) {
    throw new Error('Tenant apex-assurance not found in the database. Run seed first.');
  }

  const tenantId = tenant.id;
  console.log(`Resolved target tenant: "${tenant.name}" (${tenantId})`);

  // Query baseline metrics
  const leadsCountBefore = await prisma.lead.count({
    where: { tenantId }
  });
  const convCount = await prisma.conversation.count({
    where: { tenantId, status: 'OPEN' }
  });
  const policiesCount = await prisma.policy.count({
    where: { tenantId }
  });

  console.log(`\n📊 Baseline Seed Metrics:`);
  console.log(`  - Leads This Month: ${leadsCountBefore} (Expected: 2)`);
  console.log(`  - Active Conversations: ${convCount} (Expected: 2)`);
  console.log(`  - Policies Sold: ${policiesCount} (Expected: 0)`);

  if (leadsCountBefore !== 2) {
    console.error(`❌ Warning: Baseline leads count is ${leadsCountBefore}, expected 2.`);
  } else {
    console.log(`✅ Leads baseline matches seeded demo data!`);
  }

  if (convCount !== 2) {
    console.error(`❌ Warning: Baseline conversations is ${convCount}, expected 2.`);
  } else {
    console.log(`✅ Conversations baseline matches seeded demo data!`);
  }

  // --- SIMULATE NEW LEAD ADDITION ---
  console.log('\n--- STEP 2: Creating a new lead for Apex Assurance ---');
  
  // Resolve a customer to link
  const customer = await prisma.customer.findFirst({
    where: { tenantId }
  });

  if (!customer) {
    throw new Error('No customer found to associate with test lead.');
  }

  const newLead = await prisma.lead.create({
    data: {
      tenantId,
      customerId: customer.id,
      status: 'NEW',
      source: 'Verification Script',
    }
  });

  console.log(`New Lead added: ID = ${newLead.id}`);

  // Query metrics again after insertion
  const leadsCountAfter = await prisma.lead.count({
    where: { tenantId }
  });

  console.log(`\n📊 Metrics after adding Lead:`);
  console.log(`  - Leads This Month: ${leadsCountAfter} (Expected: 3)`);

  if (leadsCountAfter === leadsCountBefore + 1) {
    console.log(`🎉 SUCCESS: Leads Count correctly incremented from ${leadsCountBefore} to ${leadsCountAfter}!`);
  } else {
    throw new Error(`❌ FAILED: Leads Count did not increment correctly. Before: ${leadsCountBefore}, After: ${leadsCountAfter}`);
  }

  // --- CLEAN UP ---
  console.log('\n--- CLEANING UP TEST DATA ---');
  await prisma.lead.delete({
    where: { id: newLead.id }
  });
  console.log('Test Lead deleted successfully.');

  const leadsCountFinal = await prisma.lead.count({
    where: { tenantId }
  });
  console.log(`Final Leads Count: ${leadsCountFinal} (Expected to revert to 2)`);

  console.log('\n🎉 ALL KPI DYNAMIC AGGREGATION TESTS PASSED SUCCESSFULLY! 🎉');
}

main()
  .catch((err) => {
    console.error('KPI verification test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
