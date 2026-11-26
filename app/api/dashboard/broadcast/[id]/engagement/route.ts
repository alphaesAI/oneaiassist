import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { CampaignEngagementService } from '@/lib/email/campaignEngagement';

/**
 * GET /api/dashboard/broadcast/[id]/engagement?type=open|click&url=&page=&pageSize=
 * Lists the contacts who opened or clicked a campaign, and per-link click counts.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getTenantContext();
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const typeParam = (searchParams.get('type') || 'open').toUpperCase();
    if (typeParam !== 'OPEN' && typeParam !== 'CLICK') {
      return NextResponse.json({ error: 'type must be "open" or "click"' }, { status: 400 });
    }

    const result = await CampaignEngagementService.getEngagement(tenantId, id, {
      type: typeParam,
      url: searchParams.get('url'),
      page: Number(searchParams.get('page')) || 1,
      pageSize: Number(searchParams.get('pageSize')) || 50,
    });

    if (!result) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = msg.includes('Unauthorized') || msg.includes('No active session') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
