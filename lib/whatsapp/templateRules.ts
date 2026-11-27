/**
 * Meta's rules for WhatsApp message templates, checked before anything is sent to Meta, and the
 * conversion between our stored template and Meta's "components" format.
 */

export type TemplateButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE';

export interface TemplateButton {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
}

/** Where a variable's real value comes from when a message is sent. */
export interface TemplateVariable {
  index: number;
  /** A realistic sample value. Meta requires one for every variable to review the template. */
  example: string;
  /** A contact field (name, first_name, last_name, email, phone) or "custom:<key>"; filled in at send time. */
  source?: string;
}

export interface TemplateVariables {
  body?: TemplateVariable[];
  header?: TemplateVariable[];
  /** Sample for the single variable allowed at the end of a URL button. */
  buttonUrlExample?: string;
}

export interface WhatsAppTemplateDraft {
  name: string;
  language: string;
  category: string;
  headerType: string;
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
  variables?: TemplateVariables | null;
}

export const LIMITS = {
  name: 512,
  headerText: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  url: 2000,
  phone: 20,
  quickReplies: 10,
  urlButtons: 2,
  phoneButtons: 1,
  totalButtons: 10,
} as const;

export const SUPPORTED_CATEGORIES = ['MARKETING', 'UTILITY'] as const;
export const VARIABLE_SOURCES = ['name', 'first_name', 'last_name', 'email', 'phone'] as const;

const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;
const ANY_BRACES_RE = /\{\{[^}]*\}\}/g;

/** Template names at Meta are lowercase letters, digits and underscores. */
export function normalizeTemplateName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The variable numbers used in a text, in order of first appearance. */
export function variableIndexes(text: string | null | undefined): number[] {
  const seen: number[] = [];
  for (const m of String(text || '').matchAll(VAR_RE)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

export function normalizeButtons(raw: unknown): TemplateButton[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateButton[] = [];
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const rawType = String((b as any).type || '').toUpperCase();
    const type: TemplateButtonType | null =
      rawType === 'QUICK_REPLY' ? 'QUICK_REPLY' : rawType === 'URL' ? 'URL' : rawType === 'PHONE' || rawType === 'PHONE_NUMBER' ? 'PHONE' : null;
    if (!type) continue;
    out.push({
      type,
      text: String((b as any).text || '').trim(),
      ...(type === 'URL' ? { url: String((b as any).url || '').trim() } : {}),
      ...(type === 'PHONE' ? { phoneNumber: String((b as any).phoneNumber || (b as any).phone_number || '').trim() } : {}),
    });
  }
  return out;
}

function checkSequential(indexes: number[], where: string, problems: string[]): void {
  const sorted = [...indexes].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      problems.push(`${where}: variables must be numbered {{1}}, {{2}}, {{3}} with no gaps. Found {{${sorted[i]}}} where {{${i + 1}}} was expected.`);
      return;
    }
  }
}

function checkOnlyNumbered(text: string, where: string, problems: string[]): void {
  const odd = (text.match(ANY_BRACES_RE) || []).filter((m) => !/^\{\{\s*\d+\s*\}\}$/.test(m));
  if (odd.length > 0) {
    problems.push(`${where}: "${odd[0]}" is not a valid variable. WhatsApp variables are numbers, like {{1}}.`);
  }
}

function exampleFor(list: TemplateVariable[] | undefined, index: number): string {
  const found = (list || []).find((v) => Number(v?.index) === index);
  return String(found?.example ?? '').trim();
}

/**
 * Every reason this template would be refused, in plain language. An empty list means it can be
 * submitted. Nothing is invented or auto-corrected: a missing sample value is reported, not made up.
 */
