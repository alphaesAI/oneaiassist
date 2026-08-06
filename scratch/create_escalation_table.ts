import 'dotenv/config';
import { prisma } from '../lib/db/index';

async function main() {
  console.log('Ensuring EscalationLog table exists...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EscalationLog" (
      "id" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "conversationId" TEXT,
      "customerId" TEXT,
      "userQuestion" TEXT NOT NULL,
      "reason" TEXT,
      "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EscalationLog_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "EscalationLog_tenantId_idx" ON "EscalationLog"("tenantId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "EscalationLog_triggeredAt_idx" ON "EscalationLog"("triggeredAt");
  `);
  console.log('EscalationLog table ready!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
