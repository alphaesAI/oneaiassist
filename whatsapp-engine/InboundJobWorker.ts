import { prisma, getTenantPrisma } from '../lib/db';
import { AgentRouter } from './agents/AgentRouter';
import { LaneManager } from './agents/LaneManager';
import { MessageService } from './MessageService';
import { normalizePhoneNumber } from './agents/IdentityResolver';

let workerActive = false;
let pollerInterval: NodeJS.Timeout | null = null;
let supervisorInterval: NodeJS.Timeout | null = null;

export class InboundJobWorker {
  /**
   * Starts the robust asynchronous queue worker and stale-lock supervisor.
   */
  static start(io: any): void {
    if (workerActive) {
      console.log('[InboundJobWorker] Worker already running.');
      return;
    }
    workerActive = true;
    console.log('🚀 [InboundJobWorker] Starting async queue worker with Lane Mutex & Stale-Lock Supervisor...');

    // 1. Queue Polling & Processing Loop (runs every 1.5 seconds)
    pollerInterval = setInterval(async () => {
      try {
        await this.processNextBatch(io);
      } catch (err) {
        console.error('[InboundJobWorker] Error in job processing loop:', err);
      }
    }, 1500);

    // 2. Stale-Lock Supervisor Loop (runs every 60 seconds)
    supervisorInterval = setInterval(async () => {
      try {
        await this.superviseStaleLocks(io);
      } catch (err) {
        console.error('[InboundJobWorker] Error in stale lock supervisor:', err);
      }
    }, 60000);
  }

  /**
   * Stops the worker loops cleanly
   */
  static stop(): void {
    if (pollerInterval) clearInterval(pollerInterval);
    if (supervisorInterval) clearInterval(supervisorInterval);
    workerActive = false;
    console.log('[InboundJobWorker] Worker stopped.');
  }

