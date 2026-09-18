import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db/index';
import { decrypt } from '@/lib/encryption';
import { sessions } from '@/whatsapp-engine/engine-logic';

export async function GET() {
  try {
    const { tenantId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, 'ADMIN');

    const session = await db.whatsAppNumber.findUnique({
      where: { tenantId },
    });

    if (!session) {
      return NextResponse.json({ status: 'DISCONNECTED' });
    }

    let phone = null;
    if (session.phoneNumber) {
      try {
        phone = decrypt(session.phoneNumber);
      } catch {
        phone = session.phoneNumber;
      }
    }

    const isConnected = session.status === 'CONNECTED' && sessions.has(tenantId);

    return NextResponse.json({
      status: isConnected ? 'CONNECTED' : session.status,
      phoneNumber: phone,
    });
  } catch {
    return NextResponse.json({ status: 'DISCONNECTED' });
  }
}
