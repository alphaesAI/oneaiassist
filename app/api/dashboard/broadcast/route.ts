import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const url = new URL(req.url);
    if (url.searchParams.get('preview') === 'true') {
      const type = url.searchParams.get('type') || 'all';
      const value = url.searchParams.get('value') || '';
      const start = url.searchParams.get('start') || '';
      const end = url.searchParams.get('end') || '';

      // Count opted out
      const optedOutCount = await db.customer.count({
        where: { tenantId, NOT: { optedOutAt: null } }
      });

      // Filter query matching target
      let whereClause: any = { tenantId, optedOutAt: null };

      if (type === 'tag' && value) {
        whereClause.tags = { has: value };
      } else if (type === 'stage' && value) {
        whereClause.leads = {
          some: {
            status: value,
          },
        };
      } else if (type === 'date_range' && start && end) {
        whereClause.createdAt = {
          gte: new Date(start),
          lte: new Date(end),
        };
      }

      const recipientCount = await db.customer.count({
        where: whereClause
      });

      return NextResponse.json({ recipientCount, optedOutCount });
    }

    const campaigns = await db.broadcastCampaign.findMany({
      where: { tenantId },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(campaigns);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const { name, templateId, recipientFilter, scheduledAt } = body;

    if (!name || !templateId || !recipientFilter) {
      return NextResponse.json(
        { error: 'Campaign name, template ID, and recipient filters are required' },
        { status: 400 }
      );
    }

    // 1. Fetch template
    const template = await db.template.findUnique({
      where: { id: templateId, tenantId },
    });
    if (!template) {
      return NextResponse.json({ error: 'WhatsApp template not found' }, { status: 404 });
    }

    // 2. Query target customers based on recipient filter
    let whereClause: any = { tenantId, optedOutAt: null };

    if (recipientFilter.type === 'tag' && recipientFilter.value) {
      whereClause.tags = { has: recipientFilter.value };
    } else if (recipientFilter.type === 'stage' && recipientFilter.value) {
      whereClause.leads = {
        some: {
          status: recipientFilter.value,
        },
      };
    } else if (recipientFilter.type === 'date_range' && recipientFilter.value) {
      const { start, end } = recipientFilter.value;
      if (start && end) {
        whereClause.createdAt = {
          gte: new Date(start),
          lte: new Date(end),
        };
      }
    }

    const customers = await db.customer.findMany({
      where: whereClause,
      include: {
        activePolicy: true,
      },
    });

    // 3. Compute cost estimate based on meta pricing tiers
    let pricePerMessage = 0.020; // Default MARKETING
    if (template.category === 'UTILITY') {
      pricePerMessage = 0.010;
    } else if (template.category === 'AUTHENTICATION') {
      pricePerMessage = 0.005;
    }
    const estimatedCost = customers.length * pricePerMessage;

    // 4. Create Campaign record
    const campaignStatus = scheduledAt ? 'QUEUED' : 'COMPLETED';
    const campaign = await db.broadcastCampaign.create({
      data: {
        tenantId,
        name,
        templateId,
        recipientFilter,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: campaignStatus,
        sent: customers.length,
        cost: estimatedCost,
      },
    });

    // 5. If sending now, create job stubs and inject simulated messages into live chats
    if (!scheduledAt) {
      const sentCount = customers.length;
      const deliveredCount = Math.floor(sentCount * 0.98);
      const readCount = Math.floor(deliveredCount * 0.82);
      const repliedCount = Math.floor(readCount * 0.14);
      const convertedCount = Math.floor(repliedCount * 0.45);
      const failedCount = sentCount - deliveredCount;

      // Update campaign stats
      await db.broadcastCampaign.update({
        where: { id: campaign.id },
        data: {
          delivered: deliveredCount,
          read: readCount,
          replied: repliedCount,
          converted: convertedCount,
          failed: failedCount,
        },
      });

      // Stub Jobs Creation & simulated chat threads
      for (const customer of customers) {
        await db.broadcastJob.create({
          data: {
            tenantId,
            campaignId: campaign.id,
            customerId: customer.id,
            status: 'SENT',
            scheduledFor: new Date(),
            processedAt: new Date(),
          },
        });

        // Resolve personalizations
        let messageContent = template.body
          .replace(/\{\{name\}\}/g, customer.displayName)
          .replace(/\{\{policy_number\}\}/g, customer.activePolicy?.policyNumber || 'POL-58472')
          .replace(/\{\{last_interaction\}\}/g, '2 days ago')
          .replace(/\{\{due_date\}\}/g, customer.activePolicy?.expiryDate 
            ? new Date(customer.activePolicy.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Oct 24, 2026'
          );

        // Append header & footer if configured
        if (template.header) {
          messageContent = `*${template.header}*\n\n${messageContent}`;
        }
        if (template.footer) {
          messageContent = `${messageContent}\n\n_${template.footer}_`;
        }

        // Get or Create conversation
        let conversation = await db.conversation.findFirst({
          where: { tenantId, customerId: customer.id },
        });

        if (!conversation) {
          conversation = await db.conversation.create({
            data: {
              tenantId,
              customerId: customer.id,
              channel: 'WHATSAPP',
              status: 'OPEN',
            },
          });
        }

        // Add to Message Log
        await db.message.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            senderType: 'BOT',
            content: messageContent,
            channel: 'WHATSAPP',
          },
        });
      }

      // Log action to compliance AuditLog
      await db.auditLog.create({
        data: {
          tenantId,
          userId: (await getTenantContext()).userId,
          action: 'CAMPAIGN_SENT',
          metadata: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            recipientsCount: customers.length,
            cost: estimatedCost,
          },
        },
      });
    }

    return NextResponse.json({ success: true, campaignId: campaign.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
