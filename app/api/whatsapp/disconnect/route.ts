import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function POST() {
  try {
    const { tenantId, role } = await getTenantContext();

    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No active tenant context.' }, { status: 401 });
    }

    try {
      await fetch('http://localhost:3001/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
    } catch {
      console.warn('[WhatsApp Disconnect] Engine microservice on port 3001 offline, resetting DB directly.');
    }

    const db = getTenantPrisma(tenantId, role);
    await db.whatsAppNumber.upsert({
      where: { tenantId },
      create: { tenantId, sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
      update: { sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
    });

    return NextResponse.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to disconnect WhatsApp.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
