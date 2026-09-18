import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { LeadStatus } from '@prisma/client';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const customerId = params.id;

    const { action, value } = await req.json();

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    if (action === 'move_stage') {
      // Find the latest lead for the customer
      const latestLead = await db.lead.findFirst({
        where: { customerId, tenantId },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestLead) {
        return NextResponse.json({ error: 'No active lead found for this customer' }, { status: 404 });
      }

      const updatedLead = await db.lead.update({
        where: { id: latestLead.id, tenantId },
        data: { status: value as LeadStatus },
      });

      return NextResponse.json({ success: true, lead: updatedLead });
    }

    if (action === 'assign_agent') {
      // Assign agent to both the latest Lead and active Conversation (if present)
      const latestLead = await db.lead.findFirst({
        where: { customerId, tenantId },
        orderBy: { createdAt: 'desc' },
      });

      if (latestLead) {
        await db.lead.update({
          where: { id: latestLead.id, tenantId },
          data: { assignedAgentId: value || null },
        });
      }

      const latestConv = await db.conversation.findFirst({
        where: { customerId, tenantId },
        orderBy: { createdAt: 'desc' },
      });

      if (latestConv) {
        await db.conversation.update({
          where: { id: latestConv.id, tenantId },
          data: { assignedAgentId: value || null },
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'send_message') {
      if (!value || !value.trim()) {
        return NextResponse.json({ error: 'Message content cannot be empty' }, { status: 400 });
      }

      // 1. Fetch the customer's encrypted phone number
      const customer = await db.customer.findUnique({
        where: { id: customerId },
        select: { primaryPhone: true },
      });

      if (!customer?.primaryPhone) {
        return NextResponse.json({ error: 'Customer phone number not found' }, { status: 404 });
      }

      // 2. Decrypt phone if it is stored encrypted
      let phone = customer.primaryPhone;
      try {
        phone = decrypt(customer.primaryPhone);
      } catch {
        // Already plaintext if decryption fails
      }

      // 3. Find or create the active conversation for this customer
      let conversation = await db.conversation.findFirst({
        where: { customerId, status: 'OPEN', tenantId },
        orderBy: { lastMessageAt: 'desc' },
      });

      if (!conversation) {
        conversation = await db.conversation.create({
          data: {
            tenantId,
            customerId,
            channel: 'WHATSAPP',
            status: 'OPEN',
          },
        });
      }

      // 4. Call the WhatsApp engine to actually deliver the message
      const baseUrl = process.env.WHATSAPP_ENGINE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
      const engineRes = await fetch(`${baseUrl}/api/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          to: phone,
          text: value.trim(),
          conversationId: conversation.id,
        }),
      });

      if (!engineRes.ok) {
        const engineErr = await engineRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: engineErr.error || 'WhatsApp engine failed to send the message. Is the session connected?' },
          { status: engineRes.status }
        );
      }

      const engineData = await engineRes.json();

      // 5. Update conversation timestamp (message recording is done by the engine)
      await db.conversation.update({
        where: { id: conversation.id, tenantId },
        data: { lastMessageAt: new Date() },
      });

      return NextResponse.json({ success: true, messageId: engineData.messageId });
    }

    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