export function validateWhatsAppTemplate(draft: WhatsAppTemplateDraft): string[] {
  const problems: string[] = [];
  const name = String(draft.name || '');
  const body = String(draft.body || '');
  const headerType = String(draft.headerType || 'NONE').toUpperCase();
  const header = String(draft.header || '').trim();
  const footer = String(draft.footer || '').trim();
  const buttons = normalizeButtons(draft.buttons);
  const vars = draft.variables || {};

  if (!name) problems.push('Give the template a name.');
  else if (!/^[a-z0-9_]+$/.test(name)) problems.push('The name can only contain lowercase letters, numbers and underscores.');
  else if (name.length > LIMITS.name) problems.push(`The name is too long (maximum ${LIMITS.name} characters).`);

  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(String(draft.language || ''))) {
    problems.push('Choose a language. Use a WhatsApp language code such as en, en_US or hi.');
  }

  const category = String(draft.category || '').toUpperCase();
  if (category === 'AUTHENTICATION') {
    problems.push('One-time-password (Authentication) templates have a special format that is not supported yet. Choose Marketing or Utility.');
  } else if (!(SUPPORTED_CATEGORIES as readonly string[]).includes(category)) {
    problems.push('Choose a category: Marketing or Utility.');
  }

  // Body
  if (!body.trim()) {
    problems.push('The message body is empty.');
  } else {
    if (body.length > LIMITS.body) problems.push(`The body is too long: ${body.length} characters (maximum ${LIMITS.body}).`);
    checkOnlyNumbered(body, 'Body', problems);
    const idx = variableIndexes(body);
    checkSequential(idx, 'Body', problems);
    const trimmed = body.trim();
    if (/^\{\{\s*\d+\s*\}\}/.test(trimmed) || /\{\{\s*\d+\s*\}\}$/.test(trimmed)) {
      problems.push('The body cannot start or end with a variable. Add some text before and after it.');
    }
    if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(body)) {
      problems.push('Two variables cannot sit directly next to each other in the body. Put some text between them.');
    }
    for (const i of idx) {
      if (!exampleFor(vars.body, i)) problems.push(`Body: add a sample value for {{${i}}}. Meta needs one to review the template.`);
    }
  }

  // Header
  if (headerType === 'TEXT') {
    if (!header) problems.push('The header is switched on but empty. Add header text or choose "No header".');
    if (header.length > LIMITS.headerText) problems.push(`The header is too long: ${header.length} characters (maximum ${LIMITS.headerText}).`);
    checkOnlyNumbered(header, 'Header', problems);
    const idx = variableIndexes(header);
    if (idx.length > 1) problems.push('The header can contain only one variable.');
    else if (idx.length === 1) {
      if (idx[0] !== 1) problems.push('The header variable must be {{1}}.');
      if (!exampleFor(vars.header, 1)) problems.push('Header: add a sample value for {{1}}.');
    }
    if (/[\n\r*_~`]/.test(header)) problems.push('The header cannot contain line breaks or formatting characters (* _ ~ `).');
  } else if (headerType !== 'NONE') {
    problems.push('Image, video and document headers are not supported yet. Use a text header or no header.');
  }

  // Footer
  if (footer) {
    if (footer.length > LIMITS.footer) problems.push(`The footer is too long: ${footer.length} characters (maximum ${LIMITS.footer}).`);
    if (ANY_BRACES_RE.test(footer)) problems.push('The footer cannot contain variables.');
    ANY_BRACES_RE.lastIndex = 0;
  }

  // Buttons
  const quick = buttons.filter((b) => b.type === 'QUICK_REPLY');
  const urls = buttons.filter((b) => b.type === 'URL');
  const phones = buttons.filter((b) => b.type === 'PHONE');
  if (buttons.length > LIMITS.totalButtons) problems.push(`Too many buttons (maximum ${LIMITS.totalButtons}).`);
  if (quick.length > LIMITS.quickReplies) problems.push(`Too many quick-reply buttons (maximum ${LIMITS.quickReplies}).`);
  if (urls.length > LIMITS.urlButtons) problems.push(`Too many website buttons (maximum ${LIMITS.urlButtons}).`);
  if (phones.length > LIMITS.phoneButtons) problems.push(`Only ${LIMITS.phoneButtons} call button is allowed.`);

  // Quick replies and call-to-action buttons must each stay together (no mixing in between).
  const kinds = buttons.map((b) => (b.type === 'QUICK_REPLY' ? 'Q' : 'C')).join('');
  if (/QC+Q|CQ+C/.test(kinds)) {
    problems.push('Keep quick-reply buttons together and website/call buttons together. They cannot be mixed in between each other.');
  }

  const seenText = new Set<string>();
  buttons.forEach((b, i) => {
    const label = `Button ${i + 1}`;
    if (!b.text) problems.push(`${label}: add the button text.`);
    else if (b.text.length > LIMITS.buttonText) problems.push(`${label}: the text is too long (maximum ${LIMITS.buttonText} characters).`);
    if (ANY_BRACES_RE.test(b.text)) problems.push(`${label}: the button text cannot contain variables.`);
    ANY_BRACES_RE.lastIndex = 0;
    const key = b.text.toLowerCase();
    if (b.text && seenText.has(key)) problems.push(`${label}: two buttons cannot have the same text.`);
    seenText.add(key);

    if (b.type === 'URL') {
      const url = b.url || '';
      if (!/^https?:\/\/[^\s]+$/i.test(url)) problems.push(`${label}: enter a full web address starting with https://`);
      else if (url.length > LIMITS.url) problems.push(`${label}: the web address is too long.`);
      const idx = variableIndexes(url);
      const braces = url.match(ANY_BRACES_RE) || [];
      if (braces.length > 1 || (idx.length === 1 && idx[0] !== 1) || braces.length !== idx.length) {
        problems.push(`${label}: a web address can contain only one variable, and it must be {{1}}.`);
      } else if (idx.length === 1) {
        if (!/\{\{\s*1\s*\}\}$/.test(url)) problems.push(`${label}: the variable {{1}} must be at the very end of the web address.`);
        if (!String(vars.buttonUrlExample || '').trim()) problems.push(`${label}: add a sample value for the web address variable.`);
      }
    }
    if (b.type === 'PHONE') {
      const phone = b.phoneNumber || '';
      if (!/^\+[1-9]\d{6,18}$/.test(phone.replace(/[\s\-()]/g, ''))) {
        problems.push(`${label}: enter the phone number with country code, for example +14155550100.`);
      } else if (phone.length > LIMITS.phone) problems.push(`${label}: the phone number is too long.`);
    }
  });
  const urlsWithVar = urls.filter((b) => variableIndexes(b.url).length > 0);
  if (urlsWithVar.length > 1) problems.push('Only one website button can contain a variable.');

  return problems;
}

