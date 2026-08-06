import { prisma } from '../lib/db/index';

async function run() {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', false);`);
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', 'cmrw9u1xq000068vabpfm6i9h', false);`);

      console.log('Exhaustive Database Diagnostic Dump:');

      const users = await tx.user.findMany();
      console.log(`Found ${users.length} users:`);
      for (const u of users) {
        console.log(`- User: ${u.email}, Role: ${u.role}, TenantId: ${u.tenantId}`);
      }

      const tenants = await tx.tenant.findMany();
      console.log(`Found ${tenants.length} tenants:`);
      for (const t of tenants) {
        console.log(`- Tenant: "${t.name}" (${t.id}), Slug: ${t.slug}`);
      }

      const customers = await tx.customer.findMany();
      console.log(`Found ${customers.length} customers:`);
      for (const c of customers) {
        console.log(`- Customer: "${c.displayName}" (${c.id}), TenantId: ${c.tenantId}`);
      }

      const leads = await tx.lead.findMany({
        include: {
          customer: true,
          tenant: true,
        }
      });
      console.log(`Found ${leads.length} leads in database:`);
      for (const l of leads) {
        console.log(`- Lead ID: ${l.id}, Tenant: "${l.tenant.name}" (${l.tenantId}), Customer: ${l.customer.displayName}, Status: ${l.status}, Source: ${l.source}`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
