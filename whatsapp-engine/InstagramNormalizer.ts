export interface InstagramCanonicalMessage {
  messageId: string;
  instagramBusinessId: string;
  senderIgId: string;
  fromMe: boolean;
  text: string;
  mediaUrl?: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  timestamp?: string;
  quickReplyPayload?: string;
  postbackPayload?: string;
}

export interface InstagramReadReceipt {
  senderIgId: string;
  watermark: number;
}

export class InstagramNormalizer {
  static parsePayload(body: any): {
    messages: InstagramCanonicalMessage[];
    reads: InstagramReadReceipt[];
  } {
    const messages: InstagramCanonicalMessage[] = [];
    const reads: InstagramReadReceipt[] = [];

    if (!body || body.object !== 'instagram') {
      return { messages, reads };
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const businessId = entry.id || '';
      const messagingEvents = entry.messaging || [];

      for (const event of messagingEvents) {
        const senderId = event.sender?.id || '';
        const recipientId = event.recipient?.id || businessId;

        // 1. Inbound Direct Message
        if (event.message) {
          const msg = event.message;
          const messageId = msg.mid || `ig_${Date.now()}`;
          let text = msg.text || '';
          let mediaUrl: string | undefined = undefined;
          let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER' = 'TEXT';

          if (msg.attachments && msg.attachments.length > 0) {
            const firstAttachment = msg.attachments[0];
            mediaUrl = firstAttachment.payload?.url;
            const attType = firstAttachment.type;
            if (attType === 'image') messageType = 'IMAGE';
            else if (attType === 'video') messageType = 'VIDEO';
            else if (attType === 'audio') messageType = 'AUDIO';
            else messageType = 'OTHER';
          }

          if (msg.quick_reply?.payload) {
            text = text || msg.quick_reply.payload;
          }

          messages.push({
            messageId,
            instagramBusinessId: recipientId,
            senderIgId: senderId,
            fromMe: false,
            text,
            mediaUrl,
            messageType,
            timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
            quickReplyPayload: msg.quick_reply?.payload,
          });
        }

        // 2. Postback from button/template click
        if (event.postback) {
          const pb = event.postback;
          messages.push({
            messageId: pb.mid || `ig_pb_${Date.now()}`,
            instagramBusinessId: recipientId,
            senderIgId: senderId,
            fromMe: false,
            text: pb.title || pb.payload || 'Postback',
            messageType: 'TEXT',
            timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
            postbackPayload: pb.payload,
          });
        }

        // 3. Read Receipts
        if (event.read) {
          reads.push({
            senderIgId: senderId,
            watermark: event.read.watermark || Date.now(),
          });
        }
      }
    }

    return { messages, reads };
  }
}
