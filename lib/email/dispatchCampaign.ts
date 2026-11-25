import { getTenantPrisma } from '@/lib/db';
import { EmailTransportAdapter } from './EmailTransportAdapter';
import { AbTestingService } from './abTesting';
import { EmailTemplateEngine } from './templateEngine';
import { SegmentationService } from './segmentation';

/**
 * Dispatches an email BroadcastCampaign in concurrent chunks of 5.
 * Used by both immediate broadcast POST and the scheduled cron tick.
 */
export async function dispatchEmailCampaign(params: {
  campaignId: string;
  tenantId: string;
  appOrigin: string;
}): Promise<{ delivered: number; failed: number }> {
  const { campaignId, tenantId, appOrigin } = params;
  const db = getTenantPrisma(tenantId, 'ADMIN');

  const campaign = await db.broadcastCampaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { template: true },
  });
  if (!campaign || !campaign.template) {
    throw new Error(`Campaign or template not found (${campaignId})`);
  }

  const template = campaign.template;
  const templateB =
    campaign.isAbTest && campaign.abTemplateIdB
      ? await db.template.findFirst({ where: { id: campaign.abTemplateIdB, tenantId } })
      : null;

  const whereClause = await SegmentationService.buildUnifiedCustomerFilter(
    tenantId,
    (campaign.recipientFilter as any) || { type: 'all' },
    'EMAIL'
  );
  const customers = await db.customer.findMany({
    where: whereClause,
    include: { activePolicy: true },
  });

  const { variantA, variantB } = campaign.isAbTest
    ? AbTestingService.splitRecipients(customers, campaign.abTestSplit || 50)
    : { variantA: customers, variantB: [] };

  const tenantRecord = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, contactEmail: true, contactPhone: true },
  });
  const dynamicSenderAddress =
    [tenantRecord?.name, tenantRecord?.contactEmail, tenantRecord?.contactPhone].filter(Boolean).join(' • ') ||
    'OneAI Assist';

  const emailTransport = new EmailTransportAdapter(tenantId);
  let deliveredCount = 0;
  let failedCount = 0;

  const runVariant = async (batch: typeof customers, variantLabel: 'A' | 'B') => {
    const validBatch = batch.filter((c) => Boolean(c.email));
    if (validBatch.length === 0) return;

    const activeTpl = variantLabel === 'B' && templateB ? templateB : template;
    const activeSubject =
      variantLabel === 'B' && campaign.abSubjectB ? campaign.abSubjectB : campaign.subject || template.name;
    const rawBody = activeTpl.htmlBody || activeTpl.body || '';

    await db.broadcastJob.createMany({
      data: validBatch.map((c) => ({
        tenantId,
        campaignId: campaign.id,
        customerId: c.id,
        status: 'PENDING',
        scheduledFor: campaign.scheduledAt || new Date(),
      })),
    });

    for (let i = 0; i < validBatch.length; i += 5) {
      const chunk = validBatch.slice(i, i + 5);
      await Promise.allSettled(
        chunk.map(async (customer) => {
          const personalContext = {
            name: customer.displayName,
            first_name: customer.displayName.split(' ')[0],
            last_name: customer.displayName.split(' ').slice(1).join(' ') || '',
            email: customer.email!,
            policy_number: customer.activePolicy?.policyNumber || 'POL-58472',
            unsubscribe_url: `${appOrigin}/api/channels/email/unsubscribe?email=${encodeURIComponent(customer.email!)}&tenantId=${tenantId}`,
            sender_address: dynamicSenderAddress,
          };
          const renderedHtml = EmailTemplateEngine.render(rawBody, personalContext);
          try {
            await emailTransport.sendEmail({
              to: customer.email!,
              subject: EmailTemplateEngine.render(activeSubject, personalContext),
              html: renderedHtml,
              previewText: campaign.previewText || undefined,
              replyTo: campaign.replyTo || undefined,
            });
            deliveredCount++;
            await db.broadcastJob.updateMany({
              where: { campaignId: campaign.id, customerId: customer.id },
              data: { status: 'SENT', processedAt: new Date() },
            });
          } catch (sendErr) {
            failedCount++;
            console.error(`[Email Broadcast] Failed to send to ${customer.email}:`, sendErr);
            await db.broadcastJob.updateMany({
              where: { campaignId: campaign.id, customerId: customer.id },
              data: {
                status: 'FAILED',
                processedAt: new Date(),
                lastError: sendErr instanceof Error ? sendErr.message : String(sendErr),
              },
            });
          }
        })
      );
    }
  };

  await runVariant(variantA, 'A');
  if (variantB.length > 0) await runVariant(variantB, 'B');

  await db.broadcastCampaign.update({
    where: { id: campaign.id },
    data: { status: 'COMPLETED', sent: deliveredCount + failedCount, delivered: deliveredCount, failed: failedCount },
  });

  return { delivered: deliveredCount, failed: failedCount };
}
