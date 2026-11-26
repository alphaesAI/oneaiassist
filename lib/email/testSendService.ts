import { prisma } from '@/lib/db';
import { EmailTemplateEngine } from '@/lib/email/templateEngine';
import { ProviderFactory } from '@/lib/email/ProviderFactory';
import { EmailSuppressionService } from '@/lib/email/suppression';
import type { IEmailProviderAdapter } from '@/lib/email/types';

export interface TestSendParams {
  tenantId: string;
  recipientEmail: string;
  subject?: string;
  htmlBody?: string;
  previewText?: string;
  templateId?: string;
  appOrigin?: string;
  adapterOverride?: IEmailProviderAdapter;
}

export interface TestSendResult {
  success: boolean;
  status: string;
  error?: string;
  suppressed?: boolean;
  reason?: string;
  messageId?: string;
  preSendCheck?: {
    passed: boolean;
    errors: string[];
    warnings: string[];
  };
  httpStatus: number;
}

export class TestSendService {
  /**
   * Dispatches a test marketing email while strictly enforcing suppression, domain verification,
   * compliance footers, and avoiding fake placeholder data.
   */
  static async executeTestSend(params: TestSendParams): Promise<TestSendResult> {
    const {
      tenantId,
      recipientEmail,
      subject,
      htmlBody,
      templateId,
      appOrigin = 'http://localhost:3000',
      adapterOverride,
    } = params;

    if (!recipientEmail || !recipientEmail.includes('@')) {
      return {
        success: false,
        status: 'INVALID_RECIPIENT',
        error: 'Valid recipient email address is required.',
        httpStatus: 400,
      };
    }

    const cleanEmail = recipientEmail.trim().toLowerCase();

    // 1. Suppression check (E6 & MKT-16 requirement: test sends must respect suppression)
    const suppression = await EmailSuppressionService.isEmailSuppressed(tenantId, cleanEmail);
    if (suppression.suppressed) {
      return {
        success: false,
        status: 'SUPPRESSED',
        suppressed: true,
        reason: suppression.reason,
        error: `Recipient email "${cleanEmail}" is suppressed (${suppression.reason}). Test emails cannot be sent to suppressed addresses.`,
        httpStatus: 400,
      };
    }

    let finalSubject = subject;
    let finalHtml = htmlBody;

    // Load template if templateId provided
    if (templateId) {
      const template = await prisma.template.findUnique({
        where: { id: templateId, tenantId },
      });
      if (!template) {
        return {
          success: false,
          status: 'NOT_FOUND',
          error: 'Template not found',
          httpStatus: 404,
        };
      }
      finalSubject = finalSubject || template.subject || template.name;
      finalHtml = finalHtml || template.htmlBody || template.body;
    }

    if (!finalSubject || !finalHtml) {
      return {
        success: false,
        status: 'INVALID_INPUT',
        error: 'Email subject and HTML body content are required.',
        httpStatus: 400,
      };
    }

    // 2. Resolve active tenant email config
    const emailConfig = await prisma.tenantEmailConfig.findUnique({
      where: { tenantId },
    });

    if (!emailConfig || !emailConfig.encryptedApiKey) {
      return {
        success: false,
        status: 'UNCONFIGURED_PROVIDER',
        error: 'Email channel is not configured. Please add provider credentials under Settings > Channels > Email Marketing first.',
        httpStatus: 400,
      };
    }

    // 3. Sender domain verification check (E4 requirement)
    const fromEmail = (emailConfig.fromEmail || '').trim().toLowerCase();
    const domain = fromEmail.includes('@') ? fromEmail.split('@')[1] : '';

    const verifiedDomain = await prisma.tenantSendingDomain.findFirst({
      where: {
        tenantId,
        domain: { equals: domain, mode: 'insensitive' },
        status: 'VERIFIED',
      },
    });

    if (!verifiedDomain) {
      return {
        success: false,
        status: 'UNVERIFIED_DOMAIN',
        error: `From address domain "${domain || 'unknown'}" is not a verified sending domain for this organization. Please add and verify this sending domain under Settings > Email Domains.`,
        httpStatus: 400,
      };
    }

    // 4. Run Pre-Send Deliverability Checklist
    const preSendCheck = EmailTemplateEngine.validatePreSend({
      subject: finalSubject,
      htmlBody: finalHtml,
      senderEmail: fromEmail,
    });

    // 5. Look up real contact if present in DB (no invented placeholder data per Section 0 rules)
    const customer = await prisma.customer.findFirst({
      where: { tenantId, email: cleanEmail },
      include: { activePolicy: true },
    });

    const context: Record<string, string | null> = {
      first_name: customer?.displayName ? customer.displayName.split(' ')[0] : null,
      last_name: customer?.displayName ? customer.displayName.split(' ').slice(1).join(' ') : null,
      name: customer?.displayName || null,
      email: cleanEmail,
      policy_number: customer?.activePolicy?.policyNumber || null,
      company: null,
    };

    const renderedSubjectResult = EmailTemplateEngine.renderDetailed(finalSubject, context);
    const renderedHtmlResult = EmailTemplateEngine.renderDetailed(finalHtml, context);

    const renderedSubject = `[TEST SEND] ${renderedSubjectResult.rendered}`;

    // 6. Append mandatory compliance footer (address + working unsubscribe link)
    const unsubscribeUrl = `${appOrigin}/api/channels/email/unsubscribe?email=${encodeURIComponent(cleanEmail)}&tenantId=${encodeURIComponent(tenantId)}`;
    const postalAddress = emailConfig.postalAddress || '';

    const completedHtml = EmailTemplateEngine.appendComplianceFooter(
      renderedHtmlResult.rendered,
      {
        postalAddress,
        unsubscribeUrl,
      }
    );
    const plainText = EmailTemplateEngine.htmlToPlainText(completedHtml);

    // 7. Dispatch via Provider
    let sendResult;
    if (adapterOverride) {
      sendResult = await adapterOverride.send({
        from: `${emailConfig.fromName || 'OneAI Support'} <${emailConfig.fromEmail}>`,
        to: cleanEmail,
        subject: renderedSubject,
        html: completedHtml,
        text: plainText,
        replyTo: emailConfig.replyToEmail || undefined,
        headers: {
          'X-OneAI-Test-Send': 'true',
        },
      }, {
        apiKey: 'fake',
        fromEmail: emailConfig.fromEmail,
        fromName: emailConfig.fromName,
      });
    } else {
      const { adapter, creds } = await ProviderFactory.getTenantCredentials(tenantId);
      const fromAddress = `${creds.fromName || 'OneAI Support'} <${creds.fromEmail}>`;

      sendResult = await adapter.send({
        from: fromAddress,
        to: cleanEmail,
        subject: renderedSubject,
        html: completedHtml,
        text: plainText,
        replyTo: emailConfig.replyToEmail || undefined,
        headers: {
          'X-OneAI-Test-Send': 'true',
        },
      }, creds);
    }

    if (sendResult.status !== 'SENT') {
      return {
        success: false,
        status: sendResult.status,
        error: sendResult.error || 'Failed to dispatch test email via provider',
        preSendCheck,
        httpStatus: 400,
      };
    }

    return {
      success: true,
      status: 'SENT',
      messageId: sendResult.messageId,
      preSendCheck,
      httpStatus: 200,
    };
  }
}
