import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import qrcode from 'qrcode';
import { getTenantPrisma, prisma } from '../lib/db/index';
import { decrypt } from '../lib/encryption';
import { connectTenant, sessions, qrCodes, pairingCodes, startInboundJobWorker } from './engine-logic';
import { connectTenantOpenWA, openwaSessions, openwaQrCodes } from './openwa-logic';
import { MessageService } from './MessageService';
import { TransportManager } from './transport/TransportManager';

const app = express();
app.use(cors());
app.use(express.json());

process.on('uncaughtException', (err: any) => {
  console.warn('[WhatsApp Engine] Process exception handled:', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[WhatsApp Engine] Unhandled promise rejection handled:', reason?.message || reason);
});

const server = http.createServer(app);

// Initialize Socket.io Server with CORS matching localhost dashboard
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Socket.io connection pipeline
io.on('connection', (socket) => {
  console.log('[Socket] Client connected to whatsapp engine');
  const tenantId = socket.handshake.query.tenantId as string;
  if (tenantId) {
    socket.join(`tenant_${tenantId}`);
    console.log(`[Socket] Client joined room: tenant_${tenantId}`);
  }

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected');
  });
});

// Import & Mount Meta Cloud API Webhook router
import { createMetaWebhookRouter } from './routes/metaWebhook';
app.use(createMetaWebhookRouter(io));

// REST API: Initiate Connection & return QR Code / Pairing Code
app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    const { tenantId, engine, phoneNumber, method } = req.body;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const useOpenWA = engine === 'OPENWA' || process.env.WA_ENGINE === 'OPENWA';

    const db = getTenantPrisma(tenantId, 'ADMIN');
    // Check if session is already connected
    const session = await db.whatsAppNumber.findUnique({
      where: { tenantId },
    });

    if (session?.status === 'CONNECTED' && (sessions.has(tenantId) || openwaSessions.has(tenantId))) {
      return res.json({ status: 'CONNECTED' });
    }

    if (useOpenWA) {
      connectTenantOpenWA(tenantId, io).catch((e) => console.error('[OpenWA Engine] Error:', e));
      const openwaQr = openwaQrCodes.get(tenantId);
      if (openwaQr) {
        return res.json({ status: 'QR_PENDING', qr: openwaQr, engine: 'OPENWA' });
      }
      return res.json({ status: 'INITIALIZING', engine: 'OPENWA', message: 'Generating OpenWA QR code, please wait...' });
    }

    // Trigger Baileys socket connection (asynchronously)
    connectTenant(tenantId, io, phoneNumber);

    if (method === 'PHONE' && phoneNumber) {
      const code = pairingCodes.get(tenantId);
      if (code) {
        return res.json({ status: 'PAIRING_CODE_PENDING', pairingCode: code, engine: 'BAILEYS' });
      }
      return res.json({ status: 'INITIALIZING', engine: 'BAILEYS', message: 'Generating pairing code, please wait...' });
    }

    // Wait a brief moment or check if a QR code is ready in-memory
    const qrRaw = qrCodes.get(tenantId);
    if (qrRaw) {
      const qrDataUrl = qrRaw.startsWith('data:image') ? qrRaw : await qrcode.toDataURL(qrRaw);
      return res.json({ status: 'QR_PENDING', qr: qrDataUrl, engine: 'BAILEYS' });
    }

    return res.json({ status: 'INITIALIZING', engine: 'BAILEYS', message: 'Generating QR code, please wait...' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown connection error';
    return res.status(500).json({ error: msg });
  }
});

// REST API: Get Status
app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const db = getTenantPrisma(tenantId, 'ADMIN');
    const session = await db.whatsAppNumber.findUnique({
      where: { tenantId },
    });

    if (!session) {
      return res.json({ status: 'DISCONNECTED' });
    }

    let phone = null;
    if (session.phoneNumber) {
      try {
        phone = decrypt(session.phoneNumber);
      } catch (e) {
        // Ignore decryption error
      }
    }

    return res.json({
      status: session.status,
      phoneNumber: phone,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown status error';
    return res.status(500).json({ error: msg });
  }
});


// REST API: Disconnect WhatsApp Session
app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const sock = sessions.get(tenantId);
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        // Ignore logout error
      }
      sessions.delete(tenantId);
    }
    qrCodes.delete(tenantId);
    pairingCodes.delete(tenantId);

    const db = getTenantPrisma(tenantId, 'ADMIN');
    await db.whatsAppNumber.upsert({
      where: { tenantId },
      create: { tenantId, sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
      update: { sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
    });

    io.to(`tenant_${tenantId}`).emit('whatsapp_status', { status: 'DISCONNECTED' });
    return res.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Disconnect failed';
    return res.status(500).json({ error: msg });
  }
});


