import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { connectTenant, sessions, qrCodes, pairingCodes } from '@/whatsapp-engine/engine-logic';
import { getTenantPrisma } from '@/lib/db/index';
import { getSocketIO } from '@/lib/socket-server';
import qrcode from 'qrcode';

export async function POST(req: Request) {
  let tenantId: string;
  try {
    const ctx = await getTenantContext();
    tenantId = ctx.tenantId;
  } catch {
    return NextResponse.json({ error: 'Unauthorized: No active session found' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const engine = body?.engine || 'BAILEYS';
    const method = body?.method || 'QR';
    const phoneNumber = body?.phoneNumber || '';

    const io = getSocketIO();
    const db = getTenantPrisma(tenantId, 'ADMIN');

    const session = await db.whatsAppNumber.findUnique({
      where: { tenantId },
    });

    if (session?.status === 'CONNECTED' && sessions.has(tenantId)) {
      return NextResponse.json({ status: 'CONNECTED' });
    }

    // Trigger Baileys connection asynchronously in-memory
    connectTenant(tenantId, io, phoneNumber);

    if (method === 'PHONE' && phoneNumber) {
      const code = pairingCodes.get(tenantId);
      if (code) {
        return NextResponse.json({ status: 'PAIRING_CODE_PENDING', pairingCode: code, engine: 'BAILEYS' });
      }
      return NextResponse.json({ status: 'INITIALIZING', engine: 'BAILEYS', message: 'Generating pairing code...' });
    }

    const qrRaw = qrCodes.get(tenantId);
    if (qrRaw) {
      const qrDataUrl = qrRaw.startsWith('data:image') ? qrRaw : await qrcode.toDataURL(qrRaw);
      return NextResponse.json({ status: 'QR_PENDING', qr: qrDataUrl, engine: 'BAILEYS' });
    }

    return NextResponse.json({ status: 'INITIALIZING', engine: 'BAILEYS', message: 'Generating QR code...' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown connection error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
