import { IMessageTransport, SendResult } from './IMessageTransport';
import { sessions, qrCodes } from '../engine-logic';
import { openwaSessions, openwaQrCodes } from '../openwa-logic';
import { getTenantPrisma } from '../../lib/db/index';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

function toJid(to: string): string {
  return to.includes('@') ? to : `${to.replace(/[^\d]/g, '')}@s.whatsapp.net`;
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
