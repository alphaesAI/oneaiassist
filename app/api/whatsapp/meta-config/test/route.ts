import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { WhatsAppConnectionError, WhatsAppConnectionService } from '@/lib/whatsapp/connection';

const CAN_MANAGE = new Set(['ADMIN', 'PLATFORM_OWNER']);

/** Re-checks the saved WhatsApp Cloud API credentials with Meta. */
export async function POST() {
  try {
    const { tenantId, role } = await getTenantContext();
    if (!tenantId) return NextResponse.json({ error: 'No account selected.' }, { status: 400 });
    if (!CAN_MANAGE.has(role)) {
      return NextResponse.json({ error: 'Only an account admin can test the WhatsApp connection.' }, { status: 403 });
    }
    const result = await WhatsAppConnectionService.testSaved(tenantId);
    return NextResponse.json({ ok: result.ok, error: result.error, ...result.view });
  } catch (err: unknown) {
    if (err instanceof WhatsAppConnectionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : '';
    const unauthorized = msg.startsWith('Unauthorized');
    if (!unauthorized) console.error('[WhatsApp meta-config test]', msg);
    return NextResponse.json(
      { error: unauthorized ? msg : 'Could not test the WhatsApp connection.' },
      { status: unauthorized ? 401 : 500 }
    );
  }
}
