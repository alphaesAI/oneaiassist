import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { SegmentationService } from '@/lib/email/segmentation';

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const targetChannel = (body.channel || 'EMAIL').toUpperCase() as 'EMAIL' | 'WHATSAPP' | 'INSTAGRAM';
    const rules = body.rules || { condition: 'AND', rules: [] };

    const { audienceCount, optedOutCount } = await SegmentationService.countSegmentAudience(
      tenantId,
      rules,
      targetChannel,
      db
    );

    return NextResponse.json({
      channel: targetChannel,
      audienceCount,
      optedOutCount,
    });
  } catch (error: any) {
    console.error('Failed to preview segment audience count:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
