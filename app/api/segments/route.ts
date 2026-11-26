import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { SegmentationService } from '@/lib/email/segmentation';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const segments = await db.segment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { campaigns: true },
        },
      },
    });

    return NextResponse.json({ segments });
  } catch (error: any) {
    console.error('Failed to list segments:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const name = String(body.name || '').trim();
    const description = body.description ? String(body.description).trim() : null;
    const rules = body.rules || { condition: 'AND', rules: [] };

    if (!name) {
      return NextResponse.json({ error: 'Segment name is required' }, { status: 400 });
    }

    if (!SegmentationService.isRuleGroup(rules)) {
      return NextResponse.json({ error: 'Invalid rule tree structure' }, { status: 400 });
    }

    const existing = await db.segment.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
    if (existing) {
      return NextResponse.json({ error: 'A segment with this name already exists' }, { status: 409 });
    }

    const segment = await db.segment.create({
      data: {
        tenantId,
        name,
        description,
        rules: rules as any,
      },
    });

    return NextResponse.json({ segment }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create segment:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
