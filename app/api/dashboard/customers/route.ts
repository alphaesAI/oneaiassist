import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const customers = await db.customer.findMany({
      where: { tenantId },
      include: {
        activePolicy: true,
      },
      orderBy: { displayName: 'asc' },
    });

    const formatted = customers.map((c) => {
      let phone = c.primaryPhone;
      try {
        phone = decrypt(c.primaryPhone);
      } catch {
        // keep as is if not encrypted
      }
      return {
        ...c,
        primaryPhone: phone,
      };
    });

    return NextResponse.json(formatted);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
