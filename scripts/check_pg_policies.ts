import 'dotenv/config';
import { prisma } from '../lib/db';

async function run() {
  const policies = await prisma.$queryRawUnsafe(`
    SELECT tablename::text, policyname::text, cmd::text, qual::text, with_check::text 
    FROM pg_policies;
  `);
  console.log(JSON.stringify(policies, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
