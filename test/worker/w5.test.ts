import 'dotenv/config';
import test, { describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { prisma } from '../../lib/db';
import { encrypt } from '../../lib/encryption';
import type { FetchLike } from '../../lib/whatsapp/metaGraph';
import { captureRawBody } from '../../lib/whatsapp/webhookAuth';
import { classifyOptKeyword, handleInboundWhatsApp, OPT_IN_CONFIRMATION, OPT_OUT_CONFIRMATION } from '../../lib/whatsapp/inbound';
import { getServiceWindow, WhatsAppWindowClosedError } from '../../lib/whatsapp/serviceWindow';
import { ConversationTemplateError, sendTemplateInConversation } from '../../lib/whatsapp/conversationTemplate';
import { createMetaWebhookRouter } from '../../whatsapp-engine/routes/metaWebhook';
import { MessageService } from '../../whatsapp-engine/MessageService';
import { TransportManager } from '../../whatsapp-engine/transport/TransportManager';

const testId = `w5_${Date.now().toString(36)}`;
const digits = String(Date.now()).slice(-8);
const APP_SECRET = `app_secret_${testId}_value`;
const TOKEN = `EAAG_w5_token_${testId}`;
const tenantIds: string[] = [];
let seq = 0;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const sign = (body: string) => 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
const fakeIo = { to: () => ({ emit: () => undefined }) };

async function createTenant(label: string, provider = 'META_CLOUD_API') {
  const tenant = await prisma.tenant.create({
    data: { name: `W5 ${label} ${testId}`, slug: `w5-${label}-${testId}`, status: 'ACTIVE', subscriptionPlan: 'FREE', subscriptionStatus: 'ACTIVE' },
  });
  tenantIds.push(tenant.id);
  const phoneNumberId = `85${digits}${tenantIds.length}`;
  await prisma.whatsAppNumber.create({
    data: {
      tenantId: tenant.id, sessionData: 'meta_cloud_config', provider, status: 'CONNECTED',
      metaWabaId: `75${digits}${tenantIds.length}`, metaPhoneNumberId: phoneNumberId, metaAccessToken: encrypt(TOKEN),
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
  const conversation = await prisma.conversation.create({ data: { tenantId, customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN' } });
  return { id: customer.id, phone, conversationId: conversation.id };
}

async function createCampaign(tenantId: string) {
  return prisma.broadcastCampaign.create({
    data: { tenantId, name: `W5 ${testId} ${++seq}`, channel: 'WHATSAPP', status: 'COMPLETED', recipientFilter: { type: 'all' } },
  });
}

async function createJob(tenantId: string, campaignId: string, customerId: string, opts: { status?: string; sentAgoMs?: number } = {}) {
  const status = opts.status ?? 'SENT';
  const at = new Date(Date.now() - (opts.sentAgoMs ?? HOUR));
  return prisma.broadcastJob.create({
    data: {
      tenantId, campaignId, customerId, channel: 'WHATSAPP', recipient: '1', status: status as any,
      providerMessageId: status === 'SENT' ? `wamid.${testId}_job_${++seq}` : null,
      scheduledFor: at, processedAt: status === 'SENT' ? at : null,
    },
  });
}

async function createTemplate(tenantId: string, overrides: Record<string, unknown> = {}) {
  return prisma.template.create({
    data: {
      tenantId, channel: 'WHATSAPP', name: `followup_${Math.random().toString(36).slice(2, 9)}`, language: 'en_US', category: 'UTILITY',
      headerType: 'NONE', body: 'Hello {{1}}, we have an update for you.', content: '',
      variables: { body: [{ index: 1, example: 'Priya', source: 'name' }] },
      status: 'APPROVED', metaTemplateId: `56${digits}${Math.floor(Math.random() * 1000)}`, metaStatus: 'APPROVED',
      ...overrides,
    } as any,
  });
}

async function addInbound(tenantId: string, conversationId: string, agoMs: number) {
  return prisma.message.create({
    data: {
      tenantId, conversationId, direction: 'INBOUND', senderType: 'CUSTOMER', content: 'Hi', channel: 'WHATSAPP',
      status: 'READ', createdAt: new Date(Date.now() - agoMs),
    },
  });
}

function inboundPayload(phoneNumberId: string, from: string, text: string, opts: { id?: string; context?: string } = {}) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '1555', phone_number_id: phoneNumberId },
      contacts: [{ wa_id: from, profile: { name: 'Contact' } }],
      messages: [{
        from, id: opts.id || `wamid.${testId}_in_${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text },
        ...(opts.context ? { context: { id: opts.context } } : {}),
      }],
    } }] }],
  });
}

describe('Step W5: WhatsApp replies, opt-out and the 24-hour window', () => {
  let server: http.Server;
  let base = '';
  let savedSecret: string | undefined;
  const confirmations: Array<{ tenantId: string; to: string; text: string }> = [];

  before(async () => {
    savedSecret = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = APP_SECRET;
    const app = express();
    app.use(express.json({ verify: captureRawBody }));
    app.use(createMetaWebhookRouter(fakeIo, {
      sendConfirmation: async (tenantId, to, text) => {
        confirmations.push({ tenantId, to, text });
        return { messageId: `wamid.${testId}_confirm_${confirmations.length}` };
      },
    }));
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhook/meta`;
  });

  async function receive(body: string, until: () => Promise<boolean>) {
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body) }, body });
    assert.equal(res.status, 200);
    for (let i = 0; i < 60; i++) {
      if (await until()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.fail('The incoming message was not processed in time');
  }

  test('1. Only a message that is exactly a keyword counts as opt-out or opt-in', () => {
    for (const t of ['STOP', 'stop', ' Stop. ', 'STOP!', 'Unsubscribe', 'opt out', 'OPT-OUT', 'optout', 'stop all', 'END', 'quit']) {
      assert.equal(classifyOptKeyword(t), 'OPT_OUT', t);
    }
    for (const t of ['START', 'start', 'Subscribe', 'UNSTOP', 'opt in']) assert.equal(classifyOptKeyword(t), 'OPT_IN', t);
    for (const t of ['Please stop calling me', 'stop it', 'I want to cancel', 'cancel', 'When does it start?', 'The end', '', '   ', null, undefined]) {
      assert.equal(classifyOptKeyword(t as any), null, String(t));
    }
  });

  test('2. STOP through the webhook: opted out, pending messages stopped, confirmed, not sent to the AI', async () => {
    const t = await createTenant('stop');
    const contact = await createContact(t.tenantId, 'Stop Person');
    const sentCampaign = await createCampaign(t.tenantId);
    const sentJob = await createJob(t.tenantId, sentCampaign.id, contact.id);
    const upcoming = await createCampaign(t.tenantId);
    const pendingJob = await createJob(t.tenantId, upcoming.id, contact.id, { status: 'PENDING' });
    const before = confirmations.length;

    const inboundId = `wamid.${testId}_stop`;
    await receive(inboundPayload(t.phoneNumberId, contact.phone, 'Stop', { id: inboundId }), async () =>
      (await prisma.inboundMessageJob.findFirst({ where: { tenantId: t.tenantId, wamId: inboundId } }))?.status === 'COMPLETED'
    );

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: contact.id } });
    assert.equal(customer.optedIn, false);
    assert.ok(customer.optedOutAt);

    const pending = await prisma.broadcastJob.findUniqueOrThrow({ where: { id: pendingJob.id } });
    assert.equal(pending.status, 'SKIPPED_OPTED_OUT');
    assert.match(pending.lastError || '', /opted out/);

    // Recorded against the campaign they answered as an opt-out, not as a reply
    const answered = await prisma.broadcastJob.findUniqueOrThrow({ where: { id: sentJob.id } });
    assert.ok(answered.optedOutAt);
    assert.equal(answered.repliedAt, null);
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: sentCampaign.id } })).replied, 0);

    // The contact is told, and the confirmation is in the inbox
    assert.equal(confirmations.length, before + 1);
    assert.deepEqual(confirmations.at(-1), { tenantId: t.tenantId, to: contact.phone, text: OPT_OUT_CONFIRMATION });
    const thread = await prisma.message.findMany({ where: { tenantId: t.tenantId, conversationId: contact.conversationId }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(thread.map((m) => [m.direction, m.content]), [['INBOUND', 'Stop'], ['OUTBOUND', OPT_OUT_CONFIRMATION]]);
    assert.equal(await prisma.customer.count({ where: { tenantId: t.tenantId } }), 1, 'No duplicate contact was created');

    // The same webhook delivered again changes nothing and sends no second confirmation
    const again = inboundPayload(t.phoneNumberId, contact.phone, 'Stop', { id: inboundId });
    assert.equal((await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(again) }, body: again })).status, 200);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(confirmations.length, before + 1);

    // START brings them back
    const startId = `wamid.${testId}_start`;
    await receive(inboundPayload(t.phoneNumberId, contact.phone, 'START', { id: startId }), async () =>
      (await prisma.inboundMessageJob.findFirst({ where: { tenantId: t.tenantId, wamId: startId } }))?.status === 'COMPLETED'
    );
    const back = await prisma.customer.findUniqueOrThrow({ where: { id: contact.id } });
    assert.equal(back.optedIn, true);
    assert.equal(back.optedOutAt, null);
    assert.equal(confirmations.at(-1)!.text, OPT_IN_CONFIRMATION);
  });

  test('3. A reply is counted once, for the campaign it answers', async () => {
    const t = await createTenant('reply');
    const contact = await createContact(t.tenantId, 'Reply Person');
    const older = await createCampaign(t.tenantId);
    const olderJob = await createJob(t.tenantId, older.id, contact.id, { sentAgoMs: 3 * DAY });
    const newer = await createCampaign(t.tenantId);
    const newerJob = await createJob(t.tenantId, newer.id, contact.id, { sentAgoMs: 2 * HOUR });

    // A plain message counts for the most recent campaign message
    const inboundId = `wamid.${testId}_reply`;
    await receive(inboundPayload(t.phoneNumberId, contact.phone, 'Yes, I am interested', { id: inboundId }), async () =>
      (await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: newer.id } })).replied === 1
    );
    assert.ok((await prisma.broadcastJob.findUniqueOrThrow({ where: { id: newerJob.id } })).repliedAt);
    assert.equal((await prisma.broadcastJob.findUniqueOrThrow({ where: { id: olderJob.id } })).repliedAt, null);
    // A normal reply still goes to the assistant queue
    assert.equal((await prisma.inboundMessageJob.findFirst({ where: { tenantId: t.tenantId, wamId: inboundId } }))?.status, 'QUEUED');
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: contact.id } })).optedOutAt, null);

    // More messages do not count again
    const second = await handleInboundWhatsApp({ tenantId: t.tenantId, customerId: contact.id, text: 'Call me tomorrow' });
    assert.equal(second.totals, undefined);
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: newer.id } })).replied, 1);

    // Using "reply" on the older message counts for that older campaign
    const quoted = await handleInboundWhatsApp({ tenantId: t.tenantId, customerId: contact.id, text: 'About this one', contextMessageId: olderJob.providerMessageId });
    assert.equal(quoted.campaignId, older.id);
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: older.id } })).replied, 1);
  });

  test('4. Old campaigns, unsent messages and other tenants are never credited with a reply', async () => {
    const t = await createTenant('noreply');
    const other = await createTenant('noreply-other');

    // Campaign message sent 8 days ago: outside the 7-day reply period
    const late = await createContact(t.tenantId, 'Late Person');
    const oldCampaign = await createCampaign(t.tenantId);
    const oldJob = await createJob(t.tenantId, oldCampaign.id, late.id, { sentAgoMs: 8 * DAY });
    assert.equal((await handleInboundWhatsApp({ tenantId: t.tenantId, customerId: late.id, text: 'Hello' })).campaignId, null);

    // A message that was never sent cannot be replied to
    const skipped = await createContact(t.tenantId, 'Skipped Person');
    const c2 = await createCampaign(t.tenantId);
    await createJob(t.tenantId, c2.id, skipped.id, { status: 'FAILED' });
    assert.equal((await handleInboundWhatsApp({ tenantId: t.tenantId, customerId: skipped.id, text: 'Hello' })).campaignId, null);

    // Another tenant cannot credit or opt out this tenant's contact, even with the right message ID
    const crossed = await handleInboundWhatsApp({ tenantId: other.tenantId, customerId: late.id, text: 'STOP', contextMessageId: oldJob.providerMessageId });
    assert.equal(crossed.campaignId, null);
    assert.equal(crossed.optChanged, false);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: late.id } })).optedOutAt, null);
    assert.equal((await prisma.broadcastJob.findUniqueOrThrow({ where: { id: oldJob.id } })).repliedAt, null);
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: oldCampaign.id } })).replied, 0);
  });

  test('5. Official API: a free-form message is refused once the 24-hour window has closed', async () => {
    const t = await createTenant('window');
    const never = await createContact(t.tenantId, 'Never Wrote');
    const stale = await createContact(t.tenantId, 'Wrote Yesterday');
    const fresh = await createContact(t.tenantId, 'Wrote Today');
    await addInbound(t.tenantId, stale.conversationId, 25 * HOUR);
    await addInbound(t.tenantId, fresh.conversationId, 23 * HOUR);

    assert.equal((await getServiceWindow(t.tenantId, never.conversationId)).open, false);
    assert.equal((await getServiceWindow(t.tenantId, stale.conversationId)).open, false);
    assert.equal((await getServiceWindow(t.tenantId, fresh.conversationId)).open, true);
    // Another tenant asking about this conversation gets nothing
    const other = await createTenant('window-other');
    assert.equal((await getServiceWindow(other.tenantId, fresh.conversationId)).open, false);

    const realFetch = globalThis.fetch;
    const sent: Array<{ url: string; body: any }> = [];
    globalThis.fetch = (async (url: any, init?: any) => {
      sent.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${testId}_free_${sent.length}` }] }), { status: 200 });
    }) as typeof fetch;
    try {
      for (const c of [never, stale]) {
        await assert.rejects(
          MessageService.sendMessage(t.tenantId, { to: `+${c.phone}`, text: 'Hello again', conversationId: c.conversationId }, fakeIo),
          (err: unknown) => err instanceof WhatsAppWindowClosedError && err.status === 409 && /24-hour reply window is closed/.test(err.message)
        );
      }
      assert.equal(sent.length, 0, 'Nothing was sent to Meta');
      assert.equal(await prisma.message.count({ where: { tenantId: t.tenantId, direction: 'OUTBOUND' } }), 0);

      // Inside the window the message goes through Meta as plain text
      const ok = await MessageService.sendMessage(t.tenantId, { to: `+${fresh.phone}`, text: 'Thanks for your message', conversationId: fresh.conversationId }, fakeIo);
      assert.equal(ok.success, true);
      assert.equal(sent.length, 1);
      assert.ok(sent[0].url.endsWith(`/${t.phoneNumberId}/messages`));
      assert.equal(sent[0].body.type, 'text');
      assert.equal(sent[0].body.to, fresh.phone);
    } finally {
      globalThis.fetch = realFetch;
      TransportManager.destroyTransport(t.tenantId);
    }
  });

  test('6. Outside the window an approved template can be sent from the conversation', async () => {
    const t = await createTenant('tpl');
    const other = await createTenant('tpl-other');
    const contact = await createContact(t.tenantId, 'Priya Sharma');
    const template = await createTemplate(t.tenantId);
    const sent: any[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      sent.push({ url, auth: (init?.headers as any)?.Authorization, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${testId}_tpl_${sent.length}` }] }), { status: 200 });
    };
    const send = (tenantId: string, conversationId: string, templateId: string) =>
      sendTemplateInConversation({ tenantId, conversationId, templateId }, { fetchImpl });
    const refused = (status: number, pattern: RegExp) => (err: unknown) =>
      err instanceof ConversationTemplateError && err.status === status && pattern.test(err.message);

    const message = await send(t.tenantId, contact.conversationId, template.id);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].auth, `Bearer ${TOKEN}`);
    assert.equal(sent[0].body.type, 'template');
    assert.equal(sent[0].body.to, contact.phone);
    assert.equal(sent[0].body.template.name, template.name);
    assert.deepEqual(sent[0].body.template.components, [{ type: 'body', parameters: [{ type: 'text', text: 'Priya Sharma' }] }]);
    assert.equal(message.content.includes('Hello Priya Sharma'), true);
    assert.equal(message.channelMessageId, `wamid.${testId}_tpl_1`);
    assert.equal(message.conversationId, contact.conversationId);

    // Refusals: nothing is sent in any of these
    await assert.rejects(send(other.tenantId, contact.conversationId, template.id), refused(404, /Conversation not found/));
    const foreignTemplate = await createTemplate(other.tenantId);
    await assert.rejects(send(t.tenantId, contact.conversationId, foreignTemplate.id), refused(404, /Template not found/));
    const pending = await createTemplate(t.tenantId, { status: 'PENDING', metaStatus: 'PENDING' });
    await assert.rejects(send(t.tenantId, contact.conversationId, pending.id), refused(409, /not approved by Meta/));
    const needsField = await createTemplate(t.tenantId, { variables: { body: [{ index: 1, example: 'Gold', source: 'custom:plan' }] } });
    await assert.rejects(send(t.tenantId, contact.conversationId, needsField.id), refused(409, /plan/));
    const marketing = await createTemplate(t.tenantId, { category: 'MARKETING' });
    const notOptedIn = await createContact(t.tenantId, 'No Consent', { optedIn: false, optedInAt: null });
    await assert.rejects(send(t.tenantId, notOptedIn.conversationId, marketing.id), refused(409, /not opted in/));
    const optedOut = await createContact(t.tenantId, 'Opted Out', { optedIn: false, optedOutAt: new Date() });
    await assert.rejects(send(t.tenantId, optedOut.conversationId, template.id), refused(409, /opted out/));
    assert.equal(sent.length, 1);

    // Meta's refusal is reported with its code and nothing is recorded as sent
    const failing: FetchLike = async () => new Response(JSON.stringify({ error: { message: 'Template paused', code: 132015 } }), { status: 400 });
    await assert.rejects(
      sendTemplateInConversation({ tenantId: t.tenantId, conversationId: contact.conversationId, templateId: template.id }, { fetchImpl: failing }),
      refused(502, /Template paused.*132015/)
    );
    assert.equal(await prisma.message.count({ where: { tenantId: t.tenantId, conversationId: contact.conversationId, direction: 'OUTBOUND' } }), 1);
  });

  after(async () => {
    if (savedSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = savedSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
});
