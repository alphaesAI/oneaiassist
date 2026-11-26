import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult, DomainStatusResult } from '../types';

export class SendGridAdapter implements IEmailProviderAdapter {
  readonly providerName = 'SENDGRID';

  async send(email: OutboundEmail, creds: EmailProviderCredentials): Promise<EmailSendResult> {
    if (!creds.apiKey || creds.apiKey.startsWith('mock_')) {
      console.log(`[SendGridAdapter] Mock dispatch to ${email.to}`);
      return { messageId: `sg_mock_${Date.now()}`, status: 'SENT' };
    }

    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email.to }] }],
          from: { email: creds.fromEmail, name: creds.fromName },
          subject: email.subject,
          ...(email.replyTo ? { reply_to: { email: email.replyTo } } : {}),
          // Carries List-Unsubscribe and List-Unsubscribe-Post (RFC 8058)
          ...(email.headers && Object.keys(email.headers).length > 0 ? { headers: email.headers } : {}),
          content: [
            // SendGrid requires text/plain to come before text/html
            ...(email.text ? [{ type: 'text/plain', value: email.text }] : []),
            { type: 'text/html', value: email.html },
          ],
        }),
      });

      const messageId = res.headers.get('x-message-id') || `sg_${Date.now()}`;
      return {
        messageId,
        status: res.ok ? 'SENT' : 'FAILED',
        httpStatus: res.status,
        retryable: res.status === 429 || res.status >= 500,
        ...(res.ok ? {} : { error: `SendGrid failed (${res.status})` }),
      };
    } catch (err: any) {
      return { messageId: '', status: 'FAILED', error: err.message, retryable: true };
    }
  }

  async verifyDomain(domain: string, _creds: EmailProviderCredentials): Promise<DomainStatusResult> {
    return {
      domain,
      status: 'PENDING',
      records: [
        { record: 'SPF', name: domain, type: 'TXT', value: 'v=spf1 include:sendgrid.net ~all', status: 'PENDING' },
        { record: 'DKIM', name: `s1._domainkey.${domain}`, type: 'CNAME', value: `s1.domainkey.sendgrid.net`, status: 'PENDING' },
        { record: 'DMARC', name: `_dmarc.${domain}`, type: 'TXT', value: 'v=DMARC1; p=none;', status: 'PENDING' },
      ],
    };
  }
}
