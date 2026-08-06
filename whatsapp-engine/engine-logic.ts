import makeWASocket, { DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import { getTenantPrisma } from '../lib/db/index';
import { decrypt, encrypt } from '../lib/encryption';
import { getDatabaseAuthState, clearDatabaseAuthState } from './auth-state';
import { getTenantAIClient } from '../lib/ai/client';
import pino from 'pino';
import { Boom } from '@hapi/boom';

export const sessions = new Map<string, any>();
export const qrCodes = new Map<string, string>();
export const pairingCodes = new Map<string, string>();

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
    aiClient = await getTenantAIClient(tenantId);
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

  // 4. Construct Chat Message Logs
  const systemPrompt = `You are a professional insurance sales agent assisting a lead over WhatsApp.
Your goal is to politely guide the conversation to collect the following 5 qualification details for health/life coverage:
1. Age (must be a number)
2. US State of residence (2-letter abbreviation)
3. Pre-existing health conditions (if none, write None)
4. Monthly premium budget (min and max monthly amount in dollars, e.g. $100 to $250)
5. Family size (number of family members to be covered, including themselves)

Be warm, conversational, and direct. Ask for these inputs one by one or naturally.
If you have collected all 5 fields, or the user has provided them, you must append this special JSON block at the very end of your response:
[[INTAKE_DATA:{"age":35,"state":"TX","healthConditions":"None","budgetMin":100,"budgetMax":250,"familySize":1}]]

Do not invent pre-populated values unless the user specified them. Keep asking questions until you have all 5 values.`;

  const formattedMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.senderType === 'CUSTOMER' ? 'user' : 'assistant',
      content: m.content,
    })),
  ];

  // 5. Generate AI Response
  console.log(`[AI Agent] Generating response for conversation ${conversationId}...`);
  let botReplyText = await aiClient.generateChat(formattedMessages);

  // 6. Check for Intake Completion JSON Tag
  if (botReplyText.includes('[[INTAKE_DATA:')) {
    try {
      const parts = botReplyText.split('[[INTAKE_DATA:');
      const textReply = parts[0].trim();
      const rawJson = parts[1].split(']]')[0].trim();
      const intakeData = JSON.parse(rawJson);

      console.log(`[AI Agent] Intake complete for lead ${lead.id}:`, intakeData);

      // Save intake fields and transition Lead status to QUALIFIED
      await db.lead.update({
        where: { id: lead.id },
        data: {
          intakeAge: intakeData.age,
          intakeState: intakeData.state.toUpperCase(),
          intakeHealthConditions: intakeData.healthConditions,
          intakeBudgetMin: intakeData.budgetMin * 100, // stored in cents
          intakeBudgetMax: intakeData.budgetMax * 100, // stored in cents
          intakeFamilySize: intakeData.familySize,
          status: 'QUALIFIED',
        },
      });

      // Search matching policies in PolicyCatalog
      const parsedState = intakeData.state.toUpperCase();
      const budgetMinCents = intakeData.budgetMin * 100;
      const budgetMaxCents = intakeData.budgetMax * 100;

      const matchingPolicies = await db.policyCatalogItem.findMany({
        where: {
          active: true,
          states: {
            has: parsedState,
          },
          premiumMin: {
            lte: budgetMaxCents,
          },
          premiumMax: {
            gte: budgetMinCents,
          },
        },
        take: 4,
      });

      // Save recommended plan IDs
      const recIds = matchingPolicies.map((p) => p.id);
      await db.lead.update({
        where: { id: lead.id },
        data: { recommendedPolicyIds: recIds },
      });

      // Format recommendation payload for final plain language explanation
      let policiesPrompt = `I have qualified the lead and matched the following matching policies in the catalog:\n`;
      if (matchingPolicies.length === 0) {
        policiesPrompt += `No matching policies found for state ${parsedState} and budget $${intakeData.budgetMin}-$${intakeData.budgetMax}.\n`;
      } else {
        for (const p of matchingPolicies) {
          policiesPrompt += `- Plan: ${p.name}, Insurer: ${p.insurerName}, Monthly Premium: $${(p.premiumMin / 100).toFixed(2)}-$${(p.premiumMax / 100).toFixed(2)}, Sum Insured: $${(p.sumInsured / 100).toLocaleString()}, Summary: ${p.extractedSummary}\n`;
        }
      }
      policiesPrompt += `\nPlease explain these options to the user in a very warm, plain language summary (premiums, sum insured, exclusions, waiting periods). Make sure to ask which plan they want to select.`;

      // Call AI client for the final recommendation explanation
      console.log(`[AI Agent] Explaining matched policies to lead...`);
      botReplyText = await aiClient.generateChat([
        ...formattedMessages,
        { role: 'assistant', content: textReply },
        { role: 'user', content: policiesPrompt },
      ]);

    } catch (e) {
      console.error('[AI Agent] Failed to parse intake data or match policies:', e);
    }
  }

  // 7. Dispatch Response based on Channel
  if (botReplyText) {
    if (conversation.channel === 'WHATSAPP') {
      const sock = sessions.get(tenantId);
      if (sock) {
        try {
          const cleanPhone = decrypt(conversation.customer.primaryPhone).replace(/[^0-9]/g, '');
          const jid = `${cleanPhone}@s.whatsapp.net`;

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

    const sock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.windows('Chrome'),
      connectTimeoutMs: 60000,
      retryRequestDelayMs: 500,
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
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;

      const fromJid = msg.key.remoteJid;
      if (!fromJid?.endsWith('@s.whatsapp.net')) continue;

      const rawPhone = fromJid.split('@')[0];
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

      if (!text) continue;

      console.log(`[Engine] Inbound WhatsApp message for tenant ${tenantId} from ${rawPhone}: "${text}"`);

      // Run RLS-compliant database operations inside transaction
      try {
        let conversationId = '';

        await db.$transaction(async (tx) => {
          // 1. Identity Unification Check
          const customers = await tx.customer.findMany();
          let targetCustomer = null;

          for (const c of customers) {
            try {
              const decPhone = decrypt(c.primaryPhone);
              if (decPhone === rawPhone) {
                targetCustomer = c;
                break;
              }
            } catch (e) {
              // Ignore decryption failures
            }
          }

          // 2. Link or create Customer
          if (!targetCustomer) {
            targetCustomer = await tx.customer.create({
              data: {
                tenantId,
                displayName: msg.pushName || rawPhone,
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

          // 4. Save Message
          const message = await tx.message.create({
            data: {
              tenantId,
              conversationId: conversation.id,
              direction: 'INBOUND',
              senderType: 'CUSTOMER',
              content: text,
              channel: 'WHATSAPP',
              channelMessageId: msg.key.id,
            },
          });

          // 5. Emit new_message event via Socket.io
          io.to(`tenant_${tenantId}`).emit('new_message', {
            conversationId: conversation.id,
            message: {
              id: message.id,
              content: message.content,
              direction: message.direction,
              senderType: message.senderType,
              createdAt: message.createdAt,
            },
          });
        }, { timeout: 20000 });

        // Trigger AI auto-response if configured and active
        const config = await db.tenantAIConfig.findUnique({
          where: { tenantId },
        });

        if (config?.isActive && conversationId) {
          runAIAgentAutoResponse(tenantId, conversationId, io).catch((err) => {
            console.error(`[AI Agent] Auto response pipeline failed for tenant ${tenantId}:`, err);
          });
        }

      } catch (err) {
        console.error(`[Engine] Database transaction failed for inbound message from ${rawPhone}:`, err);
      }
    }
  });

    return sock;
  } finally {
    // Fix 3: Release in-flight guard so future calls can reconnect
    connectingTenants.delete(tenantId);
  }
}
