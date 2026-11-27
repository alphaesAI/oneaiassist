import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { WhatsAppTemplateError, WhatsAppTemplateService } from '@/lib/whatsapp/templateService';

/** Brings this account's WhatsApp templates in step with Meta (statuses, and templates created at Meta). */
export async function POST() {
  try {
    const { tenantId } = await getTenantContext();
    if (!tenantId) return NextResponse.json({ error: 'No account selected.' }, { status: 400 });
    const result = await WhatsAppTemplateService.syncTenant(tenantId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    if (err instanceof WhatsAppTemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : '';
    const unauthorized = msg.startsWith('Unauthorized');
    if (!unauthorized) console.error('[Template sync]', msg);
    return NextResponse.json(
      { error: unauthorized ? msg : 'The templates could not be synced with Meta.' },
      { status: unauthorized ? 401 : 500 }
    );
  }
}
