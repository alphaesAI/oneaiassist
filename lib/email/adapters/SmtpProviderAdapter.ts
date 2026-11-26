import { IEmailProviderAdapter, OutboundEmail, EmailProviderCredentials, EmailSendResult, DomainStatusResult } from '../types';

export class SmtpProviderAdapter implements IEmailProviderAdapter {
  readonly providerName = 'SMTP';

  async send(_email: OutboundEmail, _creds: EmailProviderCredentials): Promise<EmailSendResult> {
    return {
      messageId: '',
      status: 'FAILED',
      error: 'SMTP transport is not enabled. Please select Resend in Settings → Email Provider Configuration.',
    };
  }

  async verifyDomain(_domain: string, _creds: EmailProviderCredentials): Promise<DomainStatusResult> {
    throw new Error('Domain verification is not supported for SMTP. Please select Resend in Settings.');
  }
}
