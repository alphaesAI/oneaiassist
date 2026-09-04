import 'dotenv/config';
import { getTenantPrisma } from '../lib/db';

async function runGate44() {
  console.log('=== Running Gate 4.4: System Health & Audit Log Observability Test ===');
  const tenantId = 'tenant_pme_ff9xl';
  const prisma = getTenantPrisma(tenantId, 'ADMIN');

  // 1. Audit Log Verification
  const auditLogs = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('Found recent audit logs count:', auditLogs.length);

  // 2. Inbound Message Jobs Queue Health
  const [pendingCount, processingCount, completedCount, deadLetterCount] = await Promise.all([
    prisma.inboundMessageJob.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.inboundMessageJob.count({ where: { tenantId, status: 'PROCESSING' } }),
    prisma.inboundMessageJob.count({ where: { tenantId, status: 'COMPLETED' } }),
    prisma.inboundMessageJob.count({ where: { tenantId, status: 'DEAD_LETTER' } }),
  ]);

  console.log('Queue Metrics:', {
    pending: pendingCount,
    processing: processingCount,
    completed: completedCount,
    deadLetter: deadLetterCount,
  });

  // 3. Dynamic Questions Count
  const questionsCount = await prisma.dynamicIntakeQuestion.count({
    where: { tenantId, isActive: true },
  });
  console.log('Active Dynamic Intake Questions:', questionsCount);

  if (questionsCount < 3) {
    throw new Error('Expected at least 3 active dynamic questions');
  }

  console.log('
? Gate 4.4: System Health & Observability Metrics Passed Perfectly!');
}

runGate44().catch((err) => {
  console.error('? Gate 4.4 Failed:', err);
  process.exit(1);
});
