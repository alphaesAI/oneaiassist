/**
 * Minimal client for the Meta Graph API calls needed to connect a WhatsApp Business number.
 * `fetchImpl` is injectable so tests never call Meta.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';
const GRAPH_BASE = 'https://graph.facebook.com';

/** An error returned by Meta. The message is safe to show to a tenant admin: it never contains the token. */
export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code: number | null,
    readonly subcode: number | null
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

export interface MetaPhoneNumberDetails {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
}

export interface MetaConnectionInput {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

/** Removes the token from any text before it is stored, logged or returned. */
function scrub(text: string, accessToken: string): string {
  return accessToken ? text.split(accessToken).join('[token hidden]') : text;
}

function describeMetaError(status: number, body: any, accessToken: string): MetaGraphError {
  const err = body?.error || {};
  const code = typeof err.code === 'number' ? err.code : null;
  const subcode = typeof err.error_subcode === 'number' ? err.error_subcode : null;
  let message: string;
  if (code === 190) {
    message = 'Meta rejected the access token. It is wrong, expired, or was revoked. Create a new system-user token and enter it again.';
  } else if (code === 10 || code === 200 || code === 294) {
    message =
      'The access token does not have permission for this WhatsApp account. It needs whatsapp_business_messaging and whatsapp_business_management.';
  } else if (code === 100) {
    message = 'Meta could not find this ID with this token. Check the WhatsApp Business Account ID and the Phone Number ID.';
  } else if (code === 4 || code === 80007 || status === 429) {
    message = 'Meta is rate-limiting requests for this account. Wait a few minutes and try again.';
  } else {
    message = `Meta returned an error (HTTP ${status}).`;
  }
  // Meta puts the most useful explanation (for example why a template was refused) in error_user_msg.
  const metaText = [err.error_user_title, err.error_user_msg, err.message, err.error_data?.details]
    .filter((t) => typeof t === 'string' && t)
    .join(' - ');
  const detail = metaText ? ` Meta said: "${scrub(metaText, accessToken).slice(0, 400)}"` : '';
  const codeText = code !== null ? ` (code ${code}${subcode !== null ? `/${subcode}` : ''})` : '';
  return new MetaGraphError(`${message}${detail}${codeText}`, status, code, subcode);
}

export async function graphRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  accessToken: string,
  fetchImpl: FetchLike,
  query?: Record<string, string>,
  jsonBody?: unknown
): Promise<any> {
  const qs = query && Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : '';
  const url = `${GRAPH_BASE}/${META_API_VERSION}/${path}${qs}`;
  let res: Response;
  try {
    // The token travels only in the Authorization header, never in the URL (URLs end up in logs).
    res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(jsonBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(jsonBody !== undefined ? { body: JSON.stringify(jsonBody) } : {}),
    });
  } catch (err) {
    const reason = err instanceof Error ? scrub(err.message, accessToken) : 'network error';
    throw new MetaGraphError(`Could not reach Meta (${reason}). Check the internet connection and try again.`, 0, null, null);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok || body?.error) {
    throw describeMetaError(res.status, body, accessToken);
  }
  return body;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Reads the phone number's public details from Meta. Throws MetaGraphError when Meta refuses. */
export async function fetchPhoneNumberDetails(
  input: Pick<MetaConnectionInput, 'phoneNumberId' | 'accessToken'>,
  fetchImpl: FetchLike = fetch
): Promise<MetaPhoneNumberDetails> {
  const id = encodeURIComponent(input.phoneNumberId);
  const body = await graphRequest('GET', id, input.accessToken, fetchImpl, {
    fields: 'id,display_phone_number,verified_name,quality_rating',
  });

  // The messaging tier is asked for separately: Meta does not report it for every account,
  // and an unsupported field would otherwise fail the whole request.
  let messagingLimitTier: string | null = null;
  try {
    const tierBody = await graphRequest('GET', id, input.accessToken, fetchImpl, { fields: 'messaging_limit_tier' });
    messagingLimitTier = str(tierBody?.messaging_limit_tier);
  } catch {
    messagingLimitTier = null;
  }

  return {
    id: String(body?.id || input.phoneNumberId),
    displayPhoneNumber: str(body?.display_phone_number),
    verifiedName: str(body?.verified_name),
    qualityRating: str(body?.quality_rating),
    messagingLimitTier,
  };
}

/** True when the phone number is registered under the given WhatsApp Business Account. */
export async function phoneNumberBelongsToWaba(input: MetaConnectionInput, fetchImpl: FetchLike = fetch): Promise<boolean> {
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const query: Record<string, string> = { fields: 'id', limit: '100' };
    if (after) query.after = after;
    const body = await graphRequest('GET', `${encodeURIComponent(input.wabaId)}/phone_numbers`, input.accessToken, fetchImpl, query);
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    if (rows.some((row) => String(row?.id) === input.phoneNumberId)) return true;
    after = str(body?.paging?.cursors?.after);
    if (!after || !body?.paging?.next) return false;
  }
  return false;
}

/**
 * Checks with Meta that the token works, the phone number exists, and the number belongs to the account.
 * Throws MetaGraphError with a plain-language reason otherwise.
 */
