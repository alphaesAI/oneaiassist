import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const customers = await db.customer.findMany({
      where: {
        tenantId,
        optedOutAt: null,
      },
      select: {
        tags: true,
      },
    });

    const tagCounts: Record<string, number> = {};
    for (const c of customers) {
      if (Array.isArray(c.tags)) {
        for (const tag of c.tags) {
          if (tag && typeof tag === 'string') {
            const trimmed = tag.trim();
            if (trimmed) {
              tagCounts[trimmed] = (tagCounts[trimmed] || 0) + 1;
            }
          }
        }
      }
    }

    const tags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return NextResponse.json(tags);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
