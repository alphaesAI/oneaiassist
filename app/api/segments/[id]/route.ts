import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { SegmentationService } from '@/lib/email/segmentation';

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const segment = await db.segment.findUnique({
      where: { id, tenantId },
      include: {
        _count: { select: { campaigns: true } },
      },
    });

    if (!segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    return NextResponse.json({ segment });
  } catch (error: any) {
    console.error('Failed to get segment:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const data: any = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      data.name = name;
    }

    if (body.description !== undefined) {
      data.description = body.description ? String(body.description).trim() : null;
    }

    if (body.rules !== undefined) {
      if (!SegmentationService.isRuleGroup(body.rules)) {
        return NextResponse.json({ error: 'Invalid rule tree structure' }, { status: 400 });
      }
      data.rules = body.rules;
    }

    const updated = await db.segment.updateMany({
      where: { id, tenantId },
      data,
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    const segment = await db.segment.findUnique({ where: { id, tenantId } });
    return NextResponse.json({ segment });
  } catch (error: any) {
    console.error('Failed to update segment:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const deleted = await db.segment.deleteMany({
      where: { id, tenantId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete segment:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