export async function verifyConnection(input: MetaConnectionInput, fetchImpl: FetchLike = fetch): Promise<MetaPhoneNumberDetails> {
  const details = await fetchPhoneNumberDetails(input, fetchImpl);
  const belongs = await phoneNumberBelongsToWaba(input, fetchImpl);
  if (!belongs) {
    throw new MetaGraphError(
      'This Phone Number ID is not part of this WhatsApp Business Account. Check both IDs in Meta Business Manager.',
      400,
      null,
      null
    );
  }
  return details;
}

/** Subscribes our Meta app to the account, so Meta sends its messages and delivery updates to our webhook. */
export async function subscribeAppToWaba(
  input: Pick<MetaConnectionInput, 'wabaId' | 'accessToken'>,
  fetchImpl: FetchLike = fetch
): Promise<void> {
  const body = await graphRequest('POST', `${encodeURIComponent(input.wabaId)}/subscribed_apps`, input.accessToken, fetchImpl);
  if (body?.success !== true) {
    throw new MetaGraphError('Meta did not confirm the webhook subscription for this account.', 200, null, null);
  }
}

/* ------------------------------------------------------------------------------------------
 * Message templates
 * ---------------------------------------------------------------------------------------- */

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
  qualityScore: string | null;
  components: any[];
}

const TEMPLATE_FIELDS = 'id,name,language,status,category,rejected_reason,quality_score,components';

function toMetaTemplate(raw: any): MetaTemplate {
  const reason = str(raw?.rejected_reason);
  return {
    id: String(raw?.id || ''),
    name: String(raw?.name || ''),
    language: String(raw?.language || ''),
    status: String(raw?.status || '').toUpperCase(),
    category: str(raw?.category),
    rejectedReason: reason && reason.toUpperCase() !== 'NONE' ? reason : null,
    qualityScore: str(raw?.quality_score?.score),
    components: Array.isArray(raw?.components) ? raw.components : [],
  };
}

/** Submits a new template for review. Returns Meta's ID and first status. */
export async function createMessageTemplate(
  input: { wabaId: string; accessToken: string; name: string; language: string; category: string; components: unknown[] },
  fetchImpl: FetchLike = fetch
): Promise<{ id: string; status: string; category: string | null }> {
  const body = await graphRequest('POST', `${encodeURIComponent(input.wabaId)}/message_templates`, input.accessToken, fetchImpl, undefined, {
    name: input.name,
    language: input.language,
    category: input.category,
    components: input.components,
  });
  if (!body?.id) throw new MetaGraphError('Meta did not return an ID for the submitted template.', 200, null, null);
  return { id: String(body.id), status: String(body.status || 'PENDING').toUpperCase(), category: str(body.category) };
}

/** Sends changed content for an existing template (for example after a rejection) back for review. */
export async function updateMessageTemplate(
  input: { templateId: string; accessToken: string; category: string; components: unknown[] },
  fetchImpl: FetchLike = fetch
): Promise<void> {
  const body = await graphRequest('POST', encodeURIComponent(input.templateId), input.accessToken, fetchImpl, undefined, {
    category: input.category,
    components: input.components,
  });
  if (body?.success !== true) throw new MetaGraphError('Meta did not confirm the template update.', 200, null, null);
}

export async function getMessageTemplate(
  input: { templateId: string; accessToken: string },
  fetchImpl: FetchLike = fetch
): Promise<MetaTemplate> {
  const body = await graphRequest('GET', encodeURIComponent(input.templateId), input.accessToken, fetchImpl, { fields: TEMPLATE_FIELDS });
  return toMetaTemplate(body);
}

/** Every template in the WhatsApp Business Account. */
export async function listMessageTemplates(
  input: { wabaId: string; accessToken: string },
  fetchImpl: FetchLike = fetch
): Promise<MetaTemplate[]> {
  const out: MetaTemplate[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const query: Record<string, string> = { fields: TEMPLATE_FIELDS, limit: '100' };
    if (after) query.after = after;
    const body = await graphRequest('GET', `${encodeURIComponent(input.wabaId)}/message_templates`, input.accessToken, fetchImpl, query);
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    for (const row of rows) out.push(toMetaTemplate(row));
    after = str(body?.paging?.cursors?.after);
    if (!after || !body?.paging?.next) break;
  }
  return out;
}

/** Deletes one template (one language) at Meta. */
export async function deleteMessageTemplate(
  input: { wabaId: string; accessToken: string; name: string; templateId: string },
  fetchImpl: FetchLike = fetch
): Promise<void> {
  await graphRequest('DELETE', `${encodeURIComponent(input.wabaId)}/message_templates`, input.accessToken, fetchImpl, {
    name: input.name,
    hsm_id: input.templateId,
  });
}

/* ------------------------------------------------------------------------------------------
 * Sending
 * ---------------------------------------------------------------------------------------- */

/** Sends an approved template message to one phone number. Returns Meta's message ID (wamid). */
export async function sendTemplateMessage(
  input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    templateName: string;
    language: string;
    components: unknown[];
  },
  fetchImpl: FetchLike = fetch
): Promise<{ messageId: string }> {
  const body = await graphRequest('POST', `${encodeURIComponent(input.phoneNumberId)}/messages`, input.accessToken, fetchImpl, undefined, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.language },
      ...(input.components.length > 0 ? { components: input.components } : {}),
    },
  });
  const messageId = String(body?.messages?.[0]?.id || '');
  if (!messageId) throw new MetaGraphError('Meta accepted the request but returned no message ID.', 200, null, null);
  return { messageId };
}
