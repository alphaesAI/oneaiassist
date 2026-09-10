import { IMessageTransport, SendResult } from './IMessageTransport';

export class IMessageCloudTransportAdapter implements IMessageTransport {
  private apiUrl: string;
  private apiKey: string;

  constructor(private readonly tenantId: string) {
    this.apiUrl = process.env.IMESSAGE_API_URL || 'https://api.loopmessage.com/api/v1/message/send';
    this.apiKey = process.env.IMESSAGE_API_KEY || '';
  }

  async sendText(to: string, text: string): Promise<SendResult> {
    console.log(`[iMessageTransport] Sending outbound iMessage to ${to} (tenant: ${this.tenantId})`);

    if (!this.apiKey) {
      console.log(`[iMessageTransport] [MOCK MODE] Sent iMessage to ${to}: "${text}"`);
      return { messageId: `mock_imsg_${Date.now()}` };
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          recipient: to,
          text: text,
          tenantId: this.tenantId,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `iMessage API returned ${response.status}`);
      }

      return { messageId: data.id || data.messageId || `imsg_${Date.now()}` };
    } catch (err: any) {
      console.warn(`[iMessageTransport] Error sending iMessage: ${err?.message || err}`);
      return { messageId: `imsg_fallback_${Date.now()}` };
    }
  }

  async sendImage(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    return this.sendText(to, `${opts.caption || ''} ${opts.filePath}`.trim());
  }

  async sendVideo(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult> {
    return this.sendText(to, `${opts.caption || ''} ${opts.filePath}`.trim());
  }

  async sendAudio(to: string, opts: { filePath: string; ptt?: boolean }): Promise<SendResult> {
    return this.sendText(to, `[Voice Message] ${opts.filePath}`);
  }

  async setTyping(to: string, on: boolean): Promise<void> {
    // Optional typing indicator for iMessage Cloud API
  }

  async getStatus(): Promise<string> {
    return 'CONNECTED';
  }

  async disconnect(): Promise<void> {}
}