/** Builds the "components" array Meta expects. Call only after validateWhatsAppTemplate returned no problems. */
export function buildMetaComponents(draft: WhatsAppTemplateDraft): any[] {
  const components: any[] = [];
  const vars = draft.variables || {};
  const headerType = String(draft.headerType || 'NONE').toUpperCase();
  const header = String(draft.header || '').trim();
  const footer = String(draft.footer || '').trim();
  const body = String(draft.body || '');

  if (headerType === 'TEXT' && header) {
    const idx = variableIndexes(header);
    components.push({
      type: 'HEADER',
      format: 'TEXT',
      text: header,
      ...(idx.length > 0 ? { example: { header_text: [exampleFor(vars.header, 1)] } } : {}),
    });
  }

  const bodyIdx = variableIndexes(body).sort((a, b) => a - b);
  components.push({
    type: 'BODY',
    text: body,
    ...(bodyIdx.length > 0 ? { example: { body_text: [bodyIdx.map((i) => exampleFor(vars.body, i))] } } : {}),
  });

  if (footer) components.push({ type: 'FOOTER', text: footer });

  const buttons = normalizeButtons(draft.buttons);
  if (buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((b) => {
        if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
        if (b.type === 'PHONE') return { type: 'PHONE_NUMBER', text: b.text, phone_number: (b.phoneNumber || '').replace(/[\s\-()]/g, '') };
        const hasVar = variableIndexes(b.url).length > 0;
        const base = (b.url || '').replace(/\{\{\s*1\s*\}\}$/, '');
        return {
          type: 'URL',
          text: b.text,
          url: b.url,
          ...(hasVar ? { example: [`${base}${String(vars.buttonUrlExample || '').trim()}`] } : {}),
        };
      }),
    });
  }
  return components;
}

