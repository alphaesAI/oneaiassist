import { create } from '@open-wa/wa-automate';
import qrcode from 'qrcode';
import { prisma, getTenantPrisma } from '../lib/db/index';
import { encrypt } from '../lib/encryption';
import { runAIAgentAutoResponse, connectTenant } from './engine-logic';

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

    // 3. Inbound Message listener
    client.onMessage(async (message: any) => {
      if (message.isGroupMsg) return;
      const rawPhone = message.from.split('@')[0];
      const text = message.body || message.caption || '';
      if (!text) return;

      console.log(`[OpenWA Engine] Inbound message from ${rawPhone}: "${text}"`);

      try {
        let customer = await db.customer.findFirst({
          where: { tenantId, primaryPhone: rawPhone },
        });

        if (!customer) {
          customer = await db.customer.create({
            data: {
              tenantId,
              displayName: message.sender?.pushname || rawPhone,
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
            data: { tenantId, customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN' },
          });
        }

        const newMsg = await db.message.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            direction: 'INBOUND',
            senderType: 'CUSTOMER',
            content: text,
            channel: 'WHATSAPP',
          },
        });

        io.to(`tenant_${tenantId}`).emit('new_message', {
          conversationId: conversation.id,
          message: newMsg,
        });

        // Trigger AI Auto Response
        runAIAgentAutoResponse(tenantId, conversation.id, io).catch((err) => {
          console.error(`[OpenWA Engine] AI response error for tenant ${tenantId}:`, err);
        });
      } catch (err) {
        console.error(`[OpenWA Engine] Error processing inbound message for tenant ${tenantId}:`, err);
      }
    });

    return client;
  } catch (err: any) {
    console.warn(`[OpenWA Engine] OpenWA initialization failed (${err?.message || err}). Falling back to native Baileys engine.`);
    // Fall back smoothly to Baileys engine
    return connectTenant(tenantId, io);
  }
}
