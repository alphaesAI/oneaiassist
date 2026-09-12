import { IMessageTransport, SendResult } from './IMessageTransport';
import { prisma } from '../../lib/db/index';
import { decrypt } from '../../lib/encryption';

export class InstagramCloudTransportAdapter implements IMessageTransport {
  constructor(private readonly tenantId: string) {}

  async sendText(to: string, text: string): Promise<SendResult> {
    console.log(`[InstagramTransport] Sending outbound Instagram DM to user ${to} (tenant: ${this.tenantId})`);

    // 1. Fetch connected InstagramAccount for this tenant
    const account = await prisma.instagramAccount.findUnique({
      where: { tenantId: this.tenantId },
    });

    if (!account || !account.pageAccessToken) {
      console.warn(`[InstagramTransport] [MOCK MODE] No active Instagram account for tenant ${this.tenantId}. Mocking delivery.`);
      return { messageId: `mock_ig_${Date.now()}` };
    }

    let accessToken = account.pageAccessToken;
    try {
      accessToken = decrypt(accessToken);
    } catch {
      // If token is already decrypted or raw
    }

    // 2. Call Meta Graph API v21.0
    const url = 'https://graph.facebook.com/v21.0/me/messages';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: to },
          messaging_type: 'RESPONSE',
          message: { text },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`[InstagramTransport] Meta Graph API error:`, data);
        throw new Error(data.error?.message || `Instagram API error ${res.status}`);
      }

      console.log(`[InstagramTransport] Message sent successfully. Meta mid: ${data.message_id}`);
      return { messageId: data.message_id || `ig_${Date.now()}` };
    } catch (err: any) {
      console.error(`[InstagramTransport] Error sending message:`, err?.message || err);
      return { messageId: `ig_fallback_${Date.now()}` };
    }
  }

  async sendImage(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    return this.sendText(to, `${opts.caption || ''} ${opts.filePath}`.trim());
  }

  async sendVideo(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    return this.sendText(to, `${opts.caption || ''} ${opts.filePath}`.trim());
  }

  async sendAudio(to: string, opts: { filePath: string; ptt?: boolean }): Promise<SendResult> {
    return this.sendText(to, `[Audio message] ${opts.filePath}`);
  }

  async setTyping(to: string, on: boolean): Promise<void> {
    // Meta Graph API typing indicators
  }

  async getStatus(): Promise<string> {
    const account = await prisma.instagramAccount.findUnique({
      where: { tenantId: this.tenantId },
    });
    return account ? account.status : 'DISCONNECTED';
  }

  async disconnect(): Promise<void> {
    await prisma.instagramAccount.deleteMany({
      where: { tenantId: this.tenantId },
    });
  }
}
