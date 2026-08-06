import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: Request) {
  try {
    const { tenantId } = await getTenantContext();
    const body = await req.json().catch(() => ({}));
    const engine = body?.engine || 'BAILEYS';
    const method = body?.method || 'QR';
    const phoneNumber = body?.phoneNumber || '';

    // Proxy to the standalone WhatsApp engine on port 3001
    const engineRes = await fetch('http://localhost:3001/api/whatsapp/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, engine, method, phoneNumber }),
      signal: AbortSignal.timeout(5000),
    });

    if (engineRes.ok) {
      const data = await engineRes.json();
      return NextResponse.json(data);
    }

    const errText = await engineRes.text().catch(() => 'Engine error');
    return NextResponse.json({ error: errText }, { status: engineRes.status });
  } catch (err: unknown) {
    // Engine offline — return INITIALIZING so the UI knows to keep polling via socket
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('fetch'))) {
      return NextResponse.json({
        status: 'ENGINE_OFFLINE',
        message: 'WhatsApp engine (port 3001) is not reachable. Please start it with: npx tsx whatsapp-engine/server.ts',
      }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
