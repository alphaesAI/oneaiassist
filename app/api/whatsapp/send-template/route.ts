import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { ConversationTemplateError, sendTemplateInConversation } from '@/lib/whatsapp/conversationTemplate';
import { usesOfficialApi } from '@/lib/whatsapp/serviceWindow';

function failure(err: unknown, fallback: string) {
  if (err instanceof ConversationTemplateError) return NextResponse.json({ error: err.message }, { status: err.status });
  const msg = err instanceof Error ? err.message : '';
  const unauthorized = msg.startsWith('Unauthorized');
  if (!unauthorized) console.error('[WhatsApp send-template]', msg);
  return NextResponse.json({ error: unauthorized ? msg : fallback }, { status: unauthorized ? 401 : 500 });
}

/** Tells the inbox whether this account is on the official API (where the 24-hour rule applies). */
export async function GET() {
  try {
    const { tenantId } = await getTenantContext();
    if (!tenantId) return NextResponse.json({ error: 'No account selected.' }, { status: 400 });
    return NextResponse.json({ officialApi: await usesOfficialApi(tenantId) });
  } catch (err) {
    return failure(err, 'Could not read the WhatsApp connection.');
  }
}

/** Sends one approved template to the contact of a conversation. */
export async function POST(req: Request) {
  try {
    const { tenantId } = await getTenantContext();
    if (!tenantId) return NextResponse.json({ error: 'No account selected.' }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
    const templateId = typeof body.templateId === 'string' ? body.templateId : '';
    if (!conversationId || !templateId) {
      return NextResponse.json({ error: 'conversationId and templateId are required.' }, { status: 400 });
    }
    const message = await sendTemplateInConversation({ tenantId, conversationId, templateId });
    return NextResponse.json({ success: true, messageId: message.id });
  } catch (err) {
    return failure(err, 'Could not send the template.');
  }
}
