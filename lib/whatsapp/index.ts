import { getTenantPrisma } from '@/lib/db';

export interface SendWhatsAppArgs {
  tenantId: string;
  customerId: string;
  text: string;
  campaignId?: string;
  broadcastJobId?: string;
}

/**
 * Server-side helper to send WhatsApp messages from the Next.js app.
 * Directs the outbound send to the standalone whatsapp-engine service,
 * checking and enforcing Customer.optedIn compliance for broadcast campaigns.
 */
export async function sendWhatsAppMessage({
  tenantId,
  customerId,
  text,
  campaignId,
  broadcastJobId,
}: SendWhatsAppArgs) {
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // 1. Fetch Customer Details
  const customer = await db.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  // 2. Broadcast Compliance Opt-in Check
  if (campaignId) {
    if (!customer.optedIn) {
      console.log(`[Compliance] Skipping broadcast send to customer ${customerId} (optedIn = false).`);

      if (broadcastJobId) {
        // Mark the broadcast job as SKIPPED_OPTED_OUT in database
        await db.broadcastJob.update({
          where: { id: broadcastJobId },
          data: {
            status: 'SKIPPED_OPTED_OUT',
            processedAt: new Date(),
          },
        });
      }
      return { success: false, status: 'SKIPPED_OPTED_OUT' };
    }
  }

  // 3. Find or Create Conversation
  let conversation = await db.conversation.findFirst({
    where: {
      customerId: customer.id,
      channel: 'WHATSAPP',
      status: 'OPEN',
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

  // 4. Send Message via whatsapp-engine HTTP Service
  const res = await fetch('http://localhost:3001/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      to: customer.primaryPhone, // Encrypted string, engine will decrypt
      text,
      conversationId: conversation.id,
    }),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to send WhatsApp message via engine.');
  }

  const data = await res.json();

  // If a broadcast job was passed and succeeded, mark it as SENT
  if (broadcastJobId) {
    await db.broadcastJob.update({
      where: { id: broadcastJobId },
      data: {
        status: 'SENT',
        processedAt: new Date(),
      },
    });
  }

  return { success: true, messageId: data.messageId, conversationId: conversation.id };
}
