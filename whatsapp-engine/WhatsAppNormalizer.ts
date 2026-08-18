export interface CanonicalMessage {
  messageId: string;
  remoteJid: string;
  text: string;
  fromMe: boolean;
  participant?: string;
  pushName?: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'OTHER';
  contextMessageId?: string;
}

export class WhatsAppNormalizer {
  static normalizeBaileys(msg: any): CanonicalMessage | null {
    if (!msg || !msg.message) return null;

    const messageId = msg.key.id || '';
    const remoteJid = msg.key.remoteJid || '';
    const fromMe = !!msg.key.fromMe;
    const participant = msg.key.participant || undefined;
    const pushName = msg.pushName || undefined;

    // Extract quoted context message ID if present
    const contextMessageId =
      msg.message.extendedTextMessage?.contextInfo?.stanzaId ||
      msg.message.imageMessage?.contextInfo?.stanzaId ||
      msg.message.videoMessage?.contextInfo?.stanzaId ||
      undefined;

    // Extract text from conversation or extended text message
    let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'OTHER' = 'TEXT';

    if (msg.message.imageMessage) {
      text = msg.message.imageMessage.caption || '';
      messageType = 'IMAGE';
    } else if (msg.message.videoMessage) {
      text = msg.message.videoMessage.caption || '';
      messageType = 'VIDEO';
    } else if (!text && Object.keys(msg.message).length > 0) {
      messageType = 'OTHER';
    }

    return {
      messageId,
      remoteJid,
      text,
      fromMe,
      participant,
      pushName,
      messageType,
      contextMessageId,
    };
  }

  static normalizeOpenWA(message: any): CanonicalMessage | null {
    if (!message) return null;

    const messageId = message.id || '';
    const remoteJid = message.from || '';
    const fromMe = !!message.fromMe;
    const pushName = message.sender?.pushname || undefined;

    let text = message.body || message.caption || '';
    let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'OTHER' = 'TEXT';

    if (message.type === 'image') {
      messageType = 'IMAGE';
    } else if (message.type === 'video') {
      messageType = 'VIDEO';
    } else if (message.type !== 'chat') {
      messageType = 'OTHER';
    }

    return {
      messageId,
      remoteJid,
      text,
      fromMe,
      pushName,
      messageType,
    };
  }
}
