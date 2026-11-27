import crypto from 'node:crypto';
import { prisma } from '@/lib/db';

/**
 * The verify token Meta sends during the webhook handshake. It is a platform secret from the
 * environment. There is no built-in default: without the env value every handshake is refused.
 */
export function isValidWebhookVerifyToken(token: unknown): boolean {
  const expected = (process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  if (expected.length < 16 || typeof token !== 'string' || !token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * The tenant that owns a Meta phone number ID. Returns null for an unknown ID: an event for an
 * unknown number is dropped, never handed to some other tenant.
 */
export async function findTenantIdByPhoneNumberId(phoneNumberId: string | null | undefined): Promise<string | null> {
  const id = (phoneNumberId || '').trim();
  if (!id) return null;
  const number = await prisma.whatsAppNumber.findUnique({
    where: { metaPhoneNumberId: id },
    select: { tenantId: true, provider: true },
  });
  if (!number || number.provider !== 'META_CLOUD_API') return null;
  return number.tenantId;
}

const TEMPLATE_EVENT_FIELDS = new Set([
  'message_template_status_update',
  'message_template_quality_update',
  'template_category_update',
]);

/** The templates a webhook payload says have changed: which account, and which Meta template ID. */
export function extractTemplateEvents(body: any): Array<{ wabaId: string; metaTemplateId: string }> {
  const out: Array<{ wabaId: string; metaTemplateId: string }> = [];
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    const wabaId = String(entry?.id || '').trim();
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (!TEMPLATE_EVENT_FIELDS.has(String(change?.field || ''))) continue;
      const metaTemplateId = String(change?.value?.message_template_id ?? '').trim();
      if (wabaId && metaTemplateId) out.push({ wabaId, metaTemplateId });
    }
  }
  return out;
}

/**
 * Checks Meta's signature on a webhook request. Meta signs the exact bytes of the request body
 * with the app secret (header X-Hub-Signature-256: "sha256=<hex>"). Without the app secret in the
 * environment, or without the raw body, nothing is accepted.
 */
export function isValidMetaSignature(rawBody: Buffer | string | null | undefined, signatureHeader: unknown): boolean {
  const secret = (process.env.META_APP_SECRET || '').trim();
  if (!secret || rawBody === null || rawBody === undefined) return false;
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const given = header.slice('sha256='.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Option for express.json() that keeps the exact request bytes on `req.rawBody`, which the
 * signature check needs. Use it wherever a Meta webhook is mounted:
 *   express.json({ verify: captureRawBody })
 */
export function captureRawBody(req: any, _res: unknown, buf: Buffer): void {
  req.rawBody = Buffer.from(buf);
}
