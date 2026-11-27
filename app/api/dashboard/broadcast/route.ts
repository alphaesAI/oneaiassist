import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { CampaignService } from '@/lib/email/campaignService';
import { templateBroadcastProblems } from '@/lib/whatsapp/templateSend';

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
      const type = (url.searchParams.get('type') || 'all') as any;
      const value = url.searchParams.get('value') || '';
      const start = url.searchParams.get('start') || '';
      const end = url.searchParams.get('end') || '';
      const emailActivity = (url.searchParams.get('emailActivity') || undefined) as any;
      const channel = (url.searchParams.get('channel') || 'WHATSAPP') as any;

      const { SegmentationService } = await import('@/lib/email/segmentation');
      const filter: any = {
        type: type === 'email_engagement' ? 'email_engagement' : type,
        value: type === 'date_range' ? { start, end } : value,
        emailActivity: type === 'email_engagement' ? (emailActivity || (value as any)) : undefined,
      };

      const { audienceCount, optedOutCount } = await SegmentationService.countSegmentAudience(
        tenantId,
        filter,
        channel
      );

      return NextResponse.json({ recipientCount: audienceCount, optedOutCount });
    }

    const channelFilter = url.searchParams.get('channel');
    const result = await CampaignService.listCampaignsWithLiveJobs(tenantId, channelFilter);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const {
      name,
      channel = 'WHATSAPP',
      templateId,
      segmentId,
      recipientFilter,
      scheduledAt,
      subject,
      previewText,
      senderName,
      senderEmail,
      replyTo,
      isAbTest = false,
      abSubjectB,
      abSenderNameB,
      abTemplateIdB,
      abTestSplit = 50,
      abWinnerMetric = 'CLICKS',
      abDurationHours = 4,
    } = body;

    if (!name || !templateId || (!recipientFilter && !segmentId)) {
      return NextResponse.json(
        { error: 'Campaign name, template ID, and recipient filters or segment ID are required' },
        { status: 400 }
      );
    }

    let resolvedSegment = null;
    if (segmentId) {
      resolvedSegment = await db.segment.findUnique({
        where: { id: segmentId, tenantId },
      });
      if (!resolvedSegment) {
        return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
      }
    }

    // 0. Auto-pause & Idempotency-Key check for EMAIL
    const idempotencyKey = req.headers.get('idempotency-key')?.trim() || null;
    if (channel === 'EMAIL') {
      if (idempotencyKey) {
        const existing = await db.broadcastCampaign.findFirst({
          where: {
            tenantId,
            idempotencyKey,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (existing) {
          return NextResponse.json(existing, { status: 202 });
        }
      }

      const emailConfig = await db.tenantEmailConfig.findUnique({ where: { tenantId } });
      if (emailConfig?.isAutoPaused) {
        return NextResponse.json(
          { error: 'Email sending is currently paused due to high spam complaints (≥0.3%). Review your list and resume in Channel Settings.' },
          { status: 403 }
        );
      }
    }

    // 1. Fetch template
    const template = await db.template.findUnique({
      where: { id: templateId, tenantId },
    });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // An account on the official WhatsApp API can only send templates that Meta approved, and its
    // campaigns are sent by the background worker through the queue (never inline in this request).
    let whatsAppViaCloudApi = false;
    if (channel === 'WHATSAPP') {
      const waNumber = await db.whatsAppNumber.findUnique({
        where: { tenantId },
        select: { provider: true, status: true, metaPhoneNumberId: true, metaAccessToken: true },
      });
      if (waNumber?.provider === 'META_CLOUD_API') {
        whatsAppViaCloudApi = true;
        const problems: string[] = [];
        if (waNumber.status !== 'CONNECTED' || !waNumber.metaPhoneNumberId || !waNumber.metaAccessToken) {
          problems.push('WhatsApp is not connected. Connect the WhatsApp Cloud API in Settings > WhatsApp.');
        }
        if (template.channel !== 'WHATSAPP' || template.status !== 'APPROVED' || !template.metaTemplateId) {
          problems.push(
            template.status === 'PENDING'
              ? "This template is still waiting for Meta's review. It can be used once Meta approves it."
              : 'This template is not approved by Meta. Submit it for review in Templates and wait for approval.'
          );
        } else {
          problems.push(...templateBroadcastProblems(template));
        }
        if (problems.length > 0) {
          return NextResponse.json({ error: problems.join(' '), problems }, { status: 400 });
        }
      }
    }

    // Pre-send checks for email, enforced here so they cannot be skipped by calling the API directly.
    if (channel === 'EMAIL') {
      const problems: string[] = [];
      if (!String(subject || template.subject || '').trim()) problems.push('The email needs a subject line.');
      if (!String(template.htmlBody || template.body || '').trim()) problems.push('The email template has no content.');
      const [tenantRow, configRow] = await Promise.all([
        db.tenant.findUnique({ where: { id: tenantId }, select: { postalAddress: true } }),
        db.tenantEmailConfig.findUnique({ where: { tenantId }, select: { postalAddress: true } }),
      ]);
      if (!tenantRow?.postalAddress?.trim() && !configRow?.postalAddress?.trim()) {
        problems.push('Add your business postal address in Settings > Email. It is required in the footer of every marketing email.');
      }
      if (problems.length > 0) {
        return NextResponse.json({ error: problems.join(' '), problems }, { status: 400 });
      }
    }

    let templateB = null;
    if (isAbTest && abTemplateIdB) {
      templateB = await db.template.findUnique({
        where: { id: abTemplateIdB, tenantId },
      });
    }

    const effectiveFilter = recipientFilter || (resolvedSegment ? { type: 'rules', rules: resolvedSegment.rules } : { type: 'all' });

    // EMAIL branch: enqueue only — worker builds audience and dispatches asynchronously
    if (channel === 'EMAIL') {
      const campaign = await db.broadcastCampaign.create({
        data: {
          tenantId,
          name,
          channel: 'EMAIL',
          templateId,
          segmentId: segmentId || null,
          subject: subject || template.subject || null,
          previewText: previewText || template.previewText || null,
          senderName: senderName || null,
          senderEmail: senderEmail || null,
          replyTo: replyTo || null,
          recipientFilter: effectiveFilter,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
          status: 'QUEUED',
          sent: 0,
          cost: 0,
          idempotencyKey,
          isAbTest: Boolean(isAbTest),
          abSubjectB: abSubjectB || null,
          abSenderNameB: abSenderNameB || null,
          abTemplateIdB: abTemplateIdB || null,
          abTestSplit: abTestSplit ? Number(abTestSplit) : 50,
          abWinnerMetric: abWinnerMetric || 'CLICKS',
          abDurationHours: abDurationHours ? Number(abDurationHours) : 4,
        },
      });
      return NextResponse.json(campaign, { status: 202 });
    }

    // WHATSAPP on the official Cloud API: enqueue only. The worker builds the audience, respects
    // Meta's messaging limit, and sends each message through Meta.
    if (whatsAppViaCloudApi) {
      if (idempotencyKey) {
        const existing = await db.broadcastCampaign.findFirst({
          where: { tenantId, idempotencyKey, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
        if (existing) return NextResponse.json(existing, { status: 202 });
      }
      const campaign = await db.broadcastCampaign.create({
        data: {
          tenantId,
          name,
          channel: 'WHATSAPP',
          templateId,
          segmentId: segmentId || null,
          recipientFilter: effectiveFilter,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
          status: 'QUEUED',
          sent: 0,
          cost: 0,
          idempotencyKey,
        },
      });
      await db.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'CAMPAIGN_QUEUED',
          metadata: { campaignId: campaign.id, campaignName: campaign.name, channel: 'WHATSAPP' },
        },
      });
      return NextResponse.json({ ...campaign, success: true, campaignId: campaign.id }, { status: 202 });
    }

    // 2. Query target customers based on unified segmentation (WhatsApp branch)
    const { SegmentationService } = await import('@/lib/email/segmentation');
    const whereClause = await SegmentationService.buildUnifiedCustomerFilter(
      tenantId,
      recipientFilter,
      channel as any
    );

    const customers = await db.customer.findMany({
      where: whereClause,
      include: {
        activePolicy: true,
      },
    });

    // 3. Compute cost estimate
    let pricePerMessage = 0.020; // Default WHATSAPP MARKETING
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
        channel: channel as any,
        templateId,
        subject: subject || template.subject || null,
        previewText: previewText || template.previewText || null,
        senderName: senderName || null,
        senderEmail: senderEmail || null,
        replyTo: replyTo || null,
        recipientFilter,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: campaignStatus,
        sent: customers.length,
        cost: estimatedCost,
        isAbTest: Boolean(isAbTest),
        abSubjectB: abSubjectB || null,
        abSenderNameB: abSenderNameB || null,
        abTemplateIdB: abTemplateIdB || null,
        abTestSplit: abTestSplit ? Number(abTestSplit) : 50,
        abWinnerMetric: abWinnerMetric || 'CLICKS',
        abDurationHours: abDurationHours ? Number(abDurationHours) : 4,
      },
    });

    // 5. If sending now, create job stubs and dispatch
    if (!scheduledAt) {
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

      if (false) {
        // Placeholder: EMAIL is handled above via enqueue-only
      } else {
        // Send real WhatsApp message via whatsapp-engine HTTP Service
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
            .replace(/\{\{policy_number\}\}/g, customer.activePolicy?.policyNumber || '')
            .replace(/\{\{last_interaction\}\}/g, customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : '')
            .replace(/\{\{due_date\}\}/g, customer.activePolicy?.expiryDate 
              ? new Date(customer.activePolicy.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : ''
            );

          if (template.header) {
            messageContent = `*${template.header}*\n\n${messageContent}`;
          }
          if (template.footer) {
            messageContent = `${messageContent}\n\n_${template.footer}_`;
          }

          try {
            await sendWhatsAppMessage({
              tenantId,
              customerId: customer.id,
              text: messageContent,
              campaignId: campaign.id,
              broadcastJobId: job.id,
            });
          } catch (engineErr) {
            console.warn(`[Broadcast Engine] WhatsApp dispatch notice for customer ${customer.id}:`, engineErr instanceof Error ? engineErr.message : engineErr);
            
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
