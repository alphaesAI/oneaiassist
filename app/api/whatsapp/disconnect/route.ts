import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { sessions, qrCodes, pairingCodes } from '@/whatsapp-engine/engine-logic';
import { getSocketIO } from '@/lib/socket-server';

export async function POST() {
  try {
    const { tenantId, role } = await getTenantContext();

    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No active tenant context.' }, { status: 401 });
    }

    const sock = sessions.get(tenantId);
    if (sock) {
      try {
        await sock.logout();
      } catch {
        // Ignore logout error
      }
      sessions.delete(tenantId);
    }
    qrCodes.delete(tenantId);
    pairingCodes.delete(tenantId);

    const db = getTenantPrisma(tenantId, role);
    await db.whatsAppNumber.upsert({
      where: { tenantId },
      create: { tenantId, sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
      update: { sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
    });

    const io = getSocketIO();
    io?.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'DISCONNECTED' });

    return NextResponse.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to disconnect WhatsApp.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
