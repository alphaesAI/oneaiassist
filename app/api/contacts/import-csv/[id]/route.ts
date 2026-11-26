import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { id } = await params;

    const job = await db.contactImportJob.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        fileName: true,
        listId: true,
        consentSource: true,
        consentProof: true,
        status: true,
        totalRows: true,
        importedCount: true,
        updatedCount: true,
        skippedCount: true,
        errors: true,
        lastError: true,
        createdAt: true,
        completedAt: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
    }

    return NextResponse.json({ report: job });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch import report' }, { status: 500 });
  }
}
