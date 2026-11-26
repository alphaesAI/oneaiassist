import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { CampaignReportService, CampaignMetricKey } from '@/lib/email/campaignReport';

export const dynamic = 'force-dynamic';

const VALID_METRICS: Set<string> = new Set([
  'recipients',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
  'complained',
  'failed',
]);

/**
 * GET /api/dashboard/broadcast/[id]/report/contacts?metric=opened&url=&page=1&pageSize=25&search=&format=json|csv
 * Returns the specific contacts behind each metric number with pagination, search, or CSV export.
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
    const { searchParams } = new URL(req.url);

    const metricParam = (searchParams.get('metric') || 'recipients').toLowerCase();
    if (!VALID_METRICS.has(metricParam)) {
      return NextResponse.json(
        { error: `Invalid metric. Must be one of: ${Array.from(VALID_METRICS).join(', ')}` },
        { status: 400 }
      );
    }

    const metric = metricParam as CampaignMetricKey;
    const format = searchParams.get('format') || 'json';
    const isCsv = format === 'csv';

    const result = await CampaignReportService.getCampaignMetricContacts(tenantId, id, metric, {
      url: searchParams.get('url'),
      page: Number(searchParams.get('page')) || 1,
      pageSize: isCsv ? 1000 : Number(searchParams.get('pageSize')) || 25,
      search: searchParams.get('search'),
      variant: (searchParams.get('variant') as any) || undefined,
    });

    if (!result) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (isCsv) {
      let csv = 'Email,Name,Status,Count,Timestamp,Details\n';
      for (const c of result.contacts) {
        const timeStr = c.eventTimestamp ? new Date(c.eventTimestamp).toISOString() : '';
        const escape = (val: string | null | undefined) => `"${(val || '').replace(/"/g, '""')}"`;
        csv += `${escape(c.email)},${escape(c.displayName)},${escape(c.status)},${c.count || 1},${escape(timeStr)},${escape(c.details)}\n`;
      }

      const filename = `campaign_${id}_${metric}_${new Date().toISOString().split('T')[0]}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
