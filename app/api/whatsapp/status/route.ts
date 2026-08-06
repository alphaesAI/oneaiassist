import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  try {
    const { tenantId } = await getTenantContext();
    
    const res = await fetch(`http://localhost:3001/api/whatsapp/status?tenantId=${tenantId}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ status: 'DISCONNECTED' });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: 'DISCONNECTED' });
  }
}
