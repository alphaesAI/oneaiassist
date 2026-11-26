/**
 * Email Template Personalization Engine
 * Supports merge tags with fallbacks: {{first_name | "there"}}, {{attribute}}, conditional blocks {{#if ...}}...{{/if}}
 * and plain-text conversion.
 */

export interface MergeContext {
  [key: string]: any;
}

export interface RenderOptions {
  escapeHtml?: boolean;
}

export interface DetailedRenderResult {
  rendered: string;
  missingTags: string[];
}

export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class EmailTemplateEngine {
  /**
   * Escape HTML entities in a string.
   */
  static escapeHtml(str: any): string {
    return escapeHtml(str);
  }

  /**
   * Sanitise template HTML on save to prevent stored XSS (SEC-21).
   * Strips <script> tags, iframe/embed/object tags, inline event handlers, and javascript: URIs.
   */
  static sanitizeHtml(html: string): string {
    if (!html) return '';

    let sanitized = html;

    // 1. Remove script tags and their content
    sanitized = sanitized.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '');
    sanitized = sanitized.replace(/<script\b[^>]*\/>/gi, '');

    // 2. Remove dangerous frame/object tags
    sanitized = sanitized.replace(/<(iframe|embed|object|frame|frameset)\b[^>]*>([\s\S]*?)<\/\1>/gi, '');
    sanitized = sanitized.replace(/<(iframe|embed|object|frame|frameset)\b[^>]*\/?>/gi, '');

    // 3. Remove inline event handlers (e.g. onload, onerror, onclick)
    sanitized = sanitized.replace(/\s+on[a-zA-Z]+\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi, '');

    // 4. Remove javascript: pseudo-protocol URIs
    sanitized = sanitized.replace(/(href|src|action|formaction|data)\s*=\s*(?:["']\s*javascript:[^"']*["']|javascript:[^\s>]+)/gi, '$1="#"');

    return sanitized;
  }

  /**
   * Render template with detailed report of rendered content and missing required tags.
   * Syntax supported:
   * 1. {{key | "default_value"}} or {{key}}
   * 2. {{#if key}} content {{/if}} or {{#if key}} content {{else}} fallback {{/if}}
   *
   * Values substituted into HTML content are HTML-escaped by default (MKT-12).
   * Missing tags without author fallback are captured in missingTags (MKT-05).
   */
  static renderDetailed(
    content: string,
    context: MergeContext = {},
    options: RenderOptions = { escapeHtml: true }
  ): DetailedRenderResult {
    if (!content) return { rendered: '', missingTags: [] };

    let output = content;
    const shouldEscape = options.escapeHtml !== false;

    // 1. Process conditional blocks: {{#if condition}}...{{else}}...{{/if}}
    const ifElseRegex = /\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    output = output.replace(ifElseRegex, (_, key, truthyVal, falsyVal) => {
      const val = context[key];
      return val && val !== 'false' && val !== 0 ? truthyVal : falsyVal;
    });

    // 2. Process simple conditional blocks: {{#if condition}}...{{/if}}
    const ifRegex = /\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    output = output.replace(ifRegex, (_, key, truthyVal) => {
      const val = context[key];
      return val && val !== 'false' && val !== 0 ? truthyVal : '';
    });

    // 3. Process merge tags with fallback: {{key | "fallback"}}
    const fallbackRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\|\s*["']([^"']*)["']\s*\}\}/g;
    output = output.replace(fallbackRegex, (_, key, fallback) => {
      const val = context[key];
      const hasVal = val !== undefined && val !== null && String(val).trim() !== '';
      const finalVal = hasVal ? String(val) : fallback;
      return shouldEscape ? escapeHtml(finalVal) : finalVal;
    });

    // 4. Process standard merge tags: {{key}}
    const missingSet = new Set<string>();
    const tagRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    output = output.replace(tagRegex, (_, key) => {
      const val = context[key];
      const hasVal = val !== undefined && val !== null && String(val).trim() !== '';
      if (!hasVal) {
        missingSet.add(key);
        return '';
      }
      return shouldEscape ? escapeHtml(val) : String(val);
    });

    return {
      rendered: output,
      missingTags: Array.from(missingSet),
    };
  }

  /**
   * Render HTML or plain text with merge tag resolution and conditional blocks.
   */
  static render(
    content: string,
    context: MergeContext = {},
    options: RenderOptions = {}
  ): string {
    return this.renderDetailed(content, context, options).rendered;
  }

  /**
   * Append mandatory compliance footer containing physical postal address and working unsubscribe link (MKT-06).
   */
  static appendComplianceFooter(
    html: string,
    params: {
      unsubscribeUrl: string;
      postalAddress: string;
      tenantName?: string;
    }
  ): string {
    const { unsubscribeUrl, postalAddress, tenantName } = params;
    const name = tenantName || 'Our Organization';

    const footerHtml = `
<div class="system-compliance-footer" style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #64748b; text-align: center;">
  <p style="margin: 0 0 6px 0;">
    Sent by <strong>${escapeHtml(name)}</strong><br />
    ${escapeHtml(postalAddress)}
  </p>
  <p style="margin: 0;">
    If you no longer wish to receive these emails, you can <a href="${escapeHtml(unsubscribeUrl)}" style="color: #475569; text-decoration: underline;">unsubscribe here</a>.
  </p>
</div>`;

    if (!html) return footerHtml.trim();

    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${footerHtml}\n</body>`);
    }

    return `${html}\n${footerHtml}`;
  }

  /**
   * Convert responsive HTML into clean, formatted plain text.
   * Standard library regex approach without external bloat.
   */
  static htmlToPlainText(html: string): string {
    if (!html) return '';

    let text = html;

    // Strip script and style blocks
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    // Replace line break tags
    text = text.replace(/<br\s*[\/]?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    text = text.replace(/<\/tr>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');

    // Convert links: <a href="url">text</a> -> text (url)
    text = text.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)');

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode standard HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Clean up excessive whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s+\n/g, '\n\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  /**
   * Run pre-send deliverability and safety checklist
   */
  static validatePreSend(params: {
    subject: string;
    htmlBody: string;
    senderEmail?: string;
  }): {
    passed: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const { subject, htmlBody, senderEmail } = params;

    if (!subject || !subject.trim()) {
      errors.push('Subject line is required.');
    } else if (subject.length > 100) {
      warnings.push('Subject line is over 100 characters. Shorter subject lines (30-50 chars) have higher open rates.');
    }

    if (!htmlBody || !htmlBody.trim()) {
      errors.push('Email body cannot be empty.');
    }

    // Check for unsubscribe link or placeholder
    const lowerBody = (htmlBody || '').toLowerCase();
    const hasUnsubscribe =
      lowerBody.includes('unsubscribe') ||
      lowerBody.includes('{{unsubscribe_url}}') ||
      lowerBody.includes('opt-out');

    if (!hasUnsubscribe) {
      errors.push('Missing mandatory Unsubscribe link or {{unsubscribe_url}} tag in body (CAN-SPAM / GDPR violation).');
    }

    // Check for sender address requirement
    const hasAddress =
      lowerBody.includes('{{sender_address}}') ||
      lowerBody.includes('address') ||
      lowerBody.includes('suite') ||
      lowerBody.includes('street') ||
      lowerBody.includes('p.o. box');

    if (!hasAddress) {
      warnings.push('Recommended: Include physical postal address or {{sender_address}} in footer for CAN-SPAM compliance.');
    }

    // Check spam trigger words in subject
    const spamWords = ['100% free', 'make money fast', 'act now!!!', 'risk free', 'winner!!!', 'earn $$$'];
    const lowerSubject = (subject || '').toLowerCase();
    for (const word of spamWords) {
      if (lowerSubject.includes(word)) {
        warnings.push(`Spam alert: Subject line contains potential spam trigger phrase "${word}".`);
      }
    }

    // Check broken or empty hrefs
    const emptyHrefRegex = /href=["'](#|javascript:void\(0\)|)["']/gi;
    if (emptyHrefRegex.test(htmlBody || '')) {
      warnings.push('Email contains empty or placeholder links (href="#" or empty).');
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }
}
