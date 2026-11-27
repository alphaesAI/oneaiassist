import 'dotenv/config';
import { prisma } from '@/lib/db';
import { runCampaignTick } from './campaignRunner';
import { assertTrackingSecretConfigured } from '@/lib/email/tracking';
import { WhatsAppTemplateService } from '@/lib/whatsapp/templateService';

const POLL_MS = Number(process.env.WORKER_POLL_MS || 5000);
// How often WhatsApp templates waiting for Meta's review are checked, in case a webhook was missed.
const TEMPLATE_SYNC_MS = Number(process.env.WHATSAPP_TEMPLATE_SYNC_MS || 5 * 60_000);
let lastTemplateSyncAt = 0;

let shuttingDown = false;
let inFlightTick: Promise<unknown> | null = null;

async function startWorker() {
  // Fail at startup, not on the first send, if links cannot be signed.
  assertTrackingSecretConfigured();
  console.log(`[Worker] Email campaign worker starting (pid=${process.pid}, poll=${POLL_MS}ms)`);

  while (!shuttingDown) {
    try {
      inFlightTick = runCampaignTick();
      const summary = await inFlightTick;
      inFlightTick = null;

      if (
        summary &&
        typeof summary === 'object' &&
        ('startedCampaigns' in summary || 'claimedJobs' in summary)
      ) {
        const s = summary as {
          recoveredLocks: number;
          startedCampaigns: number;
          builtAudiences: number;
          claimedJobs: number;
          finishedCampaigns: number;
          processedJourneys?: number;
        };
        if (s.recoveredLocks || s.startedCampaigns || s.builtAudiences || s.claimedJobs || s.finishedCampaigns || s.processedJourneys) {
          console.log('[Worker] Tick:', JSON.stringify(s));
        }
      }
    } catch (err) {
      inFlightTick = null;
      console.error('[Worker] Tick error:', err);
    }

    if (!shuttingDown && Date.now() - lastTemplateSyncAt >= TEMPLATE_SYNC_MS) {
      lastTemplateSyncAt = Date.now();
      try {
        inFlightTick = WhatsAppTemplateService.syncPendingTenants();
        const result = (await inFlightTick) as { tenants: number; failed: number };
        if (result.tenants > 0) console.log('[Worker] WhatsApp template sync:', JSON.stringify(result));
      } catch (err) {
        console.error('[Worker] WhatsApp template sync error:', err);
      } finally {
        inFlightTick = null;
      }
    }

    if (shuttingDown) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Worker] Received ${signal}. Waiting for in-flight jobs...`);
  if (inFlightTick) {
    await inFlightTick.catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
  console.log('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

startWorker().catch((err) => {
  console.error('[Worker] Fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
