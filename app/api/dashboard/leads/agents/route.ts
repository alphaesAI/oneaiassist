import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const users = await db.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    const formatted = users.map((u) => {
      const display = u.email.split('@')[0];
      return {
        id: u.id,
        email: u.email,
        name: display.charAt(0).toUpperCase() + display.slice(1),
        role: u.role,
      };
    });

    return NextResponse.json(formatted);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
