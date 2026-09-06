import { IMessageTransport, SendResult } from './IMessageTransport';
import { getTenantPrisma } from '../../lib/db/index';
import { toJid } from './TransportManager';

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

export interface MetaSendMediaOptions {
  filePath?: string;
  link?: string;
  caption?: string;
  filename?: string;
  contextMessageId?: string;
}

export class MetaCloudTransportAdapter implements IMessageTransport {
  constructor(private readonly tenantId: string) {}

  private async getCredentials() {
    const db = getTenantPrisma(this.tenantId, 'ADMIN');
    const number = await db.whatsAppNumber.findUnique({
      where: { tenantId: this.tenantId },
    });

    if (!number || !number.metaPhoneNumberId || !number.metaAccessToken) {
      throw new Error(`Meta Cloud API credentials not configured for tenant ${this.tenantId}.`);
    }

    return {
      phoneNumberId: number.metaPhoneNumberId,
      accessToken: number.metaAccessToken,
    };
  }

  private async postJson(path: string, body: any): Promise<any> {
    const { phoneNumberId, accessToken } = await this.getCredentials();
    const endpoint = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(phoneNumberId)}/${path}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}

    if (!res.ok) {
      const errMsg = parsed?.error?.message || text.slice(0, 300) || `HTTP ${res.status}`;
      throw new Error(`Meta Cloud API ${res.status}: ${errMsg}`);
    }

    return parsed;
  }

  async sendText(to: string, text: string, contextMessageId?: string): Promise<SendResult> {
    const digits = to.replace(/[^\d]/g, '');
    const res = await this.postJson('messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'text',
      text: { body: text, preview_url: false },
      ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
    });

    const messageId = res?.messages?.[0]?.id || '';
    return { messageId };
  }

  async sendImage(to: string, opts: MetaSendMediaOptions): Promise<SendResult> {
    const digits = to.replace(/[^\d]/g, '');
    const imagePayload: any = opts.link ? { link: opts.link } : { id: opts.filePath };
    if (opts.caption) imagePayload.caption = opts.caption;

    const res = await this.postJson('messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'image',
      image: imagePayload,
      ...(opts.contextMessageId ? { context: { message_id: opts.contextMessageId } } : {}),
    });

    return { messageId: res?.messages?.[0]?.id || '' };
  }

  async sendVideo(to: string, opts: MetaSendMediaOptions): Promise<SendResult> {
    const digits = to.replace(/[^\d]/g, '');
    const videoPayload: any = opts.link ? { link: opts.link } : { id: opts.filePath };
    if (opts.caption) videoPayload.caption = opts.caption;

    const res = await this.postJson('messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'video',
      video: videoPayload,
      ...(opts.contextMessageId ? { context: { message_id: opts.contextMessageId } } : {}),
    });

    return { messageId: res?.messages?.[0]?.id || '' };
  }

  async sendAudio(to: string, opts: MetaSendMediaOptions): Promise<SendResult> {
    const digits = to.replace(/[^\d]/g, '');
    const audioPayload: any = opts.link ? { link: opts.link } : { id: opts.filePath };

    const res = await this.postJson('messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'audio',
      audio: audioPayload,
      ...(opts.contextMessageId ? { context: { message_id: opts.contextMessageId } } : {}),
    });

    return { messageId: res?.messages?.[0]?.id || '' };
  }

  async sendTemplate(to: string, templateName: string, languageCode = 'en', components: any[] = []): Promise<SendResult> {
    const digits = to.replace(/[^\d]/g, '');
    const res = await this.postJson('messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });

    return { messageId: res?.messages?.[0]?.id || '' };
  }

  async setTyping(to: string, on: boolean): Promise<void> {
    // Meta Cloud API sends read receipt or typing presence if needed
    return;
  }

  async getStatus(): Promise<string> {
    const db = getTenantPrisma(this.tenantId, 'ADMIN');
    const session = await db.whatsAppNumber.findUnique({ where: { tenantId: this.tenantId } });
    return session?.status ?? 'DISCONNECTED';
  }

  async disconnect(): Promise<void> {
    const db = getTenantPrisma(this.tenantId, 'ADMIN');
    await db.whatsAppNumber.update({
      where: { tenantId: this.tenantId },
      data: { status: 'DISCONNECTED' },
    });
  }
}
