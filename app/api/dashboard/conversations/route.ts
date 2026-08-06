import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const conversations = await db.conversation.findMany({
      where: { tenantId },
      include: {
        customer: {
          select: {
            id: true,
            displayName: true,
            primaryPhone: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    const formatted = await Promise.all(
      conversations.map(async (conv) => {
        let phone = 'Unknown';
        try {
          phone = decrypt(conv.customer.primaryPhone);
        } catch {
          // Ignore decryption error
        }

        // Fetch last message for preview
        const lastMsg = await db.message.findFirst({
          where: { conversationId: conv.id, tenantId },
          orderBy: { createdAt: 'desc' },
        });

        // Fetch last inbound message from customer for 24h session window tracking
        const lastInbound = await db.message.findFirst({
          where: {
            conversationId: conv.id,
            direction: 'INBOUND',
            tenantId,
          },
          orderBy: { createdAt: 'desc' },
        });

        // Retrieve customer's latest lead stage
        const lead = await db.lead.findFirst({
          where: { customerId: conv.customer.id, tenantId },
          orderBy: { createdAt: 'desc' },
        });

        return {
          id: conv.id,
          status: conv.status,
          lastMessageAt: conv.lastMessageAt,
          needsEscalation: conv.needsEscalation,
          assignedAgentId: conv.assignedAgentId,
          lastMessagePreview: lastMsg?.content || '',
          lastInboundMessageAt: lastInbound?.createdAt || null,
          customer: {
            id: conv.customer.id,
            displayName: conv.customer.displayName,
            phone,
            pipelineStage: lead?.status || 'NEW',
            intake: lead ? {
              age: lead.intakeAge,
              state: lead.intakeState,
              budgetMin: lead.intakeBudgetMin ? lead.intakeBudgetMin / 100 : null,
              budgetMax: lead.intakeBudgetMax ? lead.intakeBudgetMax / 100 : null,
              familySize: lead.intakeFamilySize,
              healthConditions: lead.intakeHealthConditions ? (
                typeof lead.intakeHealthConditions === 'string' 
                  ? lead.intakeHealthConditions 
                  : JSON.stringify(lead.intakeHealthConditions)
              ) : 'None',
            } : null,
          },
        };
      })
    );

    return NextResponse.json(formatted);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { conversationId, needsEscalation } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // Update conversation RLS context
    const updated = await db.conversation.update({
      where: { id: conversationId, tenantId },
      data: {
        needsEscalation: !!needsEscalation,
        assignedAgentId: needsEscalation ? userId : null,
      },
    });

    // Write to audit log for compliance
    await db.auditLog.create({
      data: {
        userId,
        tenantId,
        action: needsEscalation ? 'AGENT_TAKEOVER' : 'AI_HANDLING_RESUMED',
        metadata: { conversationId },
      },
    });

    return NextResponse.json({
      success: true,
      needsEscalation: updated.needsEscalation,
      assignedAgentId: updated.assignedAgentId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update conversation handler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
