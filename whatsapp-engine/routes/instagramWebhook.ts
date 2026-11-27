import { Router } from 'express';
import { isValidMetaSignature, isValidWebhookVerifyToken } from '../../lib/whatsapp/webhookAuth';
import crypto from 'node:crypto';
import { prisma } from '../../lib/db/index';
import { InstagramNormalizer } from '../InstagramNormalizer';
import { enqueueInboundJob } from '../agents/IngressService';

export function createInstagramWebhookRouter(io: any) {
  const router = Router();

  /**
   * GET /api/webhooks/instagram
   * Meta Webhook verification handshake challenge endpoint.
   */
  router.get('/api/webhooks/instagram', async (req, res) => {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      // Same platform verify token as the WhatsApp webhook. No default value, and not "any token".
      if (mode === 'subscribe' && isValidWebhookVerifyToken(token)) {
        console.log('[Instagram Webhook] Verification handshake accepted.');
        return res.status(200).send(String(challenge ?? ''));
      }

      console.warn(`[Instagram Webhook] Verification handshake refused (mode: ${String(mode)}).`);
      return res.sendStatus(403);
    } catch (err) {
      console.error('[Instagram Webhook] Error during GET handshake:', err);
      return res.sendStatus(500);
    }
  });

  /**
   * POST /api/webhooks/instagram
   * Inbound Instagram DM and Postback event processor.
   */
  router.post('/api/webhooks/instagram', async (req, res) => {
    try {
      // 1. Only requests signed by Meta with our app secret are processed.
      if (!isValidMetaSignature((req as any).rawBody, req.headers['x-hub-signature-256'])) {
        console.warn('[Instagram Webhook] Rejected a request with a missing or invalid signature.');
        return res.sendStatus(401);
      }

      // 2. Acknowledge the event to Meta
      res.status(200).send('EVENT_RECEIVED');

      const body = req.body;

      // 3. Normalize incoming payload
      const parsed = InstagramNormalizer.parsePayload(body);

      // 4. Process Inbound Messages
      for (const msg of parsed.messages) {
        try {
          // Multi-tenant lookup: map Instagram Business Account ID to tenantId
          let account = await prisma.instagramAccount.findFirst({
            where: { instagramId: msg.instagramBusinessId },
          });

          let tenantId = account?.tenantId;
          if (!tenantId) {
            // Fallback for dev mode / first tenant
            const defaultTenant = await prisma.tenant.findFirst();
            tenantId = defaultTenant?.id || 'default';
          }

          console.log(`[Instagram Webhook] Enqueueing inbound Instagram DM from ${msg.senderIgId} for tenant ${tenantId}`);

          // Enqueue into agent worker with channel 'INSTAGRAM'
          await enqueueInboundJob({
            tenantId,
            wamId: msg.messageId,
            senderPhone: msg.senderIgId,
            payload: {
              channel: 'INSTAGRAM',
              messageId: msg.messageId,
              senderIgId: msg.senderIgId,
              text: msg.text,
              mediaUrl: msg.mediaUrl,
              from: msg.senderIgId,
            },
          });
        } catch (msgErr) {
          console.error(`[Instagram Webhook] Error processing message ${msg.messageId}:`, msgErr);
        }
      }
    } catch (err: any) {
      console.error('[Instagram Webhook] Exception during webhook processing:', err?.message || err);
    }
  });

  return router;
}
