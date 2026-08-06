import { NextResponse } from 'next/server';
import { getTenantPrisma } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role || 'ADMIN');

    const policies = await db.policyCatalogItem.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(policies);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch catalog';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    if (role !== 'ADMIN' && role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { policyId, name, insurerName, states, premiumMin, premiumMax, sumInsured, active } = body;

    if (!policyId || !name || !insurerName || !states || premiumMin === undefined || premiumMax === undefined || sumInsured === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getTenantPrisma(tenantId, 'ADMIN');

    const policy = await db.policyCatalogItem.create({
      data: {
        tenantId,
        policyId,
        name,
        insurerName,
        states,
        premiumMin: Number(premiumMin),
        premiumMax: Number(premiumMax),
        sumInsured: Number(sumInsured),
        active: active !== undefined ? active : true,
        extractedSummary: '',
        pdfUrl: '',
      },
    });

    return NextResponse.json(policy);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Create catalog failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    if (role !== 'ADMIN' && role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { id, policyId, name, insurerName, states, premiumMin, premiumMax, sumInsured, active } = body;

    if (!id || !policyId || !name || !insurerName || !states || premiumMin === undefined || premiumMax === undefined || sumInsured === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getTenantPrisma(tenantId, 'ADMIN');

    const policy = await db.policyCatalogItem.update({
      where: { id },
      data: {
        policyId,
        name,
        insurerName,
        states,
        premiumMin: Number(premiumMin),
        premiumMax: Number(premiumMax),
        sumInsured: Number(sumInsured),
        active: active !== undefined ? active : true,
      },
    });

    return NextResponse.json(policy);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Update catalog failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
