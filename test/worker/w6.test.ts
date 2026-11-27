import 'dotenv/config';
import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { encrypt } from '../../lib/encryption';
import type { FetchLike } from '../../lib/whatsapp/metaGraph';
import { WhatsAppCampaignReportService } from '../../lib/whatsapp/campaignReport';
import { recordDeliveryEvent } from '../../lib/whatsapp/deliveryTracking';
import { handleInboundWhatsApp } from '../../lib/whatsapp/inbound';
import { CrossChannelJourneyEngine } from '../../lib/email/journeyEngine';
import { runCampaignTick } from '../../worker/campaignRunner';

const testId = `w6_${Date.now().toString(36)}`;
const digits = String(Date.now()).slice(-8);
const TOKEN = `EAAG_w6_token_${testId}`;
const tenantIds: string[] = [];
let seq = 0;
const HOUR = 60 * 60 * 1000;

async function createTenant(label: string) {
  const tenant = await prisma.tenant.create({
    data: { name: `W6 ${label} ${testId}`, slug: `w6-${label}-${testId}`, status: 'ACTIVE', subscriptionPlan: 'FREE', subscriptionStatus: 'ACTIVE' },
  });
  tenantIds.push(tenant.id);
  const phoneNumberId = `86${digits}${tenantIds.length}`;
  await prisma.whatsAppNumber.create({
    data: {
      tenantId: tenant.id, sessionData: 'meta_cloud_config', provider: 'META_CLOUD_API', status: 'CONNECTED',
      metaWabaId: `76${digits}${tenantIds.length}`, metaPhoneNumberId: phoneNumberId, metaAccessToken: encrypt(TOKEN), messagingLimitTier: 'TIER_1K',
    },
  });
  return { tenantId: tenant.id, phoneNumberId };
}

async function createContact(tenantId: string, name: string, extra: Record<string, unknown> = {}) {
  seq++;
  const phone = `1555${digits.slice(-4)}${String(seq).padStart(3, '0')}`;
  const customer = await prisma.customer.create({
    data: { tenantId, displayName: name, primaryPhone: encrypt(`+${phone}`), optedIn: true, optedInAt: new Date(), ...extra } as any,
  });
  return { id: customer.id, phone };
}

async function createTemplate(tenantId: string, overrides: Record<string, unknown> = {}) {
  return prisma.template.create({
    data: {
      tenantId, channel: 'WHATSAPP', name: `welcome_${Math.random().toString(36).slice(2, 9)}`, language: 'en_US', category: 'MARKETING',
      headerType: 'NONE', body: 'Welcome {{1}}, thanks for joining.', content: '',
      variables: { body: [{ index: 1, example: 'Priya', source: 'first_name' }] },
      status: 'APPROVED', metaTemplateId: `57${digits}${Math.floor(Math.random() * 1000)}`, metaStatus: 'APPROVED',
      ...overrides,
    } as any,
  });
}

