import { IMessageTransport, SendResult } from './IMessageTransport';
import { sessions, qrCodes } from '../engine-logic';
import { openwaSessions, openwaQrCodes } from '../openwa-logic';
import { MetaCloudTransportAdapter } from './MetaCloudTransportAdapter';
import { getTenantPrisma } from '../../lib/db/index';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

export function toJid(to: string): string {
  if (to.includes('@')) return to;
  let digits = to.replace(/[^\d]/g, '');
  // Auto-prefix 10-digit Indian mobile numbers (starting with 6,7,8,9) with country code '91'
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    digits = `91${digits}`;
  } else if (digits.length === 10) {
    digits = `1${digits}`;
  }
  return `${digits}@s.whatsapp.net`;
}

export class BaileysTransportAdapter implements IMessageTransport {
  constructor(private readonly tenantId: string) {}

  private get sock() {
    const s = sessions.get(this.tenantId);
    if (!s) throw new Error('WhatsApp session is not active for this tenant.');
    return s;
  }

  async sendText(to: string, text: string): Promise<SendResult> {
    const jid = toJid(to);
    const sent = await this.sock.sendMessage(jid, { text });
    return { messageId: sent?.key.id ?? '' };
  }

  async sendImage(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    const jid = toJid(to);
    const sent = await this.sock.sendMessage(jid, {
      image: { url: opts.filePath },
      caption: opts.caption,
    });
    return { messageId: sent?.key.id ?? '' };
  }

  async sendVideo(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    const jid = toJid(to);
    const sent = await this.sock.sendMessage(jid, {
      video: { url: opts.filePath },
      caption: opts.caption,
    });
    return { messageId: sent?.key.id ?? '' };
  }

  async sendAudio(to: string, opts: { filePath: string; ptt?: boolean }): Promise<SendResult> {
    const jid = toJid(to);
    const sent = await this.sock.sendMessage(jid, {
      audio: { url: opts.filePath },
      mimetype: 'audio/ogg; codecs=opus',
      ptt: opts.ptt ?? true,
    });
    return { messageId: sent?.key.id ?? '' };
  }

  async setTyping(to: string, on: boolean): Promise<void> {
    try {
      await this.sock.sendPresenceUpdate(on ? 'composing' : 'paused', toJid(to));
    } catch {}
  }

  async getStatus(): Promise<string> {
    const db = getTenantPrisma(this.tenantId, 'ADMIN');
    const session = await db.whatsAppNumber.findUnique({ where: { tenantId: this.tenantId } });
    return session?.status ?? 'DISCONNECTED';
  }

  async disconnect(): Promise<void> {
    try {
      await this.sock.logout();
    } catch {}
    sessions.delete(this.tenantId);
    qrCodes.delete(this.tenantId);
  }
}

export class OpenWATransportAdapter implements IMessageTransport {
  constructor(private readonly tenantId: string) {}

  private get client() {
    const c = openwaSessions.get(this.tenantId);
    if (!c) throw new Error('OpenWA session is not active for this tenant.');
    return c;
  }

  async sendText(to: string, text: string): Promise<SendResult> {
    const jid = toJid(to);
    const res = await this.client.sendText(jid, text);
    return { messageId: typeof res === 'string' ? res : res?.toString() ?? '' };
  }

  async sendImage(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    const jid = toJid(to);
    // OpenWA sendImage takes: to, filePath, filename, caption
    const res = await this.client.sendImage(jid, opts.filePath, 'image', opts.caption ?? '');
    return { messageId: typeof res === 'string' ? res : '' };
  }

  async sendVideo(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    const jid = toJid(to);
    const res = await this.client.sendVideo(jid, opts.filePath, 'video', opts.caption ?? '');
    return { messageId: typeof res === 'string' ? res : '' };
  }

  async sendAudio(to: string, opts: { filePath: string; ptt?: boolean }): Promise<SendResult> {
    const jid = toJid(to);
    const res = await this.client.sendPtt(jid, opts.filePath);
    return { messageId: typeof res === 'string' ? res : '' };
  }

  async setTyping(to: string, on: boolean): Promise<void> {
    const jid = toJid(to);
    if (on) {
      await this.client.simulateTyping(jid, true);
    } else {
      await this.client.simulateTyping(jid, false);
    }
  }

  async getStatus(): Promise<string> {
    const db = getTenantPrisma(this.tenantId, 'ADMIN');
    const session = await db.whatsAppNumber.findUnique({ where: { tenantId: this.tenantId } });
    return session?.status ?? 'DISCONNECTED';
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.kill();
    } catch {}
    openwaSessions.delete(this.tenantId);
    openwaQrCodes.delete(this.tenantId);
  }
}

export class TransportManager {
  private static instances = new Map<string, IMessageTransport>();

  static async getTransportAsync(tenantId: string): Promise<IMessageTransport> {
    let transport = this.instances.get(tenantId);
    if (!transport) {
      const db = getTenantPrisma(tenantId, 'ADMIN');
      const number = await db.whatsAppNumber.findUnique({ where: { tenantId } });

      if (number?.provider === 'META_CLOUD_API') {
        transport = new MetaCloudTransportAdapter(tenantId);
      } else if (process.env.WA_ENGINE === 'OPENWA' || openwaSessions.has(tenantId)) {
        transport = new OpenWATransportAdapter(tenantId);
      } else {
        transport = new BaileysTransportAdapter(tenantId);
      }
      this.instances.set(tenantId, transport);
    }
    return transport;
  }

  static getTransport(tenantId: string): IMessageTransport {
    let transport = this.instances.get(tenantId);
    if (!transport) {
      const isOpenWA = process.env.WA_ENGINE === 'OPENWA' || openwaSessions.has(tenantId);
      if (isOpenWA) {
        transport = new OpenWATransportAdapter(tenantId);
      } else {
        transport = new BaileysTransportAdapter(tenantId);
      }
      this.instances.set(tenantId, transport);
    }
    return transport;
  }

  static destroyTransport(tenantId: string) {
    this.instances.delete(tenantId);
  }
}
