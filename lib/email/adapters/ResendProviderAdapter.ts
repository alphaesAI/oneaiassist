import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult, DomainStatusResult, DnsRecordItem } from '../types';

export class ResendProviderAdapter implements IEmailProviderAdapter {
  readonly providerName = 'RESEND';

  async send(email: OutboundEmail, creds: EmailProviderCredentials): Promise<EmailSendResult> {
    let fromEmail = creds.fromEmail || 'onboarding@resend.dev';
    const fromName = creds.fromName || 'OneAI Support';
    const isFreeMail = /@(gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|icloud\.com)$/i.test(fromEmail);
    if (isFreeMail) {
      fromEmail = 'onboarding@resend.dev';
    }

    const sender = email.from && !/@(gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|icloud\.com)/i.test(email.from)
      ? email.from
      : `"${fromName}" <${fromEmail}>`;
    const replyTo = email.replyTo || creds.replyToEmail || creds.fromEmail || undefined;

    // Resend REST API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        reply_to: replyTo,
        headers: email.headers,
        tags: email.tags,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.message || `Resend API failed with status ${res.status}`;
      return { messageId: '', status: 'FAILED', error: errMsg };
    }

    return {
      messageId: data.id || '',
      status: 'SENT',
    };
  }

  private assertValidApiKey(creds: EmailProviderCredentials) {
    if (!creds.apiKey || creds.apiKey === 'mock_email_key') {
      throw new Error('Resend API Key is not configured. Save a Full Access Resend API key in Email Provider Configuration first.');
    }
  }

  private async findDomainByName(domain: string, apiKey: string): Promise<any | null> {
    const listRes = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const listData = await listRes.json().catch(() => ({}));
    if (!listRes.ok) {
      throw new Error(listData.message || `Resend API failed (${listRes.status}) while listing domains. Ensure your API key has Full Access.`);
    }
    return Array.isArray(listData.data)
      ? listData.data.find((d: any) => d.name?.toLowerCase() === domain.toLowerCase()) || null
      : null;
  }

  async registerDomain(domain: string, creds: EmailProviderCredentials): Promise<DomainStatusResult> {
    this.assertValidApiKey(creds);

    const res = await fetch('https://api.resend.com/domains', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({ name: domain }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // If domain already exists in this Resend account, fetch its full record set
      if (res.status === 409 || /already/i.test(data.message || '')) {
        const existing = await this.findDomainByName(domain, creds.apiKey);
        if (existing?.id) {
          const getRes = await fetch(`https://api.resend.com/domains/${existing.id}`, {
            headers: { Authorization: `Bearer ${creds.apiKey}` },
          });
          const domainDetails = await getRes.json().catch(() => ({}));
          if (!getRes.ok) {
            throw new Error(domainDetails.message || `Resend failed to fetch domain (${getRes.status})`);
          }
          return this.parseResendDomain(domain, domainDetails);
        }
      }
      throw new Error(data.message || `Resend domain registration failed (${res.status}). Ensure your API key has Full Access.`);
    }

    return this.parseResendDomain(domain, data);
  }

  async verifyDomain(domain: string, creds: EmailProviderCredentials): Promise<DomainStatusResult> {
    this.assertValidApiKey(creds);

    // 1. Fetch domain list to find domain id
    const found = await this.findDomainByName(domain, creds.apiKey);

    if (!found?.id) {
      // If not yet registered with Resend, register it
      return this.registerDomain(domain, creds);
    }

    // 2. Trigger verify on domain
    const verifyRes = await fetch(`https://api.resend.com/domains/${found.id}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      throw new Error(verifyData.message || `Resend verify failed (${verifyRes.status})`);
    }

    // Resend performs DNS checks asynchronously; brief pause improves immediate status accuracy
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 3. Get updated domain details
    const getRes = await fetch(`https://api.resend.com/domains/${found.id}`, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    const domainDetails = await getRes.json().catch(() => ({}));
    if (!getRes.ok) {
      throw new Error(domainDetails.message || `Resend failed to fetch domain status (${getRes.status})`);
    }

    return this.parseResendDomain(domain, domainDetails);
  }

  private parseResendDomain(domain: string, data: any): DomainStatusResult {
    const records: DnsRecordItem[] = [];
    const domainStatus = (data.status || '').toLowerCase();
    const mappedStatus: DomainStatusResult['status'] =
      domainStatus === 'verified' ? 'VERIFIED' : domainStatus === 'failed' ? 'FAILED' : 'PENDING';

    if (Array.isArray(data.records)) {
      for (const r of data.records) {
        const recStatus = (r.status || '').toLowerCase();
        records.push({
          record: (r.record || 'TXT').toUpperCase() as any,
          name: r.name || domain,
          type: (r.type || 'TXT').toUpperCase(),
          value: r.value || '',
          status: recStatus === 'verified' ? 'VERIFIED' : recStatus === 'failed' ? 'FAILED' : 'PENDING',
          ttl: r.ttl?.toString() || 'Auto',
          ...(typeof r.priority === 'number' ? { priority: r.priority } : {}),
        });
      }
    }

    return {
      domain,
      status: mappedStatus,
      records,
    };
  }
}
