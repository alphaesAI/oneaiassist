import { getTenantPrisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { IEmailProviderAdapter, EmailProviderCredentials } from './types';
import { ResendProviderAdapter } from './adapters/ResendProviderAdapter';
import { AmazonSESAdapter } from './adapters/AmazonSESAdapter';
import { SendGridAdapter } from './adapters/SendGridAdapter';
import { SmtpProviderAdapter } from './adapters/SmtpProviderAdapter';

export class ProviderFactory {
  private static resendAdapter = new ResendProviderAdapter();
  private static sesAdapter = new AmazonSESAdapter();
  private static sendGridAdapter = new SendGridAdapter();
  private static smtpAdapter = new SmtpProviderAdapter();

  static getAdapter(providerName: string = 'RESEND'): IEmailProviderAdapter {
    const normalized = providerName.toUpperCase();
    if (normalized === 'SES' || normalized === 'AMAZON_SES') return this.sesAdapter;
    if (normalized === 'SENDGRID') return this.sendGridAdapter;
    if (normalized === 'SMTP') return this.smtpAdapter;
    return this.resendAdapter;
  }

  static async getTenantCredentials(tenantId: string): Promise<{ adapter: IEmailProviderAdapter; creds: EmailProviderCredentials; config: any }> {
    const db = getTenantPrisma(tenantId, 'ADMIN');
    const config = await db.tenantEmailConfig.findUnique({
      where: { tenantId },
    });

    if (!config || !config.encryptedApiKey) {
      throw new Error('Tenant has no email provider configured. Please configure an email provider in Settings > Email.');
    }


    // The key is always stored encrypted. A value that cannot be decrypted is never used as-is:
    // that would let a plain-text key sit in the database, and would hide a wrong ENCRYPTION_KEY.
    let apiKey: string;
    try {
      apiKey = decrypt(config.encryptedApiKey);
    } catch {
      throw new Error(
        'The saved email provider API key could not be read. Please enter the API key again in Settings > Email.'
      );
    }

    const adapter = this.getAdapter(config.provider);
    return {
      adapter,
      creds: {
        apiKey,
        fromName: config.fromName,
        fromEmail: config.fromEmail,
        replyToEmail: config.replyToEmail,
      },
      config,
    };
  }
}
