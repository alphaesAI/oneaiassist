import fs from 'node:fs';
import path from 'node:path';
import { getTenantPrisma } from '../lib/db/index';
import { TransportManager } from './transport/TransportManager';
import { decrypt } from '../lib/encryption';

function findMediaFile(mediaId: string): string | null {
  const mediaDir = path.join(__dirname, '../public/media');
  if (!fs.existsSync(mediaDir)) return null;
  const files = fs.readdirSync(mediaDir);
  const found = files.find(f => f.startsWith(mediaId));
  return found ? path.join(mediaDir, found) : null;
}

export interface SendMessageParams {
  to: string;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  clientMessageId?: string;
  conversationId: string;
}

export class MessageService {
  static async sendMessage(tenantId: string, params: SendMessageParams, io: any) {
    const db = getTenantPrisma(tenantId, 'ADMIN');

    // 1. Idempotency Check
    if (params.clientMessageId) {
      const existing = await db.message.findUnique({
        where: { clientMessageId: params.clientMessageId },
      });
      if (existing) {
        console.log(`[MessageService] Duplicate message detected for clientMessageId ${params.clientMessageId}. Returning existing.`);
        return { success: true, messageId: existing.id, duplicated: true };
      }
    }

    // 2. Resolve secure media if present
    let localFilePath: string | null = null;
    if (params.mediaId) {
      localFilePath = findMediaFile(params.mediaId);
      if (!localFilePath) {
        throw new Error(`Media asset with ID ${params.mediaId} not found.`);
      }
    }

    // 3. Decrypt recipient if encrypted
    let targetPhone = params.to;
    if (params.to && (params.to.includes(':') || params.to.length > 25)) {
      try {
        targetPhone = decrypt(params.to);
      } catch (err) {
        console.warn(`[MessageService] Phone string decryption warning for ${params.to}:`, err);
      }
    }

    // 4. Determine transport message type and execute
    const transport = TransportManager.getTransport(tenantId);
    let result: { messageId: string } = { messageId: '' };
    let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' = 'TEXT';
    let sendStatus: 'SENT' | 'FAILED' = 'SENT';

    try {
      if (localFilePath && params.mimeType) {
        if (params.mimeType.startsWith('image/')) {
          result = await transport.sendImage(targetPhone, {
            filePath: localFilePath,
            caption: params.text,
          });
          messageType = 'IMAGE';
        } else if (params.mimeType.startsWith('video/')) {
          result = await transport.sendVideo(targetPhone, {
            filePath: localFilePath,
            caption: params.text,
          });
          messageType = 'VIDEO';
        } else {
          throw new Error(`Unsupported MIME type: ${params.mimeType}`);
        }
      } else {
        if (!params.text) {
          throw new Error('Message text or media is required.');
        }
        result = await transport.sendText(targetPhone, params.text);
        messageType = 'TEXT';
      }
    } catch (sendErr: any) {
      console.error(`[MessageService] Outbound transport delivery failed for target ${targetPhone}:`, sendErr);
      sendStatus = 'FAILED';
      // Re-throw so caller route receives explicit error payload
      throw sendErr;
    }

    // 5. Create database record
    const dbMessage = await db.message.create({
      data: {
        tenantId,
        conversationId: params.conversationId,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        content: params.text || '',
        channel: 'WHATSAPP',
        channelMessageId: result.messageId || null,
        messageType,
        status: sendStatus,
        clientMessageId: params.clientMessageId || null,
        mediaId: params.mediaId || null,
        sentAt: new Date(),
      },
    });

    // 6. Update conversation timestamp
    await db.conversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: new Date() },
    });

    // 7. Emit Socket.io update (broadcasting to tenant namespace)
    io.to(`tenant_${tenantId}`).emit('new_message', {
      conversationId: params.conversationId,
      message: {
        id: dbMessage.id,
        content: dbMessage.content,
        direction: dbMessage.direction,
        senderType: dbMessage.senderType,
        createdAt: dbMessage.createdAt,
        messageType: dbMessage.messageType,
        status: dbMessage.status,
      },
    });

    return { success: true, messageId: dbMessage.id };
  }
}
