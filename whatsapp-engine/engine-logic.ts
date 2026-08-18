import makeWASocket, { DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import { getTenantPrisma, prisma } from '../lib/db/index';
import { decrypt, encrypt } from '../lib/encryption';
import { getDatabaseAuthState, clearDatabaseAuthState } from './auth-state';
import { getTenantAIClient } from '../lib/ai/client';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { WhatsAppNormalizer } from './WhatsAppNormalizer';
import { IntakeQualificationSkill } from '../lib/claw/IntakeQualificationSkill';
import { toJid } from './transport/TransportManager';

export const sessions = new Map<string, any>();
export const qrCodes = new Map<string, string>();
export const pairingCodes = new Map<string, string>();
export const messageCaches = new Map<string, Map<string, any>>();

export function cacheMessage(tenantId: string, id: string, message: any) {
  let cache = messageCaches.get(tenantId);
  if (!cache) {
    cache = new Map<string, any>();
    messageCaches.set(tenantId, cache);
  }
  cache.set(id, message);
  if (cache.size > 1000) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
}

// Fix 3: In-flight guard — prevents double-socket creation on concurrent calls
const connectingTenants = new Set<string>();

// Fix 4: Per-tenant reconnect attempt counter for exponential backoff
const reconnectAttempts = new Map<string, number>();

// Fix 4: Schedule a reconnect with capped exponential backoff (1s → 2s → 4s … 60s max)
function scheduleReconnect(tenantId: string, io: any): void {
  const attempts = (reconnectAttempts.get(tenantId) ?? 0) + 1;
  reconnectAttempts.set(tenantId, attempts);
  const delay = Math.min(60_000, 1_000 * Math.pow(2, attempts - 1)) + Math.floor(Math.random() * 1000);
  console.log(`[Engine] Reconnect attempt ${attempts} for tenant ${tenantId} in ${Math.round(delay)}ms`);
  setTimeout(() => connectTenant(tenantId, io), delay);
}

/**
 * Updates delivery and read status for messages and updates broadcast campaign metrics.
 */
export async function handleMessageStatusUpdate(
  tenantId: string,
  channelMessageId: string,
  newStatus: 'DELIVERED' | 'READ' | 'FAILED',
  io: any,
  timestamp?: Date
) {
  try {
    const db = getTenantPrisma(tenantId, 'ADMIN');
    const now = timestamp || new Date();

    const message = await db.message.findFirst({
      where: {
        tenantId,
        OR: [
          { channelMessageId },
          { providerMessageId: channelMessageId },
        ],
      },
      include: {
        conversation: true,
      },
    });

    if (!message) return;

    // Enforce monotonic rank advancement: status must only advance (never downgrade)
    const STATUS_RANK: Record<string, number> = {
      SENT: 1,
      DELIVERED: 2,
      FAILED: 2,
      READ: 3,
    };

    const currentRank = STATUS_RANK[message.status] || 0;
    const newRank = STATUS_RANK[newStatus] || 0;

    if (currentRank > newRank) {
      return;
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'DELIVERED' && !message.deliveredAt) {
      updateData.deliveredAt = now;
    }
    if (newStatus === 'READ') {
      updateData.readAt = now;
      if (!message.deliveredAt) updateData.deliveredAt = now;
    }
    if (newStatus === 'FAILED' && !message.failedAt) {
      updateData.failedAt = now;
    }

    const updatedMsg = await db.message.update({
      where: { id: message.id },
      data: updateData,
    });

    console.log(`[Engine] Message ${message.id} (channelId: ${channelMessageId}) status updated to ${newStatus}`);

    // Emit live socket event
    io.to(`tenant_${tenantId}`).emit('message_updated', {
      messageId: message.id,
      conversationId: message.conversationId,
      status: newStatus,
      deliveredAt: updatedMsg.deliveredAt,
      readAt: updatedMsg.readAt,
    });

    // Check if this message was sent to a customer associated with a broadcast campaign
    if (message.conversation?.customerId) {
      const customerId = message.conversation.customerId;
      const recentJob = await db.broadcastJob.findFirst({
        where: {
          tenantId,
          customerId,
        },
        orderBy: { scheduledFor: 'desc' },
      });

      if (recentJob?.campaignId) {
        const campaignId = recentJob.campaignId;

        // Recalculate delivered count
        const deliveredJobs = await db.broadcastJob.findMany({
          where: { campaignId },
          select: { customerId: true },
        });
        const customerIds = deliveredJobs.map((j) => j.customerId);

        if (customerIds.length > 0) {
          const deliveredCount = await db.message.count({
            where: {
              tenantId,
              conversation: { customerId: { in: customerIds } },
              direction: 'OUTBOUND',
              status: { in: ['DELIVERED', 'READ'] },
            },
          });

          const readCount = await db.message.count({
            where: {
              tenantId,
              conversation: { customerId: { in: customerIds } },
              direction: 'OUTBOUND',
              status: 'READ',
            },
          });

          await db.broadcastCampaign.update({
            where: { id: campaignId },
            data: {
              delivered: Math.max(deliveredCount, 1),
              read: readCount,
            },
          });

          io.to(`tenant_${tenantId}`).emit('broadcast_stats_updated', {
            campaignId,
            delivered: Math.max(deliveredCount, 1),
            read: readCount,
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Engine] Failed to update message status for ${channelMessageId}:`, err);
  }
}

/**
 * Executes the AI Sales Agent response logic for a conversation.
 * Manages intake state gathering, product recommendations, and compliance rules.
 */
export async function runAIAgentAutoResponse(tenantId: string, conversationId: string, io: any) {
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // 1. Fetch conversation history
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: true,
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!conversation) return;

  // Retrieve last 15 messages for context
  const history = conversation.messages.slice(-15);

  // 2. Fetch or create active Lead for Customer
  let lead = await db.lead.findFirst({
    where: { customerId: conversation.customerId },
  });

  if (!lead) {
    lead = await db.lead.create({
      data: {
        tenantId,
        customerId: conversation.customerId,
        status: 'NEW',
        source: 'WHATSAPP_BOT',
      },
    });
  }

  // 3. Initialize AI Client
  let aiClient;
  try {
    aiClient = await getTenantAIClient(tenantId, true);
  } catch (err: any) {
    if (err.message === 'TrialLimitExceeded') {
      console.log(`[AI Agent] Trial limit exceeded for tenant ${tenantId}. Disabling auto-response toggle.`);
      
      // Auto-disable auto-response toggle in database
      await db.tenantAIConfig.upsert({
        where: { tenantId },
        create: { tenantId, provider: 'OPENAI', encryptedApiKey: '', isActive: false },
        update: { isActive: false },
      });

      // Emit status updates to inform agent dashboard banners
      io.to(`tenant_${tenantId}`).emit('whatsapp_status_update', { aiTrialExceeded: true });
      return;
    }
    throw err;
  }
  // 4. Gating and OpenClaw Turn Execution
  const isIntakeFlow = lead && (lead.status === 'NEW' || lead.status === 'APPLICATION_CAPTURED');
  let botReplyText = '';

  if (isIntakeFlow) {
    console.log(`[AI Agent] Executing OpenClaw IntakeQualificationSkill for lead ${lead.id}...`);
    const mappedHistory = history.map((m) => ({
      role: m.senderType === 'CUSTOMER' ? 'user' : 'assistant' as const,
      content: m.content,
    }));
    botReplyText = await IntakeQualificationSkill.runTurn({
      tenantId,
      lead,
      conversation,
      history: mappedHistory,
      aiClient,
      db,
      io,
    });
  } else {
    // Non-intake fallback: general warmth agent (RAG or basic response)
    const systemPrompt = `You are a professional insurance sales agent assisting a customer. Answer their questions warmly.`;
    const formattedMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: (m.senderType === 'CUSTOMER' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ];
    botReplyText = await aiClient.generateChat(formattedMessages);
  }

  // 7. Dispatch Response based on Channel
  if (botReplyText) {
    if (conversation.channel === 'WHATSAPP') {
      const sock = sessions.get(tenantId);
      if (sock) {
        try {
          let targetPhone = conversation.customer.primaryPhone;
          if (targetPhone && (targetPhone.includes(':') || targetPhone.length > 25)) {
            try {
              targetPhone = decrypt(targetPhone);
            } catch (err) {
              console.warn(`[AI Agent] Decryption warning for phone: ${targetPhone}`);
            }
          }
          const jid = toJid(targetPhone);

          // Outbound dispatch
          const result = await sock.sendMessage(jid, { text: botReplyText });

          // Save OUTBOUND message with senderType = BOT
          const dbMessage = await db.message.create({
            data: {
              tenantId,
              conversationId: conversation.id,
              direction: 'OUTBOUND',
              senderType: 'BOT',
              content: botReplyText,
              channel: 'WHATSAPP',
              channelMessageId: result?.key?.id || null,
            },
          });

          // Update conversation timestamp
          await db.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });

          // Emit new_message to Socket.io clients
          io.to(`tenant_${tenantId}`).emit('new_message', {
            conversationId: conversation.id,
            message: {
              id: dbMessage.id,
              content: dbMessage.content,
              direction: dbMessage.direction,
              senderType: dbMessage.senderType,
              createdAt: dbMessage.createdAt,
            },
          });
        } catch (err) {
          console.error('[AI Agent] Failed to dispatch WhatsApp bot reply:', err);
        }
      }
    } else if (conversation.channel === 'WEBCHAT') {
      try {
        // Save OUTBOUND message directly with senderType = BOT for webchat
        const dbMessage = await db.message.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            senderType: 'BOT',
            content: botReplyText,
            channel: 'WEBCHAT',
          },
        });

        // Update conversation timestamp
        await db.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });

        // Emit new_message to Socket.io clients (agent inbox and customer widget both listen)
        io.to(`tenant_${tenantId}`).emit('new_message', {
          conversationId: conversation.id,
          message: {
            id: dbMessage.id,
            content: dbMessage.content,
            direction: dbMessage.direction,
            senderType: dbMessage.senderType,
            createdAt: dbMessage.createdAt,
          },
        });
      } catch (err) {
        console.error('[AI Agent] Failed to dispatch WEBCHAT bot reply:', err);
      }
    }
  }
}

/**
 * Initializes and manages the Baileys connection for a specific tenant.
 * Listens to connection status updates, inbound messages, and syncs data to Neon PostgreSQL.
 */

/**
 * Initializes a Baileys connection for a tenant.
 * Follows OpenWA's proven patterns:
 *  - Fix 1: fetchLatestBaileysVersion() so WA servers accept the handshake
 *  - Fix 3: tear down previous socket listeners before creating a new one
 *  - Fix 3: in-flight guard via connectingTenants Set
 *  - Fix 4: exponential backoff on transient drops
 *  - Fix 5: clearDatabaseAuthState on loggedOut
 */
export async function connectTenant(tenantId: string, io: any, phoneNumber?: string) {
  // Fix 3: In-flight guard — skip if already connecting
  if (connectingTenants.has(tenantId)) {
    console.log(`[Engine] Connection already in progress for tenant: ${tenantId}`);
    return;
  }

  // If already CONNECTED and no phone override, return existing socket
  if (sessions.has(tenantId) && !phoneNumber) {
    console.log(`[Engine] Session already active for tenant: ${tenantId}`);
    return sessions.get(tenantId);
  }

  connectingTenants.add(tenantId);

  try {
    // Fix 3: Tear down previous socket cleanly before creating a new one.
    // This prevents listener accumulation (memory leak + duplicate events) on reconnect.
    const previous = sessions.get(tenantId);
    if (previous) {
      previous.ev.removeAllListeners('connection.update');
      previous.ev.removeAllListeners('creds.update');
      previous.ev.removeAllListeners('messages.upsert');
      previous.ev.removeAllListeners('messages.update');
      previous.ev.removeAllListeners('message-receipt.update');
      try { previous.end(undefined); } catch { /* already closed */ }
    }
    sessions.delete(tenantId);

    console.log(`[Engine] Initializing Baileys connection for tenant: ${tenantId}`);
    const db = getTenantPrisma(tenantId, 'ADMIN');

    const { state, saveCreds } = await getDatabaseAuthState(tenantId);

    // Fix 1: Fetch the live WhatsApp Web version from WA's servers.
    // Without this, Baileys uses a bundled/stale version which WA rejects with 405.
    let version: [number, number, number] = [2, 3000, 1015901307];
    try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
      console.log(`[Engine] Baileys version: ${version.join('.')}, isLatest: ${result.isLatest}`);
    } catch (e) {
      console.warn('[Engine] fetchLatestBaileysVersion failed, using fallback version:', e);
    }

    const retryMap = new Map<string, any>();
    const msgRetryCounterCache = {
      get: <T>(key: string): T | undefined => retryMap.get(key) as T | undefined,
      set: <T>(key: string, value: T): void => { retryMap.set(key, value); },
      del: (key: string) => { retryMap.delete(key); },
      flushAll: () => { retryMap.clear(); },
    };

    const sock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.windows('Chrome'),
      connectTimeoutMs: 60000,
      retryRequestDelayMs: 500,
      msgRetryCounterCache,
      getMessage: async (key) => {
        if (key.id) {
          const cached = messageCaches.get(tenantId)?.get(key.id);
          if (cached) return cached;
        }
        return undefined;
      }
    });

    sessions.set(tenantId, sock);
    sock.ev.on('creds.update', saveCreds);

    // Request Pairing Code if phone number provided
    if (phoneNumber && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
          const code = await sock.requestPairingCode(cleanPhone);
          console.log(`[Engine] Pairing Code for tenant ${tenantId}: ${code}`);
          pairingCodes.set(tenantId, code);
          io.to(`tenant_${tenantId}`).emit('whatsapp_pairing_code', { pairingCode: code });
        } catch (err) {
          console.error(`[Engine] Failed to generate pairing code for tenant ${tenantId}:`, err);
        }
      }, 2500);
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`[Engine] QR Code generated for tenant ${tenantId}`);
        try {
          const qrDataUrl = await qrcode.toDataURL(qr);
          qrCodes.set(tenantId, qrDataUrl);
          await db.whatsAppNumber.upsert({
            where: { tenantId },
            create: { tenantId, sessionData: '', status: 'QR_PENDING' },
            update: { status: 'QR_PENDING' },
          });
          io.to(`tenant_${tenantId}`).emit('whatsapp_qr', { qr: qrDataUrl });
        } catch (err) {
          console.error(`[Engine] Failed to emit QR for tenant ${tenantId}:`, err);
        }
      }

      if (connection === 'open') {
        console.log(`[Engine] WhatsApp connected for tenant ${tenantId}`);
        qrCodes.delete(tenantId);
        pairingCodes.delete(tenantId);
        // Fix 4: Reset backoff counter on successful connection
        reconnectAttempts.delete(tenantId);

        const phone = sock.user?.id.split(':')[0] || '';
        try {
          await db.whatsAppNumber.upsert({
            where: { tenantId },
            create: { tenantId, sessionData: '', status: 'CONNECTED', phoneNumber: encrypt(phone), lastConnectedAt: new Date() },
            update: { status: 'CONNECTED', phoneNumber: encrypt(phone), lastConnectedAt: new Date() },
          });
        } catch (err) {
          console.error(`[Engine] Failed to update CONNECTED status for tenant ${tenantId}:`, err);
        }
        io.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'CONNECTED', phoneNumber: phone });
      }

      if (connection === 'close') {
        const lastDisconnectError = lastDisconnect?.error as Boom | undefined;
        const statusCode = lastDisconnectError?.output?.statusCode;

        // 401/405 = loggedOut — terminal, wipe auth, no reconnect
        // 403 = banned — terminal, keep auth for inspection, no reconnect
        // 440 = connectionReplaced — terminal, no reconnect
        // 408/515/503/500/undefined = transient — reconnect with backoff
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 405 || statusCode === 401;
        const isForbidden = statusCode === 403;
        const isReplaced = statusCode === 440;
        const isTerminal = isLoggedOut || isForbidden || isReplaced;

        console.log(`[Engine] Connection closed for tenant ${tenantId}. Code: ${statusCode}, Terminal: ${isTerminal}`);

        sessions.delete(tenantId);

        if (isLoggedOut) {
          // Fix 5: Wipe auth state completely so next connect starts clean
          qrCodes.delete(tenantId);
          pairingCodes.delete(tenantId);
          reconnectAttempts.delete(tenantId);
          try {
            await clearDatabaseAuthState(tenantId);
          } catch (err) {
            console.error(`[Engine] Failed to clear auth state for tenant ${tenantId}:`, err);
          }
          io.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'DISCONNECTED' });

        } else if (isForbidden || isReplaced) {
          // Banned or replaced — terminal, do not wipe auth, do not reconnect
          console.log(`[Engine] Terminal close (${statusCode}) for tenant ${tenantId}. Manual intervention required.`);
          try {
            await db.whatsAppNumber.update({ where: { tenantId }, data: { status: 'DISCONNECTED' } }).catch(() => {});
          } catch { /* ignore */ }
          io.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'DISCONNECTED' });

        } else {
          // Fix 4: Transient drop — schedule reconnect with exponential backoff
          try {
            await db.whatsAppNumber.update({ where: { tenantId }, data: { status: 'DISCONNECTED' } }).catch(() => {});
          } catch { /* ignore */ }
          io.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'DISCONNECTED' });
          scheduleReconnect(tenantId, io);
        }
      }
    });

  // Handle inbound messages
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      if (msg.key.id && msg.message) {
        cacheMessage(tenantId, msg.key.id, msg.message);
      }
      
      const norm = WhatsAppNormalizer.normalizeBaileys(msg);
      if (!norm) continue;

      const fromJid = norm.remoteJid;
      if (!fromJid?.endsWith('@s.whatsapp.net')) continue;

      const rawPhone = fromJid.split('@')[0];
      const text = norm.text;

      if (!text && norm.messageType === 'TEXT') continue;

      console.log(`[Engine] Message event for tenant ${tenantId} (fromMe: ${norm.fromMe}) from/to ${rawPhone}: "${text}"`);

      // Run RLS-compliant database operations inside transaction
      try {
        let conversationId = '';
        let triggerAI = false;
        let createdMessage: any = null;

        await db.$transaction(async (tx) => {
          // 1. Identity Unification Check
          const customers = await tx.customer.findMany({ where: { tenantId } });
          let targetCustomer = null;
          const normRawPhone = rawPhone.replace(/[^\d]/g, '');
          const targetJid = toJid(rawPhone);

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
            } catch (e) {
              // Ignore failures
            }
          }

          // 2. Link or create Customer
          if (!targetCustomer) {
            targetCustomer = await tx.customer.create({
              data: {
                tenantId,
                displayName: norm.pushName || rawPhone,
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
                channelIdentifier: fromJid,
                channelMetadata: {},
              },
            });
          }

          // 3. Find or Create open Conversation
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

          // Check stop keyword configuration
          const botConfig = await tx.botConfig.findUnique({
            where: { tenantId }
          });
          const stopKeyword = botConfig?.stopKeyword || 'STOP';

          let isStopMessage = false;
          if (!norm.fromMe && text.trim().toUpperCase() === stopKeyword.toUpperCase()) {
            isStopMessage = true;
            conversation = await tx.conversation.update({
              where: { id: conversation.id },
              data: { automationEnabled: false }
            });
            console.log(`[Engine] STOP keyword detected. AI response disabled for conversation: ${conversation.id}`);
          }

          // 4. Save Message
          const direction = norm.fromMe ? 'OUTBOUND' : 'INBOUND';
          const senderType = norm.fromMe ? 'AGENT' : 'CUSTOMER';
          const messageStatus = norm.fromMe ? 'SENT' : 'READ';

          const message = await tx.message.create({
            data: {
              tenantId,
              conversationId: conversation.id,
              direction,
              senderType,
              content: text,
              channel: 'WHATSAPP',
              channelMessageId: norm.messageId,
              messageType: norm.messageType === 'OTHER' ? 'OTHER' : norm.messageType,
              status: messageStatus,
              contextMessageId: norm.contextMessageId || null,
            },
          });
          createdMessage = message;

          // 5. Emit new_message event via Socket.io
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
            },
          });

          // If inbound message from customer, check if they received a recent broadcast and increment replied metric
          if (!norm.fromMe && targetCustomer) {
            const recentJob = await tx.broadcastJob.findFirst({
              where: {
                tenantId,
                customerId: targetCustomer.id,
              },
              orderBy: { scheduledFor: 'desc' },
            });

            if (recentJob?.campaignId) {
              const allJobs = await tx.broadcastJob.findMany({
                where: { campaignId: recentJob.campaignId },
                select: { customerId: true },
              });
              const cIds = allJobs.map((j) => j.customerId);

              const repliedConversationsCount = await tx.conversation.count({
                where: {
                  tenantId,
                  customerId: { in: cIds },
                  messages: {
                    some: {
                      direction: 'INBOUND',
                      createdAt: { gte: recentJob.scheduledFor },
                    },
                  },
                },
              });

              await tx.broadcastCampaign.update({
                where: { id: recentJob.campaignId },
                data: { replied: Math.max(repliedConversationsCount, 1) },
              });

              io.to(`tenant_${tenantId}`).emit('broadcast_stats_updated', {
                campaignId: recentJob.campaignId,
                replied: Math.max(repliedConversationsCount, 1),
              });
            }
          }

          // Only trigger AI response if it's not fromMe, not a stop keyword, and automation is enabled on conversation
          if (!norm.fromMe && !isStopMessage && conversation.automationEnabled) {
            triggerAI = true;
          }
        }, { timeout: 20000 });

        if (triggerAI) {
          const config = await db.tenantAIConfig.findUnique({
            where: { tenantId },
          });

          if (config?.isActive && conversationId) {
            const msgId = createdMessage?.id || '';
            const job = await db.inboundMessageJob.upsert({
              where: { messageId: msgId },
              create: { tenantId, conversationId, messageId: msgId, status: 'PENDING' },
              update: {}, // noop — duplicate webhook delivery, original job retained
            });
            const isNew = job.createdAt >= new Date(Date.now() - 2000);
            if (isNew) {
              console.log(`[Engine] Enqueued inbound message job ${job.id} for conversation ${conversationId}`);
            } else {
              console.log(`[Engine] Duplicate messageId ${msgId} received — skipped re-enqueue`);
            }
          }
        }

      } catch (err) {
        console.error(`[Engine] Database transaction failed for message event from/to ${rawPhone}:`, err);
      }
    }
  });

  // Handle message updates & delivery/read receipts
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      const msgId = update.key?.id;
      if (!msgId) continue;

      const statusVal = update.update?.status as any;
      if (statusVal === 3 || statusVal === 'DELIVERY_ACK') {
        await handleMessageStatusUpdate(tenantId, msgId, 'DELIVERED', io);
      } else if (statusVal === 4 || statusVal === 5 || statusVal === 'READ' || statusVal === 'PLAYED') {
        await handleMessageStatusUpdate(tenantId, msgId, 'READ', io);
      } else if (statusVal === 0 || statusVal === 'ERROR') {
        await handleMessageStatusUpdate(tenantId, msgId, 'FAILED', io);
      }
    }
  });

  sock.ev.on('message-receipt.update', async (receipts) => {
    for (const r of receipts) {
      const msgId = r.key?.id;
      if (!msgId) continue;

      if (r.receipt?.readTimestamp) {
        const readDate = new Date(Number(r.receipt.readTimestamp) * 1000);
        await handleMessageStatusUpdate(tenantId, msgId, 'READ', io, readDate);
      } else {
        await handleMessageStatusUpdate(tenantId, msgId, 'DELIVERED', io);
      }
    }
  });

    return sock;
  } finally {
    // Fix 3: Release in-flight guard so future calls can reconnect
    connectingTenants.delete(tenantId);
  }
}

let workerActive = false;

export function startInboundJobWorker(io: any) {
  if (workerActive) return;
  workerActive = true;
  console.log('[Inbound Worker] Starting database-backed queue poll loop...');

  setInterval(async () => {
    try {
      const job = await prisma.inboundMessageJob.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });

      if (!job) return;

      await prisma.inboundMessageJob.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' },
      });

      console.log(`[Inbound Worker] Processing job ${job.id} for conversation ${job.conversationId}...`);
      
      try {
        await runAIAgentAutoResponse(job.tenantId, job.conversationId, io);
        
        await prisma.inboundMessageJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', processedAt: new Date() },
        });
      } catch (err: any) {
        console.error(`[Inbound Worker] Job ${job.id} failed:`, err);
        const attempts = job.attempts + 1;
        await prisma.inboundMessageJob.update({
          where: { id: job.id },
          data: {
            status: attempts >= 3 ? 'FAILED' : 'PENDING',
            attempts,
            lastError: err?.message || String(err),
          },
        });
      }
    } catch (err) {
      console.error('[Inbound Worker] Poller encountered error:', err);
    }
  }, 2000);
}

