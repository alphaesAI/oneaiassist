import 'dotenv/config';
import { prisma } from '../lib/db';

async function check() {
  const dups: any[] = await prisma.$queryRawUnsafe(`
    SELECT "messageId", COUNT(*) as cnt
    FROM "InboundMessageJob"
    GROUP BY "messageId"
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20;
  `);
  const total = await prisma.inboundMessageJob.count();
  console.log('Total InboundMessageJob rows:', total);
  console.log('Duplicate messageId groups:', JSON.stringify(dups, null, 2));
  if (dups.length === 0) {
    console.log('✅ No duplicates found — safe to add @unique constraint directly.');
  } else {
    console.log(`⚠️  Found ${dups.length} duplicate groups — dedup required before migration.`);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
