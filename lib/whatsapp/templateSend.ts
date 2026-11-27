/**
 * Turning an approved template plus one contact into the exact message Meta is asked to send.
 * A variable with no real value is never filled with a placeholder: the caller is told which
 * value is missing and that contact is skipped.
 */
import { decrypt } from '@/lib/encryption';
import { normalizeButtons, variableIndexes, type TemplateVariables } from './templateRules';

export interface SendableTemplate {
  name: string;
  language: string;
  headerType: string;
  header: string | null;
  body: string;
  footer: string | null;
  ctaButtons: unknown;
  variables: unknown;
}

export interface TemplateContact {
  displayName: string | null;
  email: string | null;
  /** Phone in international format, digits only or with "+". */
  phone: string | null;
  customFields: unknown;
}

const SOURCE_LABELS: Record<string, string> = {
  name: 'full name',
  first_name: 'first name',
  last_name: 'last name',
  email: 'email address',
  phone: 'phone number',
};

export function describeSource(source: string): string {
  if (source.startsWith('custom:')) return `custom field "${source.slice(7)}"`;
  return SOURCE_LABELS[source] || source;
}

export function isKnownSource(source: unknown): source is string {
  if (typeof source !== 'string' || !source) return false;
  return source in SOURCE_LABELS || /^custom:[a-z0-9_]+$/.test(source);
}

/** The stored phone number as digits only (the format Meta expects), or null when it is not a usable number. */
export function toWhatsAppRecipient(storedPhone: string | null | undefined): string | null {
  if (!storedPhone) return null;
  let phone = storedPhone;
  // Phone numbers are stored encrypted (iv:tag:ciphertext).
  if (phone.split(':').length === 3) {
    try {
      phone = decrypt(phone);
    } catch {
      return null;
    }
  }
  const digits = phone.split('@')[0].replace(/[^\d]/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function valueFor(source: string, contact: TemplateContact): string {
  const name = (contact.displayName || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  let value = '';
  if (source === 'name') value = name;
  else if (source === 'first_name') value = parts[0] || '';
  else if (source === 'last_name') value = parts.slice(1).join(' ');
  else if (source === 'email') value = (contact.email || '').trim();
  else if (source === 'phone') value = contact.phone ? `+${contact.phone.replace(/[^\d]/g, '')}` : '';
  else if (source.startsWith('custom:')) {
    const fields = contact.customFields && typeof contact.customFields === 'object' ? (contact.customFields as Record<string, unknown>) : {};
    const raw = fields[source.slice(7)];
    value = raw === null || raw === undefined ? '' : String(raw).trim();
  }
  // Meta rejects parameter text with line breaks, tabs, or long runs of spaces.
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
}

interface VariableSlot {
  where: 'header' | 'body' | 'button';
  index: number;
  source: string | null;
}

function slotsFor(template: SendableTemplate): VariableSlot[] {
  const vars = (template.variables && typeof template.variables === 'object' ? template.variables : {}) as TemplateVariables & {
    buttonUrlSource?: string;
  };
  const slots: VariableSlot[] = [];
  if (String(template.headerType).toUpperCase() === 'TEXT' && variableIndexes(template.header).length > 0) {
    const src = (vars.header || []).find((v) => Number(v?.index) === 1)?.source;
    slots.push({ where: 'header', index: 1, source: isKnownSource(src) ? src : null });
  }
  for (const i of variableIndexes(template.body).sort((a, b) => a - b)) {
    const src = (vars.body || []).find((v) => Number(v?.index) === i)?.source;
    slots.push({ where: 'body', index: i, source: isKnownSource(src) ? src : null });
  }
  if (normalizeButtons(template.ctaButtons).some((b) => b.type === 'URL' && variableIndexes(b.url).length > 0)) {
    slots.push({ where: 'button', index: 1, source: isKnownSource(vars.buttonUrlSource) ? vars.buttonUrlSource : null });
  }
  return slots;
}

const WHERE_LABEL = { header: 'Header', body: 'Body', button: 'Website button' } as const;

/**
 * Reasons this template cannot be used for a broadcast yet (for example a variable that has not
 * been told where its value comes from). Empty when it is ready.
 */
export function templateBroadcastProblems(template: SendableTemplate): string[] {
  return slotsFor(template)
    .filter((slot) => !slot.source)
    .map(
      (slot) =>
        `${WHERE_LABEL[slot.where]} variable {{${slot.index}}} has no "Fill from" source. Edit the template and choose which contact field fills it.`
    );
}

export type BuiltTemplateMessage =
  | { ok: true; components: unknown[]; renderedText: string }
  | { ok: false; reason: string };

/** Builds the message for one contact, or says exactly which value this contact is missing. */
export function buildTemplateMessage(template: SendableTemplate, contact: TemplateContact): BuiltTemplateMessage {
  const slots = slotsFor(template);
  const values = new Map<string, string>();
  for (const slot of slots) {
    if (!slot.source) {
      return { ok: false, reason: `${WHERE_LABEL[slot.where]} variable {{${slot.index}}} has no "Fill from" source.` };
    }
    const value = valueFor(slot.source, contact);
    if (!value) {
      return {
        ok: false,
        reason: `This contact has no ${describeSource(slot.source)}, which ${WHERE_LABEL[slot.where].toLowerCase()} variable {{${slot.index}}} needs.`,
      };
    }
    values.set(`${slot.where}:${slot.index}`, value);
  }

  const components: unknown[] = [];
  const fill = (text: string, where: 'header' | 'body') =>
    text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => values.get(`${where}:${Number(n)}`) ?? '');

  const headerSlot = slots.find((s) => s.where === 'header');
  if (headerSlot) {
    components.push({ type: 'header', parameters: [{ type: 'text', text: values.get('header:1') }] });
  }
  const bodySlots = slots.filter((s) => s.where === 'body');
  if (bodySlots.length > 0) {
    components.push({ type: 'body', parameters: bodySlots.map((s) => ({ type: 'text', text: values.get(`body:${s.index}`) })) });
  }
  const buttons = normalizeButtons(template.ctaButtons);
  const urlIndex = buttons.findIndex((b) => b.type === 'URL' && variableIndexes(b.url).length > 0);
  if (urlIndex >= 0) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(urlIndex),
      parameters: [{ type: 'text', text: encodeURIComponent(values.get('button:1') || '') }],
    });
  }

  // The text shown in our own inbox: what the contact actually received.
  const lines: string[] = [];
  if (String(template.headerType).toUpperCase() === 'TEXT' && template.header) lines.push(`*${fill(template.header, 'header')}*`, '');
  lines.push(fill(template.body, 'body'));
  if (template.footer) lines.push('', `_${template.footer}_`);
  if (buttons.length > 0) lines.push('', buttons.map((b) => `[${b.text}]`).join(' '));

  return { ok: true, components, renderedText: lines.join('\n') };
}

const TIER_LIMITS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Number.MAX_SAFE_INTEGER,
};

/**
 * How many business-initiated messages this number may send in a rolling 24 hours. When Meta has
 * not reported a tier we stay at the lowest standard tier rather than guess a higher one.
 */
export function dailyLimitForTier(tier: string | null | undefined): number {
  const known = TIER_LIMITS[String(tier || '').toUpperCase()];
  if (known) return known;
  const fallback = Number(process.env.WHATSAPP_DEFAULT_DAILY_LIMIT || 250);
  return Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : 250;
}
