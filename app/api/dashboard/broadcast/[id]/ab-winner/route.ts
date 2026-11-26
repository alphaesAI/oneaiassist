import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { AbTestingService } from '@/lib/email/abTesting';

export const dynamic = 'force-dynamic';

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
    const { id: campaignId } = await params;
    const performance = await AbTestingService.getCampaignAbPerformance(tenantId, campaignId);
    if (!performance) {
      return NextResponse.json({ error: 'Campaign not found or not an A/B test' }, { status: 404 });
    }
    return NextResponse.json(performance);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error retrieving A/B performance';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
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
    const { id: campaignId } = await params;
    const evaluation = await AbTestingService.evaluateAbWinner(tenantId, campaignId);
    if (!evaluation) {
      return NextResponse.json({ error: 'Campaign not found or not an A/B test' }, { status: 404 });
    }
    return NextResponse.json(evaluation);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error evaluating A/B winner';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
