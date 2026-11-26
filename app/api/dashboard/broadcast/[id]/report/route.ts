import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { CampaignReportService } from '@/lib/email/campaignReport';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/broadcast/[id]/report
 * Returns full campaign metrics, delivery/open/click/bounce rates, and link breakdowns.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let tenantId = '';
  try {
    const ctx = await getTenantContext();
    tenantId = ctx.tenantId;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const report = await CampaignReportService.getCampaignReport(tenantId, id);

    if (!report) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
