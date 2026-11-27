import 'dotenv/config';
import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { encrypt } from '../../lib/encryption';
import type { FetchLike } from '../../lib/whatsapp/metaGraph';
import { runCampaignTick } from '../../worker/campaignRunner';
import { buildTemplateMessage, dailyLimitForTier, templateBroadcastProblems, toWhatsAppRecipient } from '../../lib/whatsapp/templateSend';

const testId = `w3_${Date.now().toString(36)}`;
const digits = String(Date.now()).slice(-8);
const TOKEN = `EAAG_w3_token_${testId}`;
const tenantIds: string[] = [];
let phoneSeq = 0;

interface FakeMeta {
  fetchImpl: FetchLike;
  sent: Array<{ phoneNumberId: string; to: string; template: any; auth: string }>;
  failWith: Map<string, { status: number; code: number; message: string }>;
  failOnce: Map<string, { status: number; code: number; message: string }>;
}

function fakeMeta(): FakeMeta {
  const sent: FakeMeta['sent'] = [];
  const failWith: FakeMeta['failWith'] = new Map();
  const failOnce: FakeMeta['failOnce'] = new Map();
  const fetchImpl: FetchLike = async (url, init) => {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const body = JSON.parse(String(init?.body || '{}'));
    const auth = String((init?.headers as Record<string, string>)?.Authorization || '');
    const failure = failWith.get(body.to) || failWith.get('*') || failOnce.get(body.to);
    if (failOnce.has(body.to)) failOnce.delete(body.to);
    if (failure) {
      return new Response(JSON.stringify({ error: { message: failure.message, code: failure.code } }), { status: failure.status });
    }
    sent.push({ phoneNumberId: parts[1], to: body.to, template: body.template, auth });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${testId}_${sent.length}` }] }), { status: 200 });
  };
  return { fetchImpl, sent, failWith, failOnce };
}

async function createTenant(label: string, opts: { provider?: string; tier?: string | null } = {}) {
  const tenant = await prisma.tenant.create({
    data: { name: `W3 ${label} ${testId}`, slug: `w3-${label}-${testId}`, status: 'ACTIVE', subscriptionPlan: 'FREE', subscriptionStatus: 'ACTIVE' },
  });
  tenantIds.push(tenant.id);
  const phoneNumberId = `83${digits}${tenantIds.length}`;
  await prisma.whatsAppNumber.create({
    data: {
      tenantId: tenant.id, sessionData: 'meta_cloud_config', provider: opts.provider ?? 'META_CLOUD_API', status: 'CONNECTED',
      metaWabaId: `73${digits}${tenantIds.length}`, metaPhoneNumberId: phoneNumberId, metaAccessToken: encrypt(TOKEN),
      messagingLimitTier: opts.tier === undefined ? 'TIER_1K' : opts.tier,
    },
  });
  return { tenantId: tenant.id, phoneNumberId };
}

async function createContact(tenantId: string, name: string, extra: Record<string, unknown> = {}) {
  phoneSeq++;
  const phone = `1555${digits.slice(-4)}${String(phoneSeq).padStart(3, '0')}`;
  const customer = await prisma.customer.create({
    data: {
      tenantId, displayName: name, primaryPhone: encrypt(`+${phone}`), optedIn: true, optedInAt: new Date(),
      email: `${name.toLowerCase().replace(/\s+/g, '.')}.${phoneSeq}@example.com`,
      ...extra,
    } as any,
  });
  return { ...customer, phoneDigits: phone };
}

async function createTemplate(tenantId: string, overrides: Record<string, unknown> = {}) {
  return prisma.template.create({
    data: {
      tenantId, channel: 'WHATSAPP', name: `offer_${Math.random().toString(36).slice(2, 9)}`, language: 'en_US', category: 'MARKETING',
      headerType: 'TEXT', header: 'Renewal for {{1}}',
      body: 'Hello {{1}}, your {{2}} plan is ready to renew.', content: '',
      footer: 'Reply STOP to unsubscribe',
      ctaButtons: [{ type: 'QUICK_REPLY', text: 'Yes' }, { type: 'URL', text: 'View', url: 'https://example.com/q/{{1}}' }],
      variables: {
        header: [{ index: 1, example: 'Priya', source: 'first_name' }],
        body: [{ index: 1, example: 'Priya Sharma', source: 'name' }, { index: 2, example: 'Gold', source: 'custom:plan' }],
        buttonUrlExample: 'abc', buttonUrlSource: 'custom:quote_id',
      },
      status: 'APPROVED', metaTemplateId: `55${digits}${Math.floor(Math.random() * 1000)}`, metaStatus: 'APPROVED',
      ...overrides,
    } as any,
  });
}

async function createCampaign(tenantId: string, templateId: string, overrides: Record<string, unknown> = {}) {
  return prisma.broadcastCampaign.create({
    data: {
      tenantId, name: `W3 campaign ${Math.random().toString(36).slice(2, 7)}`, channel: 'WHATSAPP', status: 'QUEUED',
      templateId, recipientFilter: { type: 'all' }, scheduledAt: new Date(Date.now() - 1000),
      ...overrides,
    } as any,
  });
}

async function runTicks(meta: FakeMeta, times = 3, now?: () => Date) {
  for (let i = 0; i < times; i++) {
    await runCampaignTick({ workerId: `w3_${i}`, now, whatsappDeps: { fetchImpl: meta.fetchImpl } });
  }
}

describe('Step W3: WhatsApp broadcasts through the queue', () => {
  test('1. Building a message: real values only, never a placeholder', () => {
    const template = {
      name: 't', language: 'en', headerType: 'TEXT', header: 'Hi {{1}}', body: 'Hello {{1}}, plan {{2}}.', footer: 'Bye',
      ctaButtons: [{ type: 'QUICK_REPLY', text: 'Yes' }, { type: 'URL', text: 'View', url: 'https://example.com/q/{{1}}' }],
      variables: {
        header: [{ index: 1, example: 'P', source: 'first_name' }],
        body: [{ index: 1, example: 'P S', source: 'name' }, { index: 2, example: 'Gold', source: 'custom:plan' }],
        buttonUrlExample: 'abc', buttonUrlSource: 'custom:quote_id',
      },
    };
    const built = buildTemplateMessage(template, { displayName: 'Priya Sharma', email: null, phone: '15550001111', customFields: { plan: 'Gold Health', quote_id: 'Q 77/a' } });
    assert.ok(built.ok);
    if (built.ok) {
      assert.deepEqual(built.components, [
        { type: 'header', parameters: [{ type: 'text', text: 'Priya' }] },
        { type: 'body', parameters: [{ type: 'text', text: 'Priya Sharma' }, { type: 'text', text: 'Gold Health' }] },
        { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'Q%2077%2Fa' }] },
      ]);
      assert.match(built.renderedText, /Hello Priya Sharma, plan Gold Health\./);
      assert.ok(!built.renderedText.includes('{{'));
    }

    const missing = buildTemplateMessage(template, { displayName: 'Priya Sharma', email: null, phone: '15550001111', customFields: { quote_id: 'Q1' } });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.reason, /no custom field "plan"/);

    assert.deepEqual(templateBroadcastProblems(template), []);
    const noSource = { ...template, variables: { body: [{ index: 1, example: 'x' }, { index: 2, example: 'y', source: 'made_up_field' }] } };
    const problems = templateBroadcastProblems(noSource);
    assert.equal(problems.length, 4, 'header, two body variables and the link variable all lack a real source');
    assert.match(problems.join(' '), /has no "Fill from" source/);

    assert.equal(toWhatsAppRecipient('+1 (555) 000-1111'), '15550001111');
    assert.equal(toWhatsAppRecipient(encrypt('+919876543210')), '919876543210');
    assert.equal(toWhatsAppRecipient('12345'), null);
    assert.equal(toWhatsAppRecipient(''), null);
    assert.equal(dailyLimitForTier('TIER_10K'), 10000);
    assert.equal(dailyLimitForTier(null), 250, 'An unreported tier is treated as the lowest standard tier');
  });

  test('2. A campaign is sent through Meta to opted-in contacts only, with each contact\'s own values', async () => {
    const meta = fakeMeta();
    const t = await createTenant('send');
    const other = await createTenant('bystander');
    const priya = await createContact(t.tenantId, 'Priya Sharma', { customFields: { plan: 'Gold', quote_id: 'Q100' } });
    const arun = await createContact(t.tenantId, 'Arun Kumar', { customFields: { plan: 'Silver', quote_id: 'Q200' } });
    const noPlan = await createContact(t.tenantId, 'Meena Iyer', { customFields: { quote_id: 'Q300' } });
    const notOptedIn = await createContact(t.tenantId, 'Ravi Not In', { optedIn: false, customFields: { plan: 'Gold', quote_id: 'Q400' } });
    const optedOut = await createContact(t.tenantId, 'Sita Out', { optedOutAt: new Date(), customFields: { plan: 'Gold', quote_id: 'Q500' } });
    const badPhone = await createContact(t.tenantId, 'Bad Phone', { primaryPhone: encrypt('123'), customFields: { plan: 'Gold', quote_id: 'Q600' } });
    const stranger = await createContact(other.tenantId, 'Other Tenant', { customFields: { plan: 'Gold', quote_id: 'Q700' } });

    const template = await createTemplate(t.tenantId);
    const campaign = await createCampaign(t.tenantId, template.id);
    await runTicks(meta);

    // Exactly the two contacts who opted in and have every value
    assert.deepEqual(meta.sent.map((m) => m.to).sort(), [priya.phoneDigits, arun.phoneDigits].sort());
    for (const m of meta.sent) {
      assert.equal(m.phoneNumberId, t.phoneNumberId, 'Sent from this tenant\'s own number');
      assert.equal(m.auth, `Bearer ${TOKEN}`);
      assert.equal(m.template.name, template.name);
      assert.deepEqual(m.template.language, { code: 'en_US' });
    }
    const toPriya = meta.sent.find((m) => m.to === priya.phoneDigits)!;
    assert.deepEqual(toPriya.template.components, [
      { type: 'header', parameters: [{ type: 'text', text: 'Priya' }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Priya Sharma' }, { type: 'text', text: 'Gold' }] },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'Q100' }] },
    ]);
    assert.ok(!meta.sent.some((m) => m.to === stranger.phoneDigits), 'Another tenant\'s contact is never messaged');

    const jobs = await prisma.broadcastJob.findMany({ where: { campaignId: campaign.id } });
    const byCustomer = new Map(jobs.map((j) => [j.customerId, j]));
    assert.equal(byCustomer.get(priya.id)!.status, 'SENT');
    assert.match(byCustomer.get(priya.id)!.providerMessageId || '', /^wamid\./);
    assert.equal(byCustomer.get(priya.id)!.channel, 'WHATSAPP');
    assert.equal(byCustomer.get(noPlan.id)!.status, 'SKIPPED_INVALID');
    assert.match(byCustomer.get(noPlan.id)!.lastError || '', /no custom field "plan"/);
    assert.equal(byCustomer.get(badPhone.id)!.status, 'SKIPPED_INVALID');
    assert.match(byCustomer.get(badPhone.id)!.lastError || '', /phone number/);
    assert.equal(byCustomer.has(notOptedIn.id), false, 'A contact who never opted in is not even queued');
    assert.equal(byCustomer.has(optedOut.id), false);

    const done = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(done.status, 'COMPLETED');
    assert.equal(done.sent, 2);
    assert.equal(done.totalRecipients, 4);

    // The sent message is in the contact's conversation, matched to Meta's message ID
    const msg = await prisma.message.findFirstOrThrow({ where: { tenantId: t.tenantId, channelMessageId: byCustomer.get(priya.id)!.providerMessageId } });
    assert.equal(msg.direction, 'OUTBOUND');
    assert.match(msg.content, /Hello Priya Sharma, your Gold plan is ready to renew\./);
    assert.equal(await prisma.message.count({ where: { tenantId: other.tenantId } }), 0);

    // Running the worker again sends nothing twice
    await runTicks(meta, 2);
    assert.equal(meta.sent.length, 2);
  });

  test('3. Consent is checked again at send time', async () => {
    const meta = fakeMeta();
    const t = await createTenant('consent');
    const a = await createContact(t.tenantId, 'Stays In', { customFields: { plan: 'Gold', quote_id: 'Q1' } });
    const b = await createContact(t.tenantId, 'Leaves Later', { customFields: { plan: 'Gold', quote_id: 'Q2' } });
    const template = await createTemplate(t.tenantId);
    // Scheduled for later: the audience is built now, the messages go out after the opt-out
    const campaign = await createCampaign(t.tenantId, template.id, { status: 'SENDING', startedAt: new Date() });
    const future = new Date(Date.now() + 3600_000);
    await runCampaignTick({ perLoopCap: 0, whatsappDeps: { fetchImpl: meta.fetchImpl } });
    assert.equal(await prisma.broadcastJob.count({ where: { campaignId: campaign.id, status: 'PENDING' } }), 2);
    assert.equal(meta.sent.length, 0);

    await prisma.customer.update({ where: { id: b.id }, data: { optedOutAt: new Date() } });
    await runTicks(meta, 2, () => future);

    assert.deepEqual(meta.sent.map((m) => m.to), [a.phoneDigits]);
    const job = await prisma.broadcastJob.findFirstOrThrow({ where: { campaignId: campaign.id, customerId: b.id } });
    assert.equal(job.status, 'SKIPPED_OPTED_OUT');
  });

  test('4. A campaign that cannot be sent fails with a clear reason and sends nothing', async () => {
    const meta = fakeMeta();
    const t = await createTenant('refuse');
    await createContact(t.tenantId, 'Someone Here', { customFields: { plan: 'Gold', quote_id: 'Q1' } });

    const pending = await createTemplate(t.tenantId, { status: 'PENDING' });
    const neverSubmitted = await createTemplate(t.tenantId, { status: 'APPROVED', metaTemplateId: null });
    const noSource = await createTemplate(t.tenantId, { variables: { header: [{ index: 1, example: 'x', source: 'first_name' }], body: [{ index: 1, example: 'x', source: 'name' }, { index: 2, example: 'y' }], buttonUrlExample: 'a', buttonUrlSource: 'custom:quote_id' } });
    const c1 = await createCampaign(t.tenantId, pending.id);
    const c2 = await createCampaign(t.tenantId, neverSubmitted.id);
    const c3 = await createCampaign(t.tenantId, noSource.id);
    await runTicks(meta, 2);

    const [r1, r2, r3] = await Promise.all([c1, c2, c3].map((c) => prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: c.id } })));
    assert.equal(r1.status, 'FAILED');
    assert.match(r1.lastError || '', /not approved by Meta \(status: PENDING\)/);
    assert.equal(r2.status, 'FAILED', 'APPROVED without a Meta template ID was never approved by Meta');
    assert.equal(r3.status, 'FAILED');
    assert.match(r3.lastError || '', /Body variable \{\{2\}\} has no "Fill from" source/);
    assert.equal(meta.sent.length, 0);
    assert.equal(await prisma.broadcastJob.count({ where: { tenantId: t.tenantId } }), 0);

    // A tenant that is not on the official API is never sent by this worker, and its campaign is left alone
    const legacy = await createTenant('legacy', { provider: 'BAILEYS' });
    await createContact(legacy.tenantId, 'Legacy Contact', { customFields: { plan: 'Gold', quote_id: 'Q1' } });
    const legacyTemplate = await createTemplate(legacy.tenantId);
    const legacyCampaign = await createCampaign(legacy.tenantId, legacyTemplate.id);
    await runTicks(meta, 2);
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: legacyCampaign.id } })).status, 'QUEUED');
    assert.equal(meta.sent.length, 0);
  });

  test('5. Meta errors: a bad number fails only that contact, a temporary limit is retried later', async () => {
    const meta = fakeMeta();
    const t = await createTenant('errors');
    const good = await createContact(t.tenantId, 'Good One', { customFields: { plan: 'Gold', quote_id: 'Q1' } });
    const notOnWhatsApp = await createContact(t.tenantId, 'Not OnWhatsApp', { customFields: { plan: 'Gold', quote_id: 'Q2' } });
    const limited = await createContact(t.tenantId, 'Rate Limited', { customFields: { plan: 'Gold', quote_id: 'Q3' } });
    meta.failWith.set(notOnWhatsApp.phoneDigits, { status: 400, code: 131026, message: 'Message undeliverable' });
    meta.failOnce.set(limited.phoneDigits, { status: 400, code: 131056, message: 'Pair rate limit hit' });

    const template = await createTemplate(t.tenantId);
    const campaign = await createCampaign(t.tenantId, template.id);
    await runTicks(meta, 2);

    const jobs = new Map((await prisma.broadcastJob.findMany({ where: { campaignId: campaign.id } })).map((j) => [j.customerId, j]));
    assert.equal(jobs.get(good.id)!.status, 'SENT');
    assert.equal(jobs.get(notOnWhatsApp.id)!.status, 'FAILED');
    assert.match(jobs.get(notOnWhatsApp.id)!.lastError || '', /131026/);
    assert.ok(!(jobs.get(notOnWhatsApp.id)!.lastError || '').includes(TOKEN));
    const retry = jobs.get(limited.id)!;
    assert.equal(retry.status, 'PENDING', 'A temporary limit is not a failure');
    assert.ok(retry.scheduledFor.getTime() > Date.now() + 30_000, 'It is tried again later, not immediately');
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'SENDING');

    // Later the retry goes through and the campaign completes
    const later = new Date(Date.now() + 10 * 60_000);
    await runTicks(meta, 2, () => later);
    assert.equal((await prisma.broadcastJob.findUniqueOrThrow({ where: { id: retry.id } })).status, 'SENT');
    const done = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(done.status, 'COMPLETED');
    assert.equal(done.sent, 2);
    assert.equal(done.failed, 1);
  });

  test('6. An account-level problem pauses the campaign instead of failing every contact', async () => {
    const meta = fakeMeta();
    const t = await createTenant('pause');
    for (let i = 0; i < 4; i++) await createContact(t.tenantId, `Contact ${i}`, { customFields: { plan: 'Gold', quote_id: `Q${i}` } });
    const template = await createTemplate(t.tenantId);
    const campaign = await createCampaign(t.tenantId, template.id);

    meta.failWith.set('*', { status: 401, code: 190, message: 'Error validating access token' });
    await runTicks(meta, 2);

    const paused = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(paused.status, 'PAUSED');
    assert.match(paused.lastError || '', /access token is no longer valid/i);
    assert.ok(!(paused.lastError || '').includes(TOKEN));
    const counts = await prisma.broadcastJob.groupBy({ by: ['status'], where: { campaignId: campaign.id }, _count: { _all: true } });
    assert.deepEqual(counts.map((c) => [c.status, c._count._all]), [['PENDING', 4]], 'No contact is marked failed for an account problem');
    const attempts = await prisma.broadcastJob.aggregate({ where: { campaignId: campaign.id }, _max: { attempts: true } });
    assert.equal(attempts._max.attempts, 0, 'The stopped attempt is not counted against the contact');

    // The owner fixes the token and resumes: everyone is sent
    meta.failWith.clear();
    await prisma.broadcastCampaign.update({ where: { id: campaign.id }, data: { status: 'SENDING', lastError: null } });
    await runTicks(meta, 2);
    assert.equal(meta.sent.length, 4);
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'COMPLETED');

    // A template that Meta pauses mid-campaign also pauses the campaign
    const t2 = await createTenant('tplpause');
    await createContact(t2.tenantId, 'Only One', { customFields: { plan: 'Gold', quote_id: 'Q1' } });
    const tpl2 = await createTemplate(t2.tenantId);
    const camp2 = await createCampaign(t2.tenantId, tpl2.id, { status: 'SENDING', startedAt: new Date() });
    await runCampaignTick({ perLoopCap: 0, whatsappDeps: { fetchImpl: meta.fetchImpl } });
    await prisma.template.update({ where: { id: tpl2.id }, data: { status: 'PAUSED' } });
    const before = meta.sent.length;
    await runTicks(meta, 2);
    assert.equal(meta.sent.length, before);
    const p2 = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: camp2.id } });
    assert.equal(p2.status, 'PAUSED');
    assert.match(p2.lastError || '', /no longer approved by Meta \(status: PAUSED\)/);
  });

  test('7. The number\'s Meta messaging limit is respected over a rolling 24 hours', async () => {
    const meta = fakeMeta();
    const t = await createTenant('tier', { tier: 'TIER_50' });
    for (let i = 0; i < 60; i++) await createContact(t.tenantId, `Bulk ${i}`, { customFields: { plan: 'Gold', quote_id: `Q${i}` } });
    const template = await createTemplate(t.tenantId);
    const campaign = await createCampaign(t.tenantId, template.id);

    const start = new Date();
    await runTicks(meta, 4, () => start);
    assert.equal(meta.sent.length, 50, 'No more than the tier allows');
    const mid = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(mid.status, 'SENDING');
    assert.equal(await prisma.broadcastJob.count({ where: { campaignId: campaign.id, status: 'PENDING' } }), 10);

    // Still inside the 24 hours: nothing more
    const sameDay = new Date(start.getTime() + 12 * 3600_000);
    await runTicks(meta, 2, () => sameDay);
    assert.equal(meta.sent.length, 50);

    // After 24 hours the rest goes out
    const nextDay = new Date(start.getTime() + 25 * 3600_000);
    await runTicks(meta, 2, () => nextDay);
    assert.equal(meta.sent.length, 60);
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'COMPLETED');
    assert.equal(new Set(meta.sent.map((m) => m.to)).size, 60, 'Nobody was messaged twice');
  });

  test('8. Pause and cancel work for WhatsApp campaigns', async () => {
    const meta = fakeMeta();
    const t = await createTenant('control');
    for (let i = 0; i < 3; i++) await createContact(t.tenantId, `Ctl ${i}`, { customFields: { plan: 'Gold', quote_id: `Q${i}` } });
    const template = await createTemplate(t.tenantId);
    const campaign = await createCampaign(t.tenantId, template.id, { status: 'SENDING', startedAt: new Date() });
    await runCampaignTick({ perLoopCap: 0, whatsappDeps: { fetchImpl: meta.fetchImpl } });

    await prisma.broadcastCampaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
    await runTicks(meta, 2);
    assert.equal(meta.sent.length, 0, 'A paused campaign sends nothing');

    await prisma.broadcastCampaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED' } });
    await runTicks(meta, 2);
    assert.equal(meta.sent.length, 0);
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
});
