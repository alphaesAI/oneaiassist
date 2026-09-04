import 'dotenv/config';
import { prisma } from '../lib/db/index';

async function main() {
  console.log('--- Direct Raw SQL Query for all Customers & Leads ---');

  const customers: any[] = await prisma.$queryRawUnsafe(`SELECT id, "tenantId", "displayName", "primaryPhone", "createdAt" FROM "public"."Customer" ORDER BY "createdAt" DESC LIMIT 20;`);
  console.log(`Total customers in DB: ${customers.length}`);
  console.log(customers);

  const leads: any[] = await prisma.$queryRawUnsafe(`SELECT id, "tenantId", "customerId", status, source, "intakeBudgetMax", "createdAt" FROM "public"."Lead" ORDER BY "createdAt" DESC LIMIT 20;`);
  console.log(`Total leads in DB: ${leads.length}`);
  console.log(leads);

  const tenants: any[] = await prisma.$queryRawUnsafe(`SELECT id, name, slug FROM "public"."Tenant";`);
  console.log('Tenants:', tenants);
}

main().catch(console.error).finally(() => prisma.$disconnect());
