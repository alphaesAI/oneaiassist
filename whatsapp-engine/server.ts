import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import qrcode from 'qrcode';
import { prisma, getTenantPrisma } from '../lib/db/index';
import { decrypt, encrypt } from '../lib/encryption';
import { connectTenant, sessions, qrCodes, pairingCodes } from './engine-logic';
import { connectTenantOpenWA, openwaSessions, openwaQrCodes } from './openwa-logic';

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


// REST API: Outbound Send Message
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { tenantId, to, text, conversationId } = req.body;
    if (!tenantId || !to || !text || !conversationId) {
      return res.status(400).json({ error: 'tenantId, to, text, and conversationId are required' });
    }

    const sock = sessions.get(tenantId);
    if (!sock) {
      return res.status(400).json({ error: 'WhatsApp session is not active for this tenant.' });
    }

    const db = getTenantPrisma(tenantId, 'ADMIN');

    // Decrypt recipient phone number if it is encrypted in DB
    let targetPhone = to;
    if (to.includes(':')) {
      try {
        targetPhone = decrypt(to);
      } catch (e) {
        // Treat as raw phone number if decryption fails
      }
    }

    // Clean phone number format for Baileys JID (e.g. "1234567890@s.whatsapp.net")
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    console.log(`[Engine] Sending outbound message to ${jid} for tenant ${tenantId}: "${text}"`);

    // Send via Baileys WASocket
    const result = await sock.sendMessage(jid, { text });

    // Save outbound message to DB (RLS-compliant)
    const dbMessage = await db.message.create({
      data: {
        tenantId,
        conversationId,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        content: text,
        channel: 'WHATSAPP',
        channelMessageId: result?.key?.id || null,
      },
    });

    // Update conversation timestamp
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Emit live Socket.io update to notify agent browser threads
    io.to(`tenant_${tenantId}`).emit('new_message', {
      conversationId,
      message: {
        id: dbMessage.id,
        content: dbMessage.content,
        direction: dbMessage.direction,
        senderType: dbMessage.senderType,
        createdAt: dbMessage.createdAt,
      },
    });

    return res.json({ success: true, messageId: dbMessage.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown outbound send error';
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
      // Trigger AI Agent auto-response loop asynchronously
      const { runAIAgentAutoResponse } = require('./engine-logic');
      runAIAgentAutoResponse(tenantId, conversationId, io).catch((err: any) => {
        console.error(`[AI Agent] Auto-reply error on webchat for tenant ${tenantId}:`, err);
      });
    }

    return res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown inbound webchat handler error';
    return res.status(500).json({ error: msg });
  }
});

// Boot Server on port 3001
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`WhatsApp Engine running on port ${PORT}`);
  console.log(`=========================================`);
});
