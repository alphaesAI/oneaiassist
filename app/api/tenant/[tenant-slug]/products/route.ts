import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';

export async function GET(request: Request, { params }: { params: { 'tenant-slug': string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = params['tenant-slug'];

    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const category = searchParams.get('category');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const coverage = searchParams.get('coverage'); // optional custom field placeholder

    // Build where clause
    const where: any = { tenantId: tenant.id };
    if (category) where.category = category;
    if (minPrice) where.premiumMin = { gte: Number(minPrice) };
    if (maxPrice) where.premiumMax = { lte: Number(maxPrice) };
    if (coverage) where.coverageType = coverage; // assumes field exists

    const db = getTenantPrisma(tenant.id, 'CUSTOMER');
    const items = await db.policyCatalogItem.findMany({ where });
    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('[Products API Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
