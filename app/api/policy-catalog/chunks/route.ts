import { NextResponse, NextRequest } from 'next/server';
import { getTenantPrisma } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = getTenantPrisma(tenantId, 'MANAGER'); // Safe read scopes

    const chunks = await db.policyDocumentChunk.findMany({
      where: { policyCatalogId: id },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json(chunks);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch chunks';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