// REST API: Outbound Send Message (MIME-aware, idempotent via MessageService)
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { tenantId, to, text, mediaId, mimeType, clientMessageId, conversationId } = req.body;
    if (!tenantId || !to || !conversationId) {
      return res.status(400).json({ error: 'tenantId, to, and conversationId are required' });
    }
    if (!text && !mediaId) {
      return res.status(400).json({ error: 'Either text or mediaId is required' });
    }

    // Ensure an active session exists (Baileys or OpenWA)
    let hasSession = sessions.has(tenantId) || openwaSessions.has(tenantId);
    if (!hasSession) {
      try {
        const db = getTenantPrisma(tenantId, 'ADMIN');
        const sessionRecord = await db.whatsAppNumber.findUnique({ where: { tenantId } });
        if (sessionRecord?.status === 'CONNECTED') {
          console.log(`[Engine] Auto-connecting tenant ${tenantId} session for outbound send...`);
          connectTenant(tenantId, io);
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 200));
            if (sessions.has(tenantId) || openwaSessions.has(tenantId)) {
              hasSession = true;
              break;
            }
          }
        }
      } catch (e) {
        console.warn(`[Engine] Auto-connect attempt failed for tenant ${tenantId}:`, e);
      }
    }

    if (!hasSession) {
      return res.status(400).json({ error: 'WhatsApp session is not active for this tenant. Please connect WhatsApp from Settings.' });
    }

    const result = await MessageService.sendMessage(tenantId, {
      to,
      text,
      mediaId,
      mimeType,
      clientMessageId,
      conversationId,
    }, io);

    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown outbound send error';
    return res.status(500).json({ error: msg });
  }
});

// REST API: Typing Indicator
app.post('/api/whatsapp/typing', async (req, res) => {
  try {
    const { tenantId, to, on } = req.body;
    if (!tenantId || !to) {
      return res.status(400).json({ error: 'tenantId and to are required' });
    }
    const transport = TransportManager.getTransport(tenantId);
    await transport.setTyping(to, on !== false);
    return res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Typing indicator error';
    return res.status(500).json({ error: msg });
  }
});
// REST API: Webchat Inbound Event Hook (Trigger AI response pipeline and broadcast)
app.post('/api/whatsapp/webchat/inbound', async (req, res) => {
  try {
    const { tenantId, conversationId, text, messageId } = req.body;
    if (!tenantId || !conversationId || !text || !messageId) {
      return res.status(400).json({ error: 'tenantId, conversationId, text, and messageId are required' });
    }

    // 1. Emit the message event instantly to the socket room (for real-time widget UI update)
    io.to(`tenant_${tenantId}`).emit('new_message', {
      conversationId,
      message: {
        id: messageId,
        content: text,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        createdAt: new Date(),
      },
    });

    const db = getTenantPrisma(tenantId, 'ADMIN');

    // 2. Fetch bot config to see if auto-response is active
    const config = await db.tenantAIConfig.findUnique({
      where: { tenantId },
    });

    if (config?.isActive) {
      await db.inboundMessageJob.create({
        data: {
          tenantId,
          conversationId,
          messageId,
          status: 'PENDING',
        },
      });
      console.log(`[Webchat] Enqueued inbound message job for conversation ${conversationId}`);
    }

    return res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown inbound webchat handler error';
    return res.status(500).json({ error: msg });
  }
});

// REST API: Generic Socket.io Emit Gateway (Allows Next.js APIs to trigger dashboard events)
app.post('/api/whatsapp/emit', async (req, res) => {
  try {
    const { tenantId, event, data } = req.body;
    if (!tenantId || !event) {
      return res.status(400).json({ error: 'tenantId and event are required' });
    }
    io.to(`tenant_${tenantId}`).emit(event, data);
    return res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Emit error';
    return res.status(500).json({ error: msg });
  }
});

// Boot Server on port 3001
const PORT = 3001;
server.listen(PORT, async () => {
  console.log(`=========================================`);
  console.log(`WhatsApp Engine running on port ${PORT}`);
  console.log(`=========================================`);
  startInboundJobWorker(io);

  // Restore active connected sessions on startup
  try {
    const activeSessions = await prisma.whatsAppNumber.findMany({
      where: { status: 'CONNECTED' },
    });
    console.log(`[Engine] Found ${activeSessions.length} active sessions to restore on startup.`);
    for (const session of activeSessions) {
      if (session.tenantId) {
        console.log(`[Engine] Restoring connection for tenant ${session.tenantId}`);
        connectTenant(session.tenantId, io);
      }
    }
  } catch (err) {
    console.warn('[Engine] Startup session restore warning:', err);
  }
});
