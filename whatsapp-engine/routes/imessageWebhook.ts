import { Router } from 'express';
import { prisma } from '../../lib/db/index';
import { IMessageNormalizer } from '../IMessageNormalizer';
import { enqueueInboundJob } from '../agents/IngressService';

export function createIMessageWebhookRouter(io: any) {
  const router = Router();

  /**
   * GET /api/webhooks/imessage
   * Health check / verification challenge endpoint.
   */
  router.get('/api/webhooks/imessage', (req, res) => {
    res.status(200).json({ status: 'active', channel: 'IMESSAGE', service: 'oneaiassist-imessage-gateway' });
  });

  /**
   * POST /api/webhooks/imessage
   * Inbound message event handler for Managed iMessage Cloud API & Webhooks.
   */
  router.post('/api/webhooks/imessage', async (req, res) => {
    try {
      res.status(200).json({ status: 'EVENT_RECEIVED' });

      const payload = req.body;
      console.log('[iMessage Webhook] Received inbound payload:', JSON.stringify(payload).slice(0, 200));

      const normalized = IMessageNormalizer.normalize(payload);
      if (!normalized || !normalized.sender || !normalized.text) {
        console.log('[iMessage Webhook] Ignored non-text or empty payload');
        return;
      }

      // Determine tenantId from payload or retrieve default master tenant
      let tenantId = payload.tenantId || payload.tenant_id;
      if (!tenantId) {
        const tenant = await prisma.tenant.findFirst();
        tenantId = tenant?.id || 'default';
      }

      console.log(`[iMessage Webhook] Enqueueing inbound iMessage from ${normalized.sender} for tenant ${tenantId}`);

      // Enqueue into agent worker queue with channel override 'IMESSAGE'
      await enqueueInboundJob({
        tenantId,
        wamId: normalized.messageId,
        senderPhone: normalized.sender,
        payload: {
          ...payload,
          channel: 'IMESSAGE',
          text: normalized.text,
          from: normalized.sender,
          id: normalized.messageId,
        },
      });
    } catch (err: any) {
      console.error('[iMessage Webhook] Exception during webhook processing:', err?.message || err);
    }
  });

  return router;
}
