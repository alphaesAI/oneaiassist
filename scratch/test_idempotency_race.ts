import 'dotenv/config';
import { enqueueInboundJob } from '../whatsapp-engine/agents/IngressService';
import { prisma, getTenantPrisma } from '../lib/db';

async function testIdempotencyRace() {
  console.log('--- GATE 2.1: Multi-Transport Atomic Idempotency Race Test ---');

  const tenantId = 'tenant_pme_ff9xl';
  const testWamId = `test_race_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const senderPhone = '+15550198888';

  try {
    // Fire 10 concurrent insertion requests with the exact same (tenantId, wamId)
    console.log(`Firing 10 parallel enqueueInboundJob calls for wamId: ${testWamId}...`);
    const promises = Array.from({ length: 10 }).map((_, i) =>
      enqueueInboundJob({
        tenantId,
        wamId: testWamId,
        senderPhone,
        recipientId: 'rec_123',
        payload: { attempt: i, text: 'Hello insurance quote' },
      })
    );

    const results = await Promise.all(promises);

    const acceptedCount = results.filter((r) => r.accepted).length;
    const duplicateCount = results.filter((r) => r.isDuplicate).length;

    console.log(`Results: ${acceptedCount} accepted, ${duplicateCount} duplicates rejected.`);

    // Verify database row count for this wamId
    const db = getTenantPrisma(tenantId, 'ADMIN');
    const dbJobs = await db.inboundMessageJob.findMany({
      where: {
        tenantId,
        wamId: testWamId,
      },
    });

    console.log(`Database row count for wamId ${testWamId}: ${dbJobs.length}`);

    if (acceptedCount === 1 && duplicateCount === 9 && dbJobs.length === 1) {
      console.log('✅ GATE 2.1 PASSED: Exactly 1 job accepted and 9 rejected atomically via DB constraint.');
    } else {
      throw new Error(`Gate 2.1 FAILED: Expected 1 accepted & 9 duplicates, got accepted=${acceptedCount}, dups=${duplicateCount}, dbRows=${dbJobs.length}`);
    }
  } finally {
    // Clean up
    const db = getTenantPrisma(tenantId, 'ADMIN');
    await db.inboundMessageJob.deleteMany({
      where: { tenantId, wamId: testWamId },
    });
    console.log('Cleaned up test job rows.');
    await prisma.$disconnect();
  }
}

testIdempotencyRace().catch((err) => {
  console.error('❌ Gate 2.1 execution failed:', err);
  process.exit(1);
});
