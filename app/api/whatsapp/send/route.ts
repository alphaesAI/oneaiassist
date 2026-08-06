import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: Request) {
  try {
    const { tenantId } = await getTenantContext();
    const { to, text, conversationId } = await req.json();

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 401 });
    }

    const res = await fetch('http://localhost:3001/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, to, text, conversationId }),
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
