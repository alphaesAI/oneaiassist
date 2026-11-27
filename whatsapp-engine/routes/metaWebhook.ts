import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma, getTenantPrisma } from '../../lib/db/index';
import { decrypt, encrypt } from '../../lib/encryption';
import { MetaNormalizer, normalizeMetaPhone } from '../MetaNormalizer';
import { handleMessageStatusUpdate } from '../engine-logic';
import { toJid } from '../transport/TransportManager';
import { enqueueInboundJob } from '../agents/IngressService';
import { findTenantIdByPhoneNumberId, isValidWebhookVerifyToken } from '../../lib/whatsapp/webhookAuth';
import { WhatsAppTemplateService } from '../../lib/whatsapp/templateService';
import { extractTemplateEvents, isValidMetaSignature } from '../../lib/whatsapp/webhookAuth';
import { recordDeliveryEvent } from '../../lib/whatsapp/deliveryTracking';
import { handleInboundWhatsApp, OPT_IN_CONFIRMATION, OPT_OUT_CONFIRMATION, type OptAction } from '../../lib/whatsapp/inbound';
import { TransportManager } from '../transport/TransportManager';

export interface MetaWebhookOptions {
  /** Sends the short confirmation after a STOP or START. Replaceable in tests. */
  sendConfirmation?: (tenantId: string, to: string, text: string) => Promise<{ messageId: string }>;
}

async function defaultSendConfirmation(tenantId: string, to: string, text: string) {
  const transport = await TransportManager.resolveTransport(tenantId, 'WHATSAPP');
  return transport.sendText(to, text);
}

export function createMetaWebhookRouter(io: any, options: MetaWebhookOptions = {}) {
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

      if (mode === 'subscribe' && isValidWebhookVerifyToken(token)) {
        console.log('[Meta Webhook] Verification handshake accepted.');
        return res.status(200).send(String(challenge ?? ''));
      }

      console.warn(`[Meta Webhook] Verification handshake refused (mode: ${String(mode)}).`);
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
      // Only requests signed by Meta with our app secret are processed. The signature covers the
      // exact bytes of the body, so nothing is read from the payload before this check.
      if (!isValidMetaSignature((req as any).rawBody, req.headers['x-hub-signature-256'])) {
        console.warn('[Meta Webhook] Rejected a request with a missing or invalid signature.');
        return res.sendStatus(401);
      }

      // Respond 200 OK immediately to Meta webhook server
      res.status(200).send('EVENT_RECEIVED');

      const body = req.body;
      const parsed = MetaNormalizer.parsePayload(body);

      // Process Inbound Messages
      for (const msg of parsed.messages) {
        try {
          // The phone number ID decides the tenant. An unknown number is dropped: it is never
          // handed to another tenant.
          const tenantId = await findTenantIdByPhoneNumberId(msg.phoneNumberId);
          if (!tenantId) {
            console.warn(`[Meta Webhook] Ignored message for unknown phoneNumberId ${msg.phoneNumberId}`);
            continue;
          }

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
          let customerId = '';

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
            customerId = targetCustomer.id;

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

          // 5b. Opt-out / opt-in keywords, and which campaign this message answers
          let optAction: OptAction | null = null;
          if (customerId) {
            try {
              const inbound = await handleInboundWhatsApp({
                tenantId,
                customerId,
                text: msg.messageType === 'TEXT' ? msg.text : null,
                at: msg.timestamp ? new Date(msg.timestamp) : undefined,
                contextMessageId: msg.contextMessageId,
              });
              optAction = inbound.optAction;
              if (inbound.campaignId && inbound.totals) {
                io.to(`tenant_${tenantId}`).emit('broadcast_stats_updated', { campaignId: inbound.campaignId, ...inbound.totals });
              }
              if (optAction && conversationId) {
                // Confirm to the contact. They have just messaged, so the 24-hour window is open.
                const text = optAction === 'OPT_OUT' ? OPT_OUT_CONFIRMATION : OPT_IN_CONFIRMATION;
                try {
                  const sent = await (options.sendConfirmation || defaultSendConfirmation)(tenantId, msg.contactNumber, text);
                  const confirmation = await db.message.create({
                    data: {
                      tenantId, conversationId, direction: 'OUTBOUND', senderType: 'BOT', content: text,
                      channel: 'WHATSAPP', channelMessageId: sent.messageId || null, status: 'SENT', sentAt: new Date(),
                    },
                  });
                  io.to(`tenant_${tenantId}`).emit('new_message', {
                    conversationId,
                    message: {
                      id: confirmation.id, content: confirmation.content, direction: confirmation.direction,
                      senderType: confirmation.senderType, createdAt: confirmation.createdAt,
                      messageType: confirmation.messageType, status: confirmation.status,
                    },
                  });
                } catch (confirmErr) {
                  // The opt-out itself is already saved; only the confirmation text failed.
                  console.error('[Meta Webhook] Could not send the opt-out/opt-in confirmation:', confirmErr instanceof Error ? confirmErr.message : confirmErr);
                }
              }
            } catch (inboundErr) {
              console.error(`[Meta Webhook] Error applying opt-out/reply tracking for ${msg.messageId}:`, inboundErr);
            }
          }

          // 6. Link created message and conversation to the enqueued InboundMessageJob
          if (enqueueRes.jobId && createdMessage && conversationId) {
            await db.inboundMessageJob.update({
              where: { id: enqueueRes.jobId },
              data: {
                conversationId,
                messageId: createdMessage.id,
                // A STOP or START is fully handled here; it is not passed to the AI assistant.
                status: optAction ? 'COMPLETED' : 'QUEUED',
                ...(optAction ? { processedAt: new Date() } : {}),
              },
            });
            console.log(`[Meta Webhook] Enqueued InboundMessageJob ${enqueueRes.jobId} for message ${createdMessage.id}`);
          }
        } catch (msgErr) {
          console.error(`[Meta Webhook] Error processing message ${msg.messageId}:`, msgErr);
        }
      }

      // Template review results. The event only says which template changed; the real status is
      // then read from Meta with the tenant's own token, so a forged event cannot approve anything.
      for (const event of extractTemplateEvents(body)) {
        try {
          await WhatsAppTemplateService.handleWebhookEvent(event);
        } catch (tplErr) {
          console.error('[Meta Webhook] Error processing template event:', tplErr);
        }
      }

      // Process Delivery Status Receipts
      for (const st of parsed.statuses) {
        try {
          const statusTenantId = await findTenantIdByPhoneNumberId(st.phoneNumberId);
          if (!statusTenantId) {
            console.warn(`[Meta Webhook] Ignored status for unknown phoneNumberId ${st.phoneNumberId}`);
            continue;
          }
          const at = new Date(st.timestamp);
          await handleMessageStatusUpdate(statusTenantId, st.messageId, st.status, io, at);

          // The same update for the broadcast job that sent the message, with Meta's error code.
          const tracked = await recordDeliveryEvent({
            tenantId: statusTenantId,
            providerMessageId: st.messageId,
            status: st.status,
            timestamp: at,
            errorCode: st.errorCode,
            errorMessage: st.errorMessage,
          });
          if (tracked.changed && tracked.campaignId && tracked.totals) {
            io.to(`tenant_${statusTenantId}`).emit('broadcast_stats_updated', { campaignId: tracked.campaignId, ...tracked.totals });
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
