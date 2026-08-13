import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: Request) {
  try {
    const { tenantId } = await getTenantContext();

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 401 });
    }

    // Forward all send params (text, media, idempotency key, etc.)
    const { to, text, mediaId, mimeType, clientMessageId, conversationId } = await req.json();

    const res = await fetch('http://localhost:3001/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, to, text, mediaId, mimeType, clientMessageId, conversationId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.error || 'Failed to send message.' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Engine service offline.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
