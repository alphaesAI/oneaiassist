import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { SegmentationService, SegmentRuleGroup } from '@/lib/email/segmentation';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const segment = await db.segment.findUnique({
      where: { id, tenantId },
    });

    if (!segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const targetChannel = (url.searchParams.get('channel') || 'EMAIL').toUpperCase() as 'EMAIL' | 'WHATSAPP' | 'INSTAGRAM';

    const rules = segment.rules as unknown as SegmentRuleGroup;
    const { audienceCount, optedOutCount } = await SegmentationService.countSegmentAudience(
      tenantId,
      rules,
      targetChannel,
      db
    );

    return NextResponse.json({
      segmentId: id,
      name: segment.name,
      channel: targetChannel,
      audienceCount,
      optedOutCount,
    });
  } catch (error: any) {
    console.error('Failed to get segment audience count:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
