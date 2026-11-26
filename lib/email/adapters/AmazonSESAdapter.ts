import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult, DomainStatusResult } from '../types';

export class AmazonSESAdapter implements IEmailProviderAdapter {
  readonly providerName = 'SES';

  async send(email: OutboundEmail, creds: EmailProviderCredentials): Promise<EmailSendResult> {
    if (!creds.apiKey) {
      return { messageId: '', status: 'FAILED', error: 'Amazon SES API credentials missing', retryable: false };
    }

    // In production, uses AWS SES API
    try {
      const endpoint = `https://email.us-east-1.amazonaws.com/v2/email/outbound-emails`;
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'Content-Type': 'application/json',
          'X-Amz-Security-Token': creds.apiKey,
        },
        body: JSON.stringify({
          FromEmailAddress: `"${creds.fromName}" <${creds.fromEmail}>`,
          Destination: { ToAddresses: [email.to] },
          Content: {
            Simple: {
              Subject: { Data: email.subject },
              Body: { Html: { Data: email.html }, Text: { Data: email.text || '' } },
              // Carries List-Unsubscribe and List-Unsubscribe-Post (RFC 8058)
              ...(email.headers && Object.keys(email.headers).length > 0
                ? { Headers: Object.entries(email.headers).map(([Name, Value]) => ({ Name, Value })) }
                : {}),
            },
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      return {
        messageId: data.MessageId || `ses_${Date.now()}`,
        status: res.ok ? 'SENT' : 'FAILED',
        httpStatus: res.status,
        retryable: res.status === 429 || res.status >= 500,
        ...(res.ok ? {} : { error: data.message || `SES failed (${res.status})` }),
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
        { record: 'SPF', name: domain, type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', status: 'PENDING' },
        { record: 'DKIM', name: `ses._domainkey.${domain}`, type: 'CNAME', value: `${domain}.dkim.amazonses.com`, status: 'PENDING' },
        { record: 'DMARC', name: `_dmarc.${domain}`, type: 'TXT', value: 'v=DMARC1; p=none;', status: 'PENDING' },
      ],
    };
  }
}
