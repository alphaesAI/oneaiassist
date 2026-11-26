import 'dotenv/config';
import { prisma } from '@/lib/db';
import { runCampaignTick } from './campaignRunner';
import { assertTrackingSecretConfigured } from '@/lib/email/tracking';

const POLL_MS = Number(process.env.WORKER_POLL_MS || 5000);

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
