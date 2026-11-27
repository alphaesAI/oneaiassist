import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { WHATSAPP_METRICS, WhatsAppCampaignReportService, type WhatsAppMetricKey } from '@/lib/whatsapp/campaignReport';

export const dynamic = 'force-dynamic';

/** A value that a spreadsheet would run as a formula is written as plain text. */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * GET /api/dashboard/broadcast/[id]/whatsapp-report
 *   no "metric"            -> the campaign's numbers
 *   metric=delivered|...   -> the contacts behind that number (page, pageSize, search; format=csv to download)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let tenantId = '';
  try {
    tenantId = (await getTenantContext()).tenantId;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const metric = url.searchParams.get('metric');

    if (!metric) {
      const report = await WhatsAppCampaignReportService.getReport(tenantId, id);
      if (!report) return NextResponse.json({ error: 'WhatsApp campaign not found' }, { status: 404 });
      return NextResponse.json(report);
    }

    if (!WHATSAPP_METRICS.includes(metric as WhatsAppMetricKey)) {
      return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
    }
    const csv = url.searchParams.get('format') === 'csv';
    const search = url.searchParams.get('search');

    if (csv) {
      const rows: string[] = [['Name', 'Phone', 'Status', 'Time', 'Details'].map(csvCell).join(',')];
      for (let page = 1; page <= 500; page++) {
        const data = await WhatsAppCampaignReportService.getMetricContacts(tenantId, id, metric as WhatsAppMetricKey, { page, pageSize: 100, search });
        if (!data) return NextResponse.json({ error: 'WhatsApp campaign not found' }, { status: 404 });
        for (const c of data.contacts) {
          rows.push([c.displayName, c.phone, c.status, c.at ? new Date(c.at).toISOString() : '', c.details].map(csvCell).join(','));
        }
        if (page >= data.totalPages) break;
      }
      return new NextResponse(rows.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="whatsapp-campaign-${metric}.csv"`,
        },
      });
    }

    const data = await WhatsAppCampaignReportService.getMetricContacts(tenantId, id, metric as WhatsAppMetricKey, {
      page: Number(url.searchParams.get('page')) || 1,
      pageSize: Number(url.searchParams.get('pageSize')) || 25,
      search,
    });
    if (!data) return NextResponse.json({ error: 'WhatsApp campaign not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[WhatsApp report]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load the campaign report.' }, { status: 500 });
  }
}
