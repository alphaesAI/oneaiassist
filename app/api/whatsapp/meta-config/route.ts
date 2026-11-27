import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { WhatsAppConnectionError, WhatsAppConnectionService } from '@/lib/whatsapp/connection';

const CAN_MANAGE = new Set(['ADMIN', 'PLATFORM_OWNER']);

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof WhatsAppConnectionError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : fallback;
  const unauthorized = msg.startsWith('Unauthorized');
  // Unexpected errors are logged on the server and not echoed to the browser.
  if (!unauthorized) console.error('[WhatsApp meta-config]', msg);
  return NextResponse.json({ error: unauthorized ? msg : fallback }, { status: unauthorized ? 401 : 500 });
}

export async function GET() {
  try {
    const { tenantId } = await getTenantContext();
    if (!tenantId) return NextResponse.json({ error: 'No account selected.' }, { status: 400 });
    return NextResponse.json(await WhatsAppConnectionService.getView(tenantId));
  } catch (err: unknown) {
    return errorResponse(err, 'Could not load the WhatsApp settings.');
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    if (!tenantId) return NextResponse.json({ error: 'No account selected.' }, { status: 400 });
    if (!CAN_MANAGE.has(role)) {
      return NextResponse.json({ error: 'Only an account admin can change the WhatsApp connection.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { view, warning } = await WhatsAppConnectionService.saveAndVerify(tenantId, {
      wabaId: body.metaWabaId,
      phoneNumberId: body.metaPhoneNumberId,
      accessToken: body.metaAccessToken,
    });

    const db = getTenantPrisma(tenantId, role);
    await db.auditLog.create({
      data: {
        userId,
        tenantId,
        action: 'WHATSAPP_PROVIDER_UPDATED',
        metadata: { provider: view.provider, metaPhoneNumberId: view.metaPhoneNumberId, metaWabaId: view.metaWabaId },
      },
    });

    return NextResponse.json({ success: true, warning, ...view });
  } catch (err: unknown) {
    return errorResponse(err, 'Could not save the WhatsApp connection.');
  }
}
