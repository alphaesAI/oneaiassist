import { NextRequest, NextResponse } from 'next/server';
import { getTenantPrisma, prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/admin/system-health
 * Returns real-time health metrics, queue status, and compliance alert stats for the tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId || req.headers.get('x-tenant-id') || 'tenant_pme_ff9xl';

    const db = getTenantPrisma(tenantId, 'ADMIN');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // 1. Inbound Queue Statistics
    const [
      totalJobs24h,
      queuedCount,
      processingCount,
      completedCount,
      failedCount,
      staleLocksCount,
    ] = await Promise.all([
      db.inboundMessageJob.count({
        where: { tenantId, createdAt: { gte: oneDayAgo } },
      }),
      db.inboundMessageJob.count({
        where: { tenantId, status: { in: ['RECEIVED', 'QUEUED'] } },
      }),
      db.inboundMessageJob.count({
        where: { tenantId, status: 'PROCESSING' },
      }),
      db.inboundMessageJob.count({
        where: { tenantId, status: 'COMPLETED', createdAt: { gte: oneDayAgo } },
      }),
      db.inboundMessageJob.count({
        where: { tenantId, status: 'FAILED' },
      }),
      db.inboundMessageJob.count({
        where: {
          tenantId,
          status: 'PROCESSING',
          lockedAt: { lt: fiveMinutesAgo },
        },
      }),
    ]);

    // 2. Compliance and Escalation Audit Logs
    const recentComplianceEscalations = await db.auditLog.findMany({
      where: {
        tenantId,
        action: { contains: 'COMPLIANCE' },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const recentDeadLetterJobs = await db.inboundMessageJob.findMany({
      where: {
        tenantId,
        status: 'FAILED',
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      queueHealth: {
        status: queuedCount > 100 || staleLocksCount > 5 ? 'DEGRADED' : 'HEALTHY',
        queuedCount,
        processingCount,
        completedCount24h: completedCount,
        failedCountTotal: failedCount,
        staleLocksCount,
        totalJobs24h,
      },
      compliance: {
        totalEscalations24h: recentComplianceEscalations.length,
        recentEscalations: recentComplianceEscalations,
      },
      deadLetterQueue: {
        totalFailed: failedCount,
        recentFailedJobs: recentDeadLetterJobs,
      },
    });
  } catch (err: any) {
    console.error('[API System Health GET] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