function fakeMeta() {
  const sent: Array<{ phoneNumberId: string; to: string; template: any }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    sent.push({ phoneNumberId: new URL(url).pathname.split('/').filter(Boolean)[1], to: body.to, template: body.template });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${testId}_${++seq}` }] }), { status: 200 });
  };
  return { sent, fetchImpl };
}

async function createJourney(tenantId: string, steps: unknown[]) {
  return prisma.crossChannelJourney.create({
    data: {
      tenantId, name: `W6 Automation ${++seq} ${testId}`, triggerType: 'CONTACT_CREATED', status: 'ACTIVE',
      frequencyCapDays: 0, quietHoursStart: null, quietHoursEnd: null, steps: steps as any,
    },
  });
}

describe('Step W6: WhatsApp reports and automations', () => {
  test('1. The report counts exactly what happened to each message', async () => {
    const t = await createTenant('report');
    const other = await createTenant('report-other');
    const template = await createTemplate(t.tenantId);
    const campaign = await prisma.broadcastCampaign.create({
      data: { tenantId: t.tenantId, name: `W6 report ${testId}`, channel: 'WHATSAPP', status: 'COMPLETED', templateId: template.id, recipientFilter: { type: 'all' } },
    });
    const sentAt = new Date(Date.now() - 2 * HOUR);
    const job = async (name: string, status: string, extra: Record<string, unknown> = {}) => {
      const c = await createContact(t.tenantId, name);
      const j = await prisma.broadcastJob.create({
        data: {
          tenantId: t.tenantId, campaignId: campaign.id, customerId: c.id, channel: 'WHATSAPP', recipient: c.phone, status: status as any,
          providerMessageId: status === 'SENT' ? `wamid.${testId}_r_${++seq}` : null,
          scheduledFor: sentAt, processedAt: status === 'PENDING' ? null : sentAt, ...extra,
        } as any,
      });
      return { ...j, customerId: c.id, phone: c.phone };
    };

    const onlySent = await job('Asha Sent', 'SENT');
    const delivered = await job('Bala Delivered', 'SENT');
    const read = await job('Chitra Read', 'SENT');
    const replied = await job('Deepa Replied', 'SENT');
    const stopped = await job('Eswar Stopped', 'SENT');
    const undeliverable1 = await job('Farah Failed', 'SENT');
    const undeliverable2 = await job('Gopal Failed', 'SENT');
    await job('Hari Rejected', 'FAILED', { lastError: 'Invalid parameter' });
    await job('Indu NoConsent', 'SKIPPED_OPTED_OUT', { lastError: 'Contact has not opted in to WhatsApp, or has opted out' });
    await job('Jaya NoField', 'SKIPPED_INVALID', { lastError: 'This contact has no first name' });
    await job('Kavi Waiting', 'PENDING');

    // Everything below arrives the way it does in production: Meta events and incoming messages
    const ev = (j: { providerMessageId: string | null }, status: 'DELIVERED' | 'READ' | 'FAILED', extra = {}) =>
      recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: j.providerMessageId!, status, ...extra });
    await ev(delivered, 'DELIVERED');
    await ev(read, 'READ');
    await ev(replied, 'READ');
    await ev(stopped, 'DELIVERED');
    await ev(undeliverable1, 'FAILED', { errorCode: '131026', errorMessage: 'Recipient is not a WhatsApp user.' });
    await ev(undeliverable2, 'FAILED', { errorCode: '131026', errorMessage: 'Recipient is not a WhatsApp user.' });
    await handleInboundWhatsApp({ tenantId: t.tenantId, customerId: replied.customerId, text: 'Tell me more' });
    await handleInboundWhatsApp({ tenantId: t.tenantId, customerId: stopped.customerId, text: 'STOP' });

    const report = await WhatsAppCampaignReportService.getReport(t.tenantId, campaign.id);
    assert.ok(report);
    assert.deepEqual(report.metrics, {
      recipients: 11, sent: 7, delivered: 4, read: 2, replied: 1, failed: 3, skipped: 2, optedOut: 1, pending: 1,
      skippedOptedOut: 1, skippedInvalid: 1, cancelled: 0,
    });
    assert.deepEqual(report.rates, {
      deliveryRate: 57.1, // 4 of 7 sent
      readRate: 50, // 2 of 4 delivered
      replyRate: 25, // 1 of 4 delivered
      failureRate: 27.3, // 3 of 11 recipients
      optOutRate: 25,
    });
    assert.equal(report.campaign.templateName, template.name);

    // Failures grouped by Meta's code, most common first
    assert.equal(report.failureReasons.length, 2);
    assert.equal(report.failureReasons[0].code, '131026');
    assert.equal(report.failureReasons[0].count, 2);
    assert.match(report.failureReasons[0].example || '', /not a WhatsApp user.*131026/);
    assert.deepEqual([report.failureReasons[1].code, report.failureReasons[1].count, report.failureReasons[1].example], [null, 1, 'Invalid parameter']);
    assert.deepEqual(
      report.skipReasons.map((s) => s.reason).sort(),
      ['Contact has not opted in to WhatsApp, or has opted out', 'This contact has no first name']
    );

    // The campaign's own stored totals agree with the report
    const stored = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual([stored.delivered, stored.read, stored.replied, stored.failed], [4, 2, 1, 3]);

    // The contact list behind each number has exactly that many contacts
    const names = async (metric: any, opts = {}) =>
      (await WhatsAppCampaignReportService.getMetricContacts(t.tenantId, campaign.id, metric, opts))!.contacts.map((c) => c.displayName).sort();
    assert.deepEqual(await names('delivered'), ['Bala Delivered', 'Chitra Read', 'Deepa Replied', 'Eswar Stopped']);
    assert.deepEqual(await names('read'), ['Chitra Read', 'Deepa Replied']);
    assert.deepEqual(await names('replied'), ['Deepa Replied']);
    assert.deepEqual(await names('optedOut'), ['Eswar Stopped']);
    assert.deepEqual(await names('failed'), ['Farah Failed', 'Gopal Failed', 'Hari Rejected']);
    assert.deepEqual(await names('skipped'), ['Indu NoConsent', 'Jaya NoField']);
    assert.deepEqual(await names('pending'), ['Kavi Waiting']);
    assert.equal((await names('sent')).length, 7);
    assert.equal((await names('recipients')).length, 11);

    // Search by name or by phone, and paging
    assert.deepEqual(await names('recipients', { search: 'chitra' }), ['Chitra Read']);
    assert.deepEqual(await names('recipients', { search: `+${onlySent.phone}` }), ['Asha Sent']);
    const page2 = await WhatsAppCampaignReportService.getMetricContacts(t.tenantId, campaign.id, 'recipients', { page: 2, pageSize: 4 });
    assert.deepEqual([page2!.totalContacts, page2!.totalPages, page2!.contacts.length], [11, 3, 4]);

    const failedRow = (await WhatsAppCampaignReportService.getMetricContacts(t.tenantId, campaign.id, 'failed', { search: 'Farah' }))!.contacts[0];
    assert.equal(failedRow.status, 'FAILED');
    assert.match(failedRow.details || '', /131026/);
    const readRow = (await WhatsAppCampaignReportService.getMetricContacts(t.tenantId, campaign.id, 'read', { search: 'Chitra' }))!.contacts[0];
    assert.equal(readRow.status, 'READ');
    assert.ok(readRow.at);

    // Another tenant sees nothing; an email campaign has no WhatsApp report
    assert.equal(await WhatsAppCampaignReportService.getReport(other.tenantId, campaign.id), null);
    assert.equal(await WhatsAppCampaignReportService.getMetricContacts(other.tenantId, campaign.id, 'recipients'), null);
    const emailCampaign = await prisma.broadcastCampaign.create({
      data: { tenantId: t.tenantId, name: `W6 email ${testId}`, channel: 'EMAIL', status: 'DRAFT', recipientFilter: { type: 'all' } },
    });
    assert.equal(await WhatsAppCampaignReportService.getReport(t.tenantId, emailCampaign.id), null);
  });

  test('2. A WhatsApp step in an automation is sent through Meta as the approved template, once', async () => {
    const t = await createTenant('journey');
    const template = await createTemplate(t.tenantId);
    const contact = await createContact(t.tenantId, 'Priya Sharma');
    const journey = await createJourney(t.tenantId, [
      { id: 'wa_1', type: 'SEND_WHATSAPP', channel: 'WHATSAPP', templateId: template.id, templateName: template.name },
      { id: 'wait_1', type: 'WAIT_DELAY', delayHours: 24 },
    ]);
    const enrollment = await prisma.journeyEnrollment.create({ data: { tenantId: t.tenantId, journeyId: journey.id, customerId: contact.id } });

    const result = await CrossChannelJourneyEngine.executeStep(t.tenantId, enrollment.id);
    assert.equal(result.status, 'STEP_EXECUTED', result.message);

    const stepCampaign = await prisma.broadcastCampaign.findFirstOrThrow({ where: { tenantId: t.tenantId, journeyId: journey.id, journeyStepId: 'wa_1' } });
    assert.deepEqual([stepCampaign.kind, stepCampaign.channel, stepCampaign.status, stepCampaign.templateId], ['JOURNEY', 'WHATSAPP', 'SENDING', template.id]);
    assert.match(stepCampaign.name, /\[Automation\].*WhatsApp 1/);
    const queued = await prisma.broadcastJob.findMany({ where: { tenantId: t.tenantId, campaignId: stepCampaign.id } });
    assert.equal(queued.length, 1);
    assert.deepEqual([queued[0].status, queued[0].channel, queued[0].recipient, queued[0].customerId], ['PENDING', 'WHATSAPP', contact.phone, contact.id]);

    const meta = fakeMeta();
    await runCampaignTick({ workerId: `w6_${testId}`, whatsappDeps: { fetchImpl: meta.fetchImpl } });
    await runCampaignTick({ workerId: `w6_${testId}`, whatsappDeps: { fetchImpl: meta.fetchImpl } });

    const mine = meta.sent.filter((s) => s.phoneNumberId === t.phoneNumberId);
    assert.equal(mine.length, 1, 'Sent exactly once');
    assert.equal(mine[0].to, contact.phone);
    assert.equal(mine[0].template.name, template.name);
    assert.deepEqual(mine[0].template.components, [{ type: 'body', parameters: [{ type: 'text', text: 'Priya' }] }]);

    const job = await prisma.broadcastJob.findUniqueOrThrow({ where: { id: queued[0].id } });
    assert.equal(job.status, 'SENT');
    assert.ok(job.providerMessageId);
    // The step campaign keeps running for future contacts and shows its totals
    const afterSend = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: stepCampaign.id } });
    assert.deepEqual([afterSend.status, afterSend.sent], ['SENDING', 1]);
    assert.equal(
      await prisma.message.count({ where: { tenantId: t.tenantId, channelMessageId: job.providerMessageId, content: { contains: 'Welcome Priya' } } }),
      1,
      'The message is in the contact\'s inbox thread'
    );

    // Delivery tracking and the report work for the step like for a broadcast
    await recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: job.providerMessageId!, status: 'READ' });
    const report = await WhatsAppCampaignReportService.getReport(t.tenantId, stepCampaign.id);
    assert.deepEqual([report!.campaign.kind, report!.metrics.sent, report!.metrics.delivered, report!.metrics.read], ['JOURNEY', 1, 1, 1]);

    // Running the same step again for the same run does not queue a second message
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStepIndex: 0, status: 'IN_PROGRESS', nextExecutionAt: new Date() } });
    await CrossChannelJourneyEngine.executeStep(t.tenantId, enrollment.id);
    await runCampaignTick({ workerId: `w6_${testId}`, whatsappDeps: { fetchImpl: meta.fetchImpl } });
    assert.equal(await prisma.broadcastJob.count({ where: { tenantId: t.tenantId, campaignId: stepCampaign.id } }), 1);
    assert.equal(meta.sent.filter((s) => s.phoneNumberId === t.phoneNumberId).length, 1);
  });

  test('3. Automation WhatsApp steps follow consent and Meta approval', async () => {
    const t = await createTenant('journey-rules');
    const approved = await createTemplate(t.tenantId);
    const pending = await createTemplate(t.tenantId, { status: 'PENDING', metaStatus: 'PENDING' });
    const noSource = await createTemplate(t.tenantId, { variables: { body: [{ index: 1, example: 'Priya' }] } });
    const run = async (customerId: string, step: Record<string, unknown>) => {
      const journey = await createJourney(t.tenantId, [{ id: 'wa_1', type: 'SEND_WHATSAPP', channel: 'WHATSAPP', ...step }, { id: 'w', type: 'WAIT_DELAY', delayHours: 1 }]);
      const enrollment = await prisma.journeyEnrollment.create({ data: { tenantId: t.tenantId, journeyId: journey.id, customerId } });
      const result = await CrossChannelJourneyEngine.executeStep(t.tenantId, enrollment.id);
      const jobs = await prisma.broadcastJob.count({ where: { tenantId: t.tenantId, campaign: { journeyId: journey.id } } });
      return { result, jobs, enrollment: await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } }) };
    };

    // Not opted in: the step is skipped and the automation moves on to the next step
    const noConsent = await createContact(t.tenantId, 'No Consent', { optedIn: false, optedInAt: null });
    const skippedStep = await run(noConsent.id, { templateId: approved.id });
    assert.equal(skippedStep.jobs, 0);
    assert.equal(skippedStep.enrollment.currentStepIndex, 1);
    assert.match(JSON.stringify(skippedStep.enrollment.logs), /not opted in to WhatsApp, or has opted out/);

    // Opted out: the contact leaves the automation and nothing is queued
    const optedOut = await createContact(t.tenantId, 'Opted Out', { optedIn: true, optedOutAt: new Date() });
    const exited = await run(optedOut.id, { templateId: approved.id });
    assert.equal(exited.jobs, 0);
    assert.equal(exited.enrollment.status, 'EXITED_UNSUBSCRIBED');

    const contact = await createContact(t.tenantId, 'Ravi Kumar');
    // Template not approved yet: nothing is queued, the step waits and says why
    const waiting = await run(contact.id, { templateId: pending.id });
    assert.equal(waiting.result.status, 'RETRY_SCHEDULED');
    assert.equal(waiting.jobs, 0);
    assert.match(waiting.enrollment.lastError || '', /not approved by Meta \(status: PENDING\)/);
    assert.equal(waiting.enrollment.currentStepIndex, 0);

    // A variable with no "Fill from" source, a missing template, another tenant's template
    assert.match((await run(contact.id, { templateId: noSource.id })).enrollment.lastError || '', /Fill from|source/i);
    assert.match((await run(contact.id, {})).enrollment.lastError || '', /no template selected/);
    const other = await createTenant('journey-other');
    const foreign = await createTemplate(other.tenantId);
    const crossed = await run(contact.id, { templateId: foreign.id });
    assert.match(crossed.enrollment.lastError || '', /no longer exists/);
    assert.equal(crossed.jobs, 0);

    // An opt-out after queueing is still respected at send time
    const late = await createContact(t.tenantId, 'Late Stop');
    const queued = await run(late.id, { templateId: approved.id });
    assert.equal(queued.jobs, 1);
    await handleInboundWhatsApp({ tenantId: t.tenantId, customerId: late.id, text: 'STOP' });
    const meta = fakeMeta();
    await runCampaignTick({ workerId: `w6b_${testId}`, whatsappDeps: { fetchImpl: meta.fetchImpl } });
    assert.equal(meta.sent.filter((s) => s.to === late.phone).length, 0);
    assert.equal((await prisma.broadcastJob.findFirstOrThrow({ where: { tenantId: t.tenantId, customerId: late.id } })).status, 'SKIPPED_OPTED_OUT');
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
});
