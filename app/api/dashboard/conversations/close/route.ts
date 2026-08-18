import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { getTenantAIClient } from '@/lib/ai/client';

/**
 * Benchmarked against ForgeChat2 agentCloseSummary.js service:
 * When closing a conversation thread, generates a 2-sentence AI summary of customer intent,
 * resolution, and next steps, inserting it as an internal system note.
 */
export async function POST(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { conversationId } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // 1. Fetch conversation & recent messages
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId, tenantId },
      include: { customer: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messages = await db.message.findMany({
      where: { conversationId, tenantId },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });

    // 2. Generate AI Summary using Tenant AI Client
    let closeSummary = 'Conversation closed by agent.';
    try {
      const aiClient = await getTenantAIClient(tenantId, true);
      const conversationText = messages
        .map((m) => `${m.senderType}: ${m.content}`)
        .join('\n');

      const summaryPrompt = `You are a customer service AI auditor. Below is a WhatsApp conversation log between a customer (${conversation.customer.displayName}) and an agent/bot.
Provide a concise 2-sentence summary of the customer's request, the resolution provided, and any open follow-up actions.

Conversation Log:
${conversationText}

Summary (2 sentences):`;

      const response = await aiClient.generateChat([
        { role: 'user', content: summaryPrompt },
      ]);
      if (response && response.trim()) {
        closeSummary = response.trim();
      }
    } catch (err) {
      console.warn('[AI Close Summary] Could not generate AI summary, using default:', err);
    }

    // 3. Mark conversation as CLOSED
    const updated = await db.conversation.update({
      where: { id: conversationId, tenantId },
      data: { status: 'CLOSED' },
    });

    // 4. Insert System Note Message
    const summaryMessage = await db.message.create({
      data: {
        tenantId,
        conversationId,
        direction: 'OUTBOUND',
        senderType: 'BOT',
        content: `📌 AI Close Summary: ${closeSummary}`,
        channel: 'WHATSAPP',
        messageType: 'OTHER',
        status: 'READ',
      },
    });

    // 5. Audit Log
    await db.auditLog.create({
      data: {
        userId,
        tenantId,
        action: 'CONVERSATION_CLOSED',
        metadata: { conversationId, closeSummary },
      },
    });

    return NextResponse.json({
      success: true,
      status: updated.status,
      summary: closeSummary,
      summaryMessage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to close conversation';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
