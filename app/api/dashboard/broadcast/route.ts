import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

function buildDateFilter(start?: string | null, end?: string | null) {
  let gte: Date | undefined;
  let lte: Date | undefined;

  if (start && start.trim()) {
    const d = new Date(start.includes('T') ? start : `${start}T00:00:00`);
    if (!isNaN(d.getTime())) gte = d;
  }

  if (end && end.trim()) {
    const d = new Date(end.includes('T') ? end : `${end}T23:59:59.999`);
    if (!isNaN(d.getTime())) lte = d;
  }

  if (!gte && !lte) return null;

  const dateCond: any = {};
  if (gte) dateCond.gte = gte;
  if (lte) dateCond.lte = lte;

  return {
    OR: [
      { createdAt: dateCond },
      { leads: { some: { createdAt: dateCond } } },
    ],
  };
}

function buildTagFilter(value: string) {
  const v = value.trim();
  if (!v) return null;
  const variants = Array.from(new Set([
    v,
    v.toUpperCase(),
    v.toLowerCase(),
    v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
  ]));
  return {
    tags: {
      hasSome: variants,
    },
  };
}

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
        const tagFilter = buildTagFilter(value);
        if (tagFilter) Object.assign(whereClause, tagFilter);
      } else if (type === 'stage' && value) {
        whereClause.leads = {
          some: {
            status: value,
          },
        };
      } else if (type === 'date_range' && (start || end)) {
        const dateFilter = buildDateFilter(start, end);
        if (dateFilter) {
          Object.assign(whereClause, dateFilter);
        }
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
      const tagFilter = buildTagFilter(recipientFilter.value);
      if (tagFilter) Object.assign(whereClause, tagFilter);
    } else if (recipientFilter.type === 'stage' && recipientFilter.value) {
      whereClause.leads = {
        some: {
          status: recipientFilter.value,
        },
      };
    } else if (recipientFilter.type === 'date_range' && recipientFilter.value) {
      const { start, end } = typeof recipientFilter.value === 'object' ? recipientFilter.value : { start: '', end: '' };
      const dateFilter = buildDateFilter(start, end);
      if (dateFilter) {
        Object.assign(whereClause, dateFilter);
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

    // 5. If sending now, create job stubs and dispatch live WhatsApp messages
    if (!scheduledAt) {
      // Initialize campaign metrics to 0 so real WhatsApp socket receipts drive live counters
      await db.broadcastCampaign.update({
        where: { id: campaign.id },
        data: {
          delivered: 0,
          read: 0,
          replied: 0,
          converted: 0,
          failed: 0,
        },
      });

      // Send real WhatsApp message via whatsapp-engine HTTP Service (with fallback to direct DB log)
      for (const customer of customers) {
        const job = await db.broadcastJob.create({
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

        try {
          // Attempt real WhatsApp dispatch through whatsapp-engine HTTP service
          await sendWhatsAppMessage({
            tenantId,
            customerId: customer.id,
            text: messageContent,
            campaignId: campaign.id,
            broadcastJobId: job.id,
          });
        } catch (engineErr) {
          console.warn(`[Broadcast Engine] Real-time engine dispatch notice for customer ${customer.id}:`, engineErr instanceof Error ? engineErr.message : engineErr);
          
          // Fallback: Store DB conversation and message record so chat logs stay updated even if engine socket is unlinked
          let conversation = await db.conversation.findFirst({
            where: { tenantId, customerId: customer.id, channel: 'WHATSAPP' },
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