  /**
   * Dequeues and processes available pending/queued jobs
   */
  private static async processNextBatch(io: any): Promise<void> {
    const jobs = await prisma.inboundMessageJob.findMany({
      where: {
        status: { in: ['RECEIVED', 'QUEUED'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    if (!jobs || jobs.length === 0) return;

    for (const job of jobs) {
      const senderPhone = job.senderPhone || 'default_sender';

      // Enqueue job inside per-customer sequential lane
      LaneManager.runInLane(job.tenantId, senderPhone, async () => {
        await this.processSingleJob(job.id, io);
      }).catch((laneErr) => {
        console.error(`[InboundJobWorker] Lane processing error for job ${job.id}:`, laneErr);
      });
    }
  }

  /**
   * Processes a single inbound job through the full lifecycle:
   * RECEIVED/QUEUED -> PROCESSING -> Agent Turn -> Outbound Reply -> COMPLETED (or FAILED)
   */
  static async processSingleJob(jobId: string, io: any): Promise<void> {
    const job = await prisma.inboundMessageJob.findUnique({
      where: { id: jobId },
    });

    if (!job || (job.status !== 'RECEIVED' && job.status !== 'QUEUED')) {
      return;
    }

    const currentAttempts = job.attempts + 1;

    // 1. Transition to PROCESSING state with row lock timestamp
    await prisma.inboundMessageJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(),
        attempts: currentAttempts,
      },
    });

    console.log(`[InboundJobWorker] Claimed job ${job.id} (attempt ${currentAttempts}/${job.maxAttempts}) for tenant ${job.tenantId}`);

    try {
      const tenantId = job.tenantId;
      const db = getTenantPrisma(tenantId, 'ADMIN');

      let conversationId = job.conversationId;
      let rawText = '';

      // Extract text content from payload or existing message
      const payload: any = job.payload || {};
      rawText = payload.text || payload.content || payload.body || '';

      const normalizedPhone = normalizePhoneNumber(job.senderPhone || payload.from || '');

      // 2. Resolve Conversation and Inbound Message record if not already created
      if (!conversationId) {
        // Find or create customer
        let customer = await db.customer.findFirst({
          where: {
            OR: [
              { primaryPhone: normalizedPhone },
              {
                customerChannels: {
                  some: {
                    channelIdentifier: normalizedPhone,
                  },
                },
              },
            ],
          },
        });

        if (!customer) {
          customer = await db.customer.create({
            data: {
              tenantId,
              displayName: payload.contactName || `Contact ${normalizedPhone.slice(-4)}`,
              primaryPhone: normalizedPhone,
              customerChannels: {
                create: {
                  tenantId,
                  channel: 'WHATSAPP',
                  channelIdentifier: normalizedPhone,
                  channelMetadata: {},
                },
              },
            },
          });
        }

        // Find or create conversation
        let conversation = await db.conversation.findFirst({
          where: {
            tenantId,
            customerId: customer.id,
            channel: 'WHATSAPP',
          },
        });

        if (!conversation) {
          conversation = await db.conversation.create({
            data: {
              tenantId,
              customerId: customer.id,
              channel: 'WHATSAPP',
              status: 'OPEN',
              lastMessageAt: new Date(),
            },
          });
        }

        conversationId = conversation.id;

        // Create Inbound Message record if text exists and not already created
        let messageId = job.messageId;
        if (!messageId && rawText) {
          const inboundMessage = await db.message.create({
            data: {
              tenantId,
              conversationId: conversation.id,
              direction: 'INBOUND',
              senderType: 'CUSTOMER',
              content: rawText,
              channel: 'WHATSAPP',
              channelMessageId: job.wamId,
              messageType: 'TEXT',
              status: 'READ',
            },
          });
          messageId = inboundMessage.id;

          // Emit new_message socket event to live inbox
          if (io) {
            io.to(`tenant_${tenantId}`).emit('new_message', {
              conversationId: conversation.id,
              message: {
                id: inboundMessage.id,
                content: inboundMessage.content,
                direction: inboundMessage.direction,
                senderType: inboundMessage.senderType,
                createdAt: inboundMessage.createdAt,
                messageType: inboundMessage.messageType,
                status: inboundMessage.status,
              },
            });
          }
        }

        // Backfill conversationId and messageId on the job
        await prisma.inboundMessageJob.update({
          where: { id: job.id },
          data: {
            conversationId,
            messageId,
          },
        });
      }

      // Check if conversation automation is enabled
      const activeConv = await db.conversation.findUnique({
        where: { id: conversationId },
      });

      if (activeConv && activeConv.automationEnabled === false) {
        console.log(`[InboundJobWorker] Conversation ${conversationId} has automation disabled / human takeover. Skipping automated bot response.`);
        await db.inboundMessageJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });
        return;
      }

      // 3. Dispatch through Multi-Agent Router
      const agentResponse = await AgentRouter.dispatchMessage({
        tenantId,
        conversationId,
        rawMessage: rawText,
        wamId: job.wamId || `wam_${job.id}`,
        senderPhone: normalizedPhone,
        io,
      });

      // 4. Send Outbound WhatsApp Reply if generated
      if (agentResponse.replyText) {
        try {
          await MessageService.sendMessage(
            tenantId,
            {
              to: normalizedPhone,
              text: agentResponse.replyText,
              conversationId,
            },
            io
          );
          console.log(`[InboundJobWorker] Sent reply from ${agentResponse.agentName} to ${normalizedPhone}`);
        } catch (dispatchErr) {
          console.error(`[InboundJobWorker] Outbound WhatsApp dispatch failed for job ${job.id}:`, dispatchErr);
          throw dispatchErr;
        }
      }

      // 5. Mark Job as COMPLETED
      await db.inboundMessageJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
        },
      });

      console.log(`✅ [InboundJobWorker] Job ${job.id} completed successfully by ${agentResponse.agentName}`);
    } catch (err: any) {
      console.error(`❌ [InboundJobWorker] Job ${job.id} processing failed on attempt ${currentAttempts}:`, err);

      const errorMessage = err?.message || String(err);
      const isTerminal = currentAttempts >= job.maxAttempts;
      const db = getTenantPrisma(job.tenantId, 'ADMIN');

      if (isTerminal) {
        // Terminal Failure: Mark FAILED, create AuditLog alert, emit socket event
        await db.inboundMessageJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            lastError: errorMessage,
            processedAt: new Date(),
          },
        });

        // Write CRITICAL AuditLog
        try {
          const adminUser = await db.user.findFirst({
            where: { tenantId: job.tenantId },
            orderBy: { createdAt: 'asc' },
          });

          if (adminUser) {
            await db.auditLog.create({
              data: {
                tenantId: job.tenantId,
                userId: adminUser.id,
                action: 'INBOUND_JOB_FAILED_TERMINAL',
                metadata: {
                  jobId: job.id,
                  wamId: job.wamId,
                  senderPhone: job.senderPhone,
                  attempts: currentAttempts,
                  error: errorMessage,
                  severity: 'CRITICAL',
                  timestamp: new Date().toISOString(),
                },
              },
            });
          }
        } catch (auditErr) {
          console.error('[InboundJobWorker] Failed to write terminal failure audit log:', auditErr);
        }

        // Emit real-time system alert to dashboard
        if (io) {
          io.to(`tenant_${job.tenantId}`).emit('system_alert', {
            type: 'CRITICAL',
            title: 'Inbound Message Processing Failed',
            message: `Customer message from ${job.senderPhone} failed after ${currentAttempts} attempts. Reason: ${errorMessage}`,
            jobId: job.id,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        // Non-terminal: Reset to QUEUED for retry
        await db.inboundMessageJob.update({
          where: { id: job.id },
          data: {
            status: 'QUEUED',
            lastError: errorMessage,
          },
        });
      }
    }
  }

  /**
   * Supervise stale locks: resets jobs stuck in PROCESSING > 5 minutes back to QUEUED
   */
  private static async superviseStaleLocks(io: any): Promise<void> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const staleJobs = await prisma.inboundMessageJob.findMany({
        where: {
          status: 'PROCESSING',
          lockedAt: { lt: fiveMinutesAgo },
          attempts: { lt: 3 },
        },
      });

      if (staleJobs.length > 0) {
        console.warn(`⚠️ [InboundJobWorker] Found ${staleJobs.length} stale locked jobs. Resetting to QUEUED...`);

        for (const stale of staleJobs) {
          await prisma.inboundMessageJob.update({
            where: { id: stale.id },
            data: {
              status: 'QUEUED',
              lockedAt: null,
            },
          });
          console.log(`[InboundJobWorker] Reset stale job ${stale.id} to QUEUED.`);
        }
      }
    } catch (err) {
      console.error('[InboundJobWorker] Stale lock supervision error:', err);
    }
  }
}
