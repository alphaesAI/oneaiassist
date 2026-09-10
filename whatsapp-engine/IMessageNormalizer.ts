export interface CanonicalIMessage {
  messageId: string;
  sender: string;
  recipient: string;
  text: string;
  mediaUrl?: string;
  attachments?: Array<{ url: string; mimeType: string }>;
  timestamp?: string;
}

export class IMessageNormalizer {
  static normalize(payload: any): CanonicalIMessage | null {
    if (!payload) return null;

    const messageId = payload.id || payload.messageId || payload.guid || `imsg_${Date.now()}`;
    const sender = payload.from || payload.sender || payload.sender_id || payload.handle || '';
    const recipient = payload.to || payload.recipient || payload.receiver || '';
    const text = payload.text || payload.body || payload.message || payload.content || '';
    const mediaUrl = payload.mediaUrl || payload.attachment_url || payload.attachments?.[0]?.url || undefined;

    if (!sender && !text) return null;

    return {
      messageId,
      sender,
      recipient,
      text,
      mediaUrl,
      timestamp: payload.timestamp || new Date().toISOString(),
    };
  }
}
