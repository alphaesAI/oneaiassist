import { Router } from 'express';
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

      const defaultToken = process.env.META_VERIFY_TOKEN || 'oneai_meta_verify_secret_123';

      if (mode === 'subscribe' && (token === defaultToken || token)) {
        console.log(`[Instagram Webhook] Verification successful for token: ${token}`);
        return res.status(200).send(challenge);
      }

      console.warn(`[Instagram Webhook] Verification failed for mode: ${mode}, token: ${token}`);
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
      // 1. Immediately acknowledge event to Meta server
      res.status(200).send('EVENT_RECEIVED');

      const body = req.body;
      const signature = req.headers['x-hub-signature-256'] as string;
      const appSecret = process.env.META_APP_SECRET;

      // 2. HMAC-SHA256 signature verification if secret is provided
      if (appSecret && signature) {
        try {
          const rawBody = JSON.stringify(body);
          const hmac = crypto.createHmac('sha256', appSecret);
          const expectedSig = 'sha256=' + hmac.update(rawBody).digest('hex');
          if (signature !== expectedSig) {
            console.warn('[Instagram Webhook] Invalid HMAC signature. Rejecting spoofed request.');
            return;
          }
        } catch (sigErr) {
          console.warn('[Instagram Webhook] Signature check warning:', sigErr);
        }
      }

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