/** Reads Meta's components back into our stored fields (used when importing templates that exist at Meta). */
export function parseMetaComponents(components: any[]): {
  headerType: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  variables: TemplateVariables;
  /** Set when the template uses something we cannot send yet (for example an image header). */
  unsupported: string | null;
} {
  let headerType = 'NONE';
  let header: string | null = null;
  let body = '';
  let footer: string | null = null;
  let unsupported: string | null = null;
  const buttons: TemplateButton[] = [];
  const variables: TemplateVariables = {};

  for (const c of Array.isArray(components) ? components : []) {
    const type = String(c?.type || '').toUpperCase();
    if (type === 'HEADER') {
      const format = String(c?.format || 'TEXT').toUpperCase();
      if (format === 'TEXT') {
        headerType = 'TEXT';
        header = String(c?.text || '');
        const ex = c?.example?.header_text;
        if (Array.isArray(ex) && ex.length > 0) variables.header = [{ index: 1, example: String(ex[0]) }];
      } else {
        headerType = format;
        unsupported = `It has a ${format.toLowerCase()} header, which is not supported yet.`;
      }
    } else if (type === 'BODY') {
      body = String(c?.text || '');
      const ex = Array.isArray(c?.example?.body_text) ? c.example.body_text[0] : null;
      if (Array.isArray(ex)) variables.body = ex.map((value: unknown, i: number) => ({ index: i + 1, example: String(value) }));
      if (c?.add_security_recommendation !== undefined) unsupported = 'It is an authentication (one-time password) template, which is not supported yet.';
    } else if (type === 'FOOTER') {
      footer = String(c?.text || '');
    } else if (type === 'BUTTONS') {
      for (const b of Array.isArray(c?.buttons) ? c.buttons : []) {
        const bt = String(b?.type || '').toUpperCase();
        if (bt === 'QUICK_REPLY') buttons.push({ type: 'QUICK_REPLY', text: String(b?.text || '') });
        else if (bt === 'PHONE_NUMBER') buttons.push({ type: 'PHONE', text: String(b?.text || ''), phoneNumber: String(b?.phone_number || '') });
        else if (bt === 'URL') {
          const url = String(b?.url || '');
          buttons.push({ type: 'URL', text: String(b?.text || ''), url });
          const ex = Array.isArray(b?.example) ? String(b.example[0] || '') : '';
          if (ex && variableIndexes(url).length > 0) {
            const base = url.replace(/\{\{\s*1\s*\}\}$/, '');
            variables.buttonUrlExample = ex.startsWith(base) ? ex.slice(base.length) : ex;
          }
        } else {
          unsupported = `It has a "${bt.toLowerCase()}" button, which is not supported yet.`;
        }
      }
    } else if (type) {
      unsupported = `It has a "${type.toLowerCase()}" section, which is not supported yet.`;
    }
  }
  return { headerType, header, body, footer, buttons, variables, unsupported };
}

/** Our status for a status word reported by Meta. */
export function mapMetaStatus(metaStatus: string): 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' {
  switch (String(metaStatus || '').toUpperCase()) {
    case 'APPROVED':
      return 'APPROVED';
    case 'REJECTED':
      return 'REJECTED';
    case 'PAUSED':
      return 'PAUSED';
    case 'DISABLED':
    case 'DELETED':
    case 'PENDING_DELETION':
    case 'LIMIT_EXCEEDED':
    case 'ARCHIVED':
      return 'DISABLED';
    default:
      // PENDING, IN_APPEAL, and any status word we do not know: not usable until Meta says APPROVED.
      return 'PENDING';
  }
}
