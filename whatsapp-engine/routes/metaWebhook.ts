import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma, getTenantPrisma } from '../../lib/db/index';
import { decrypt, encrypt } from '../../lib/encryption';
import { MetaNormalizer, normalizeMetaPhone } from '../MetaNormalizer';
import { handleMessageStatusUpdate } from '../engine-logic';
import { toJid } from '../transport/TransportManager';
import { enqueueInboundJob } from '../agents/IngressService';

export function createMetaWebhookRouter(io: any) {
  const router = Router();

  /**
   * GET /api/webhook/meta
   * Meta Webhook verification handshake challenge endpoint.
   */
  router.get('/api/webhook/meta', async (req, res) => {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token) {
        // Query database to match verify token across tenants
        const matchingNumber = await prisma.whatsAppNumber.findFirst({
          where: { metaVerifyToken: String(token) },
        });

        const defaultToken = process.env.META_VERIFY_TOKEN || 'oneai_meta_verify_secret_123';

        if (matchingNumber || token === defaultToken) {
          console.log(`[Meta Webhook] Verification successful for token: ${token}`);
          return res.status(200).send(challenge);
        }
      }

      console.warn(`[Meta Webhook] Verification failed for mode: ${mode}, token: ${token}`);
      return res.sendStatus(403);
    } catch (err) {
      console.error('[Meta Webhook] Error during GET verification handshake:', err);
      return res.sendStatus(500);
    }
  });

  /**
   * POST /api/webhook/meta
   * Inbound message and status receipt event handler for Meta WhatsApp Cloud API.
   */
  router.post('/api/webhook/meta', async (req, res) => {
    try {
      // Respond 200 OK immediately to Meta webhook server
      res.status(200).send('EVENT_RECEIVED');

      const body = req.body;
      const parsed = MetaNormalizer.parsePayload(body);

      // Process Inbound Messages
      for (const msg of parsed.messages) {
        try {
          // Find tenant by metaPhoneNumberId or default tenant
          let number = await prisma.whatsAppNumber.findFirst({
            where: { metaPhoneNumberId: msg.phoneNumberId },
          });

          if (!number) {
            number = await prisma.whatsAppNumber.findFirst({
              where: { provider: 'META_CLOUD_API' },
            });
          }

          if (!number) {
            console.warn(`[Meta Webhook] No matching WhatsAppNumber for phoneNumberId ${msg.phoneNumberId}`);
            continue;
          }

          const tenantId = number.tenantId;
          const db = getTenantPrisma(tenantId, 'ADMIN');
          const rawPhone = '+' + msg.contactNumber;
          const normRawPhone = msg.contactNumber;
          const targetJid = toJid(rawPhone);

          // 0. ATOMIC IDEMPOTENCY GATE: Enqueue InboundMessageJob before anything else
          const enqueueRes = await enqueueInboundJob({
            tenantId,
            wamId: msg.messageId,
            senderPhone: rawPhone,
            recipientId: msg.phoneNumberId,
            payload: msg,
          });

          if (!enqueueRes.accepted) {
            console.log(`[Meta Webhook] Duplicate wamId ${msg.messageId} rejected atomically at database level.`);
            continue;
          }

          let createdMessage: any = null;
          let conversationId = '';

          await db.$transaction(async (tx) => {
            // 1. Identity Unification Check
            const customers = await tx.customer.findMany({ where: { tenantId } });
            let targetCustomer: any = null;

            for (const c of customers) {
              try {
                let decPhone = c.primaryPhone;
                if (c.primaryPhone && (c.primaryPhone.includes(':') || c.primaryPhone.length > 25)) {
                  try {
                    decPhone = decrypt(c.primaryPhone);
                  } catch {
                    decPhone = c.primaryPhone;
                  }
                }

                const normDecPhone = decPhone.replace(/[^\d]/g, '');

                if (
                  decPhone === rawPhone ||
                  normDecPhone === normRawPhone ||
                  toJid(decPhone) === targetJid ||
                  (normDecPhone.length >= 10 && normRawPhone.endsWith(normDecPhone.slice(-10))) ||
                  (normRawPhone.length >= 10 && normDecPhone.endsWith(normRawPhone.slice(-10)))
                ) {
                  targetCustomer = c;
                  break;
                }
              } catch {}
            }

            // 2. Create customer if not found
            if (!targetCustomer) {
              targetCustomer = await tx.customer.create({
                data: {
                  tenantId,
                  displayName: msg.contactName || rawPhone,
                  primaryPhone: encrypt(rawPhone),
                  otpVerified: false,
                  optedIn: true,
                },
              });

              await tx.customerChannel.create({
                data: {
                  tenantId,
                  customerId: targetCustomer.id,
                  channel: 'WHATSAPP',
                  channelIdentifier: targetJid,
                  channelMetadata: { source: 'META_CLOUD_API' },
                },
              });
            }

            // 3. Find or Create Open Conversation
            let conversation = await tx.conversation.findFirst({
              where: {
                customerId: targetCustomer.id,
                channel: 'WHATSAPP',
                status: 'OPEN',
              },
            });

            if (!conversation) {
              conversation = await tx.conversation.create({
                data: {
                  tenantId,
                  customerId: targetCustomer.id,
                  channel: 'WHATSAPP',
                  status: 'OPEN',
                  lastMessageAt: new Date(),
                },
              });
            } else {
              await tx.conversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date() },
              });
            }

            conversationId = conversation.id;

            // 4. Save Inbound Message
            const message = await tx.message.create({
              data: {
                tenantId,
                conversationId: conversation.id,
                direction: 'INBOUND',
                senderType: 'CUSTOMER',
                content: msg.text,
                channel: 'WHATSAPP',
                channelMessageId: msg.messageId,
                messageType: msg.messageType,
                status: 'READ',
                contextMessageId: msg.contextMessageId || null,
              },
            });
            createdMessage = message;

            // 5. Emit Socket.io real-time new_message event
            io.to(`tenant_${tenantId}`).emit('new_message', {
              conversationId: conversation.id,
              message: {
                id: message.id,
                content: message.content,
                direction: message.direction,
                senderType: message.senderType,
                createdAt: message.createdAt,
                messageType: message.messageType,
                status: message.status,
                contextMessageId: message.contextMessageId,
              },
            });
          });

          // 6. Link created message and conversation to the enqueued InboundMessageJob
          if (enqueueRes.jobId && createdMessage && conversationId) {
            await db.inboundMessageJob.update({
              where: { id: enqueueRes.jobId },
              data: {
                conversationId,
                messageId: createdMessage.id,
                status: 'QUEUED',
              },
            });
            console.log(`[Meta Webhook] Enqueued InboundMessageJob ${enqueueRes.jobId} for message ${createdMessage.id}`);
          }
        } catch (msgErr) {
          console.error(`[Meta Webhook] Error processing message ${msg.messageId}:`, msgErr);
        }
      }

      // Process Delivery Status Receipts
      for (const st of parsed.statuses) {
        try {
          const number = await prisma.whatsAppNumber.findFirst({
            where: { provider: 'META_CLOUD_API' },
          });
          if (number) {
            await handleMessageStatusUpdate(number.tenantId, st.messageId, st.status, io);
          }
        } catch (stErr) {
          console.error(`[Meta Webhook] Error processing status ${st.messageId}:`, stErr);
        }
      }
    } catch (err) {
      console.error('[Meta Webhook] Error handling POST event payload:', err);
    }
  });

  return router;
}
