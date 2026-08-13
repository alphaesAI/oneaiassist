import { create } from '@open-wa/wa-automate';
import qrcode from 'qrcode';
import { getTenantPrisma } from '../lib/db/index';
import { encrypt } from '../lib/encryption';
import { runAIAgentAutoResponse, connectTenant, handleMessageStatusUpdate } from './engine-logic';
import { WhatsAppNormalizer } from './WhatsAppNormalizer';

export const openwaSessions = new Map<string, any>();
export const openwaQrCodes = new Map<string, string>();

/**
 * Initializes an OpenWA (Puppeteer / Chromium) engine connection for a tenant.
 * Includes automatic fallback to Baileys engine if Chromium or wmic.exe is unavailable.
 */
export async function connectTenantOpenWA(tenantId: string, io: any) {
  console.log(`[OpenWA Engine] Initializing OpenWA connection for tenant: ${tenantId}`);
  const db = getTenantPrisma(tenantId, 'ADMIN');

  try {
    const client = await create({
      sessionId: `tenant_${tenantId}`,
      useChrome: true, // Use local installed Chrome browser on Windows
      multiDevice: true,
      authTimeout: 60,
      blockCrashLogs: true,
      disableSpins: true,
      headless: true,
      qrTimeout: 0,
      logConsole: false,
      catchQR: async (base64Qr: string) => {
        console.log(`[OpenWA Engine] New QR Code generated for tenant ${tenantId}`);
        try {
          const qrDataUrl = base64Qr.startsWith('data:image')
            ? base64Qr
            : base64Qr.startsWith('iVBORw0')
            ? `data:image/png;base64,${base64Qr}`
            : await qrcode.toDataURL(base64Qr);

          openwaQrCodes.set(tenantId, qrDataUrl);

          await db.whatsAppNumber.upsert({
            where: { tenantId },
            create: { tenantId, sessionData: 'OPENWA_SESSION', status: 'QR_PENDING' },
            update: { status: 'QR_PENDING' },
          });

          io.to(`tenant_${tenantId}`).emit('whatsapp_qr', { qr: qrDataUrl });
        } catch (err) {
          console.error(`[OpenWA Engine] Failed to format QR code for tenant ${tenantId}:`, err);
        }
      },
    } as any);

    if (!client) {
      throw new Error('OpenWA client creation returned null.');
    }

    openwaSessions.set(tenantId, client);

    // 2. State change listener
    client.onStateChanged(async (state: string) => {
      console.log(`[OpenWA Engine] State changed to ${state} for tenant ${tenantId}`);
      if (state === 'CONNECTED') {
        openwaQrCodes.delete(tenantId);
        const me = await client.getMe();
        const phone = me?.id ? me.id.split('@')[0] : '';
        const encryptedPhone = encrypt(phone);

        await db.whatsAppNumber.upsert({
          where: { tenantId },
          create: {
            tenantId,
            sessionData: 'OPENWA_SESSION',
            status: 'CONNECTED',
            phoneNumber: encryptedPhone,
            lastConnectedAt: new Date(),
          },
          update: {
            status: 'CONNECTED',
            phoneNumber: encryptedPhone,
            lastConnectedAt: new Date(),
          },
        });

        io.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'CONNECTED', phoneNumber: phone });
      } else if (state === 'UNPAIRED' || state === 'DISCONNECTED') {
        await db.whatsAppNumber.update({
          where: { tenantId },
          data: { status: 'DISCONNECTED' },
        });
        io.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'DISCONNECTED' });
      }
    });

    // 3. Inbound Message listener (with normalizer, fromMe, STOP keyword, typing indicators)
    client.onMessage(async (message: any) => {
      if (message.isGroupMsg) return;

      const canonical = WhatsAppNormalizer.normalizeOpenWA(message);
      if (!canonical) return;

      const { remoteJid, text, fromMe, pushName, messageType } = canonical;
      const rawPhone = remoteJid.split('@')[0];

      // Capture outbound echoes from physical device (fromMe) — record as OUTBOUND/AGENT, no AI
      if (fromMe) {
        try {
          let conversation = await db.conversation.findFirst({
            where: { tenantId, channel: 'WHATSAPP', status: 'OPEN' },
            orderBy: { lastMessageAt: 'desc' },
          });
          if (conversation) {
            await db.message.create({
              data: {
                tenantId,
                conversationId: conversation.id,
                direction: 'OUTBOUND',
                senderType: 'AGENT',
                content: text || '',
                channel: 'WHATSAPP',
                channelMessageId: canonical.messageId || null,
                messageType,
              },
            });
            await db.conversation.update({
              where: { id: conversation.id },
              data: { lastMessageAt: new Date() },
            });
            io.to(`tenant_${tenantId}`).emit('new_message', {
              conversationId: conversation.id,
              message: {
                content: text || '',
                direction: 'OUTBOUND',
                senderType: 'AGENT',
                createdAt: new Date(),
              },
            });
          }
        } catch (err) {
          console.error(`[OpenWA Engine] Error recording fromMe message for tenant ${tenantId}:`, err);
        }
        return; // Do not trigger AI for physical device echoes
      }

      // Skip messages with no meaningful content (non-text media without caption)
      if (!text && messageType === 'OTHER') return;

      console.log(`[OpenWA Engine] Inbound message from ${rawPhone}: "${text}" (type: ${messageType})`);

      try {
        let customer = await db.customer.findFirst({
          where: { tenantId, primaryPhone: rawPhone },
        });

        if (!customer) {
          customer = await db.customer.create({
            data: {
              tenantId,
              displayName: pushName || rawPhone,
              primaryPhone: encrypt(rawPhone),
              optedIn: true,
            },
          });
        }

        let conversation = await db.conversation.findFirst({
          where: { customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN' },
        });

        if (!conversation) {
          conversation = await db.conversation.create({
            data: { tenantId, customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN', automationEnabled: true },
          });
        }

        // STOP keyword check — use tenant-configurable stopKeyword, fallback to 'STOP'
        const botConfig = await db.botConfig.findUnique({ where: { tenantId } }).catch(() => null);
        const stopKeyword = (botConfig as any)?.stopKeyword || 'STOP';
        const isStopRequest = text.trim().toUpperCase() === stopKeyword.toUpperCase();

        if (isStopRequest) {
          await db.conversation.update({
            where: { id: conversation.id },
            data: { automationEnabled: false },
          });
          console.log(`[OpenWA Engine] STOP keyword received from ${rawPhone}. Automation disabled for conversation ${conversation.id}.`);
        }

        const newMsg = await db.message.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            direction: 'INBOUND',
            senderType: 'CUSTOMER',
            content: text || '',
            channel: 'WHATSAPP',
            channelMessageId: canonical.messageId || null,
            messageType,
          },
        });

        io.to(`tenant_${tenantId}`).emit('new_message', {
          conversationId: conversation.id,
          message: newMsg,
        });

        // Only trigger AI auto-response if automation is still enabled (not STOP-listed)
        if (!isStopRequest && conversation.automationEnabled !== false) {
          // Show composing typing indicator
          try {
            await client.simulateTyping(remoteJid as any, true);
          } catch (_) { /* non-critical */ }

          try {
            await runAIAgentAutoResponse(tenantId, conversation.id, io);
          } catch (err) {
            console.error(`[OpenWA Engine] AI response error for tenant ${tenantId}:`, err);
          } finally {
            try {
              await client.simulateTyping(remoteJid as any, false);
            } catch (_) { /* non-critical */ }
          }
        }
      } catch (err) {
        console.error(`[OpenWA Engine] Error processing inbound message for tenant ${tenantId}:`, err);
      }
    });

    // 4. Delivery & Read Ack listener
    client.onAck(async (ack: any) => {
      try {
        const msgId = ack.id?._serialized || ack.id?.id || (typeof ack.id === 'string' ? ack.id : '');
        if (!msgId) return;

        if (ack.ack === 2) {
          await handleMessageStatusUpdate(tenantId, msgId, 'DELIVERED', io);
        } else if (ack.ack === 3 || ack.ack === 4) {
          await handleMessageStatusUpdate(tenantId, msgId, 'READ', io);
        }
      } catch (err) {
        console.error(`[OpenWA Engine] Error handling ack:`, err);
      }
    });

    return client;
  } catch (err: any) {
    console.warn(`[OpenWA Engine] OpenWA initialization failed (${err?.message || err}). Falling back to native Baileys engine.`);
    // Fall back smoothly to Baileys engine
    return connectTenant(tenantId, io);
  }
}
