import 'dotenv/config';
import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { encrypt } from '../../lib/encryption';
import type { FetchLike } from '../../lib/whatsapp/metaGraph';
import { WhatsAppTemplateError, WhatsAppTemplateService } from '../../lib/whatsapp/templateService';
import {
  buildMetaComponents,
  mapMetaStatus,
  parseMetaComponents,
  validateWhatsAppTemplate,
  type WhatsAppTemplateDraft,
} from '../../lib/whatsapp/templateRules';
import { extractTemplateEvents } from '../../lib/whatsapp/webhookAuth';

const testId = `w2_${Date.now().toString(36)}`;
const digits = String(Date.now()).slice(-9);
const TOKEN = `EAAG_w2_token_${testId}`;
const tenantIds: string[] = [];

async function createTenant(label: string, opts: { meta: boolean; waba?: string; phone?: string }) {
  const tenant = await prisma.tenant.create({
    data: { name: `W2 ${label} ${testId}`, slug: `w2-${label}-${testId}`, status: 'ACTIVE', subscriptionPlan: 'FREE', subscriptionStatus: 'ACTIVE' },
  });
  tenantIds.push(tenant.id);
  if (opts.meta) {
    await prisma.whatsAppNumber.create({
      data: {
        tenantId: tenant.id, sessionData: 'meta_cloud_config', provider: 'META_CLOUD_API', status: 'CONNECTED',
        metaWabaId: opts.waba, metaPhoneNumberId: opts.phone, metaAccessToken: encrypt(TOKEN),
      },
    });
  }
  return tenant.id;
}

/** A stand-in for Meta's template endpoints, holding templates in memory per WhatsApp Business Account. */
function fakeMeta() {
  const store = new Map<string, any>(); // metaTemplateId -> template (with wabaId)
  const calls: Array<{ method: string; path: string; body: any; auth: string }> = [];
  let nextId = 9000;
  let rejectNextCreate: string | null = null;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts[1];
    const edge = parts[2];
    const method = init?.method || 'GET';
    const auth = String((init?.headers as Record<string, string>)?.Authorization || '');
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: `${id}${edge ? `/${edge}` : ''}`, body, auth });
    if (auth !== `Bearer ${TOKEN}`) return json(401, { error: { message: 'Invalid OAuth access token.', code: 190 } });

    if (edge === 'message_templates' && method === 'POST') {
      if (rejectNextCreate) {
        const msg = rejectNextCreate;
        rejectNextCreate = null;
        return json(400, { error: { message: 'Invalid parameter', code: 100, error_subcode: 2388299, error_user_title: 'Template refused', error_user_msg: msg } });
      }
      const metaId = String(nextId++);
      store.set(metaId, { id: metaId, wabaId: id, name: body.name, language: body.language, category: body.category, status: 'PENDING', components: body.components });
      return json(200, { id: metaId, status: 'PENDING', category: body.category });
    }
    if (edge === 'message_templates' && method === 'GET') {
      const data = [...store.values()].filter((t) => t.wabaId === id).map(({ wabaId: _w, ...t }) => t);
      return json(200, { data });
    }
    if (edge === 'message_templates' && method === 'DELETE') {
      const hsm = u.searchParams.get('hsm_id') || '';
      if (!store.has(hsm)) return json(400, { error: { message: 'Template does not exist', code: 100 } });
      store.delete(hsm);
      return json(200, { success: true });
    }
    if (!edge && store.has(id)) {
      if (method === 'POST') {
        const t = store.get(id);
        t.components = body.components;
        t.status = 'PENDING';
        t.rejected_reason = 'NONE';
        return json(200, { success: true });
      }
      const { wabaId: _w, ...t } = store.get(id);
      return json(200, t);
    }
    return json(400, { error: { message: 'Unsupported request - object does not exist', code: 100 } });
  };

  return {
    fetchImpl,
    calls,
    store,
    setStatus(metaId: string, status: string, extra: Record<string, unknown> = {}) {
      Object.assign(store.get(metaId), { status, ...extra });
    },
    addRemote(wabaId: string, t: Record<string, unknown>) {
      const metaId = String(nextId++);
      store.set(metaId, { id: metaId, wabaId, status: 'APPROVED', language: 'en', category: 'MARKETING', ...t });
      return metaId;
    },
    refuseNextCreate(message: string) {
      rejectNextCreate = message;
    },
  };
}

const goodDraft: WhatsAppTemplateDraft = {
  name: 'renewal_offer',
  language: 'en',
  category: 'MARKETING',
  headerType: 'TEXT',
  header: 'Offer for {{1}}',
  body: 'Hello {{1}}, your plan {{2}} is ready to renew. Reply YES to continue.',
  footer: 'Reply STOP to unsubscribe',
  buttons: [
    { type: 'QUICK_REPLY', text: 'Yes' },
    { type: 'URL', text: 'View quote', url: 'https://example.com/quote/{{1}}' },
    { type: 'PHONE', text: 'Call us', phoneNumber: '+1 415 555 0100' },
  ],
  variables: {
    header: [{ index: 1, example: 'Priya' }],
    body: [{ index: 1, example: 'Priya', source: 'first_name' }, { index: 2, example: 'Gold Health' }],
    buttonUrlExample: 'abc123',
  },
};

describe('Step W2: WhatsApp templates', () => {
  const WABA_A = `71${digits}1`;
  const WABA_B = `71${digits}2`;
  let tenantA = '';
  let tenantB = '';
  let tenantNoMeta = '';
  const meta = fakeMeta();

  async function createLocal(tenantId: string, overrides: Record<string, unknown> = {}) {
    return prisma.template.create({
      data: {
        tenantId, channel: 'WHATSAPP', name: `tpl_${Math.random().toString(36).slice(2, 10)}`, language: 'en', category: 'MARKETING',
        headerType: 'NONE', body: 'Hello {{1}}, thanks for choosing us today.', content: '',
        variables: { body: [{ index: 1, example: 'Priya', source: 'first_name' }] },
        ...overrides,
      } as any,
    });
  }

  test('setup', async () => {
    tenantA = await createTenant('a', { meta: true, waba: WABA_A, phone: `81${digits}1` });
    tenantB = await createTenant('b', { meta: true, waba: WABA_B, phone: `81${digits}2` });
    tenantNoMeta = await createTenant('nometa', { meta: false });
  });

  test('1. Rules: a correct template has no problems and converts to Meta\'s format', () => {
    assert.deepEqual(validateWhatsAppTemplate(goodDraft), []);
    const components = buildMetaComponents(goodDraft);
    assert.deepEqual(components.map((c) => c.type), ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']);
    assert.deepEqual(components[0], { type: 'HEADER', format: 'TEXT', text: 'Offer for {{1}}', example: { header_text: ['Priya'] } });
    assert.deepEqual(components[1].example, { body_text: [['Priya', 'Gold Health']] });
    assert.deepEqual(components[3].buttons, [
      { type: 'QUICK_REPLY', text: 'Yes' },
      { type: 'URL', text: 'View quote', url: 'https://example.com/quote/{{1}}', example: ['https://example.com/quote/abc123'] },
      { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+14155550100' },
    ]);

    // Reading Meta's format back gives the same content
    const parsed = parseMetaComponents(components);
    assert.equal(parsed.headerType, 'TEXT');
    assert.equal(parsed.body, goodDraft.body);
    assert.equal(parsed.footer, goodDraft.footer);
    assert.equal(parsed.buttons.length, 3);
    assert.equal(parsed.variables.buttonUrlExample, 'abc123');
    assert.deepEqual(parsed.variables.body?.map((v) => v.example), ['Priya', 'Gold Health']);
    assert.equal(parsed.unsupported, null);

    // No variables: no example block is sent
    const plain = buildMetaComponents({ ...goodDraft, headerType: 'NONE', body: 'Our office is closed on Sunday.', buttons: [], variables: null, footer: '' });
    assert.deepEqual(plain, [{ type: 'BODY', text: 'Our office is closed on Sunday.' }]);
  });

  test('2. Rules: each of Meta\'s limits is reported in plain language', () => {
    const problemsFor = (patch: Partial<WhatsAppTemplateDraft>) => validateWhatsAppTemplate({ ...goodDraft, ...patch }).join(' | ');

    assert.match(problemsFor({ name: 'Bad Name!' }), /lowercase letters, numbers and underscores/);
    assert.match(problemsFor({ language: 'english' }), /language code/);
    assert.match(problemsFor({ category: 'AUTHENTICATION' }), /not supported yet/);
    assert.match(problemsFor({ body: '' }), /body is empty/);
    assert.match(problemsFor({ body: 'x'.repeat(1025), variables: {} }), /too long: 1025/);
    assert.match(problemsFor({ body: 'Hi {{1}} and {{3}} there.' }), /no gaps/);
    assert.match(problemsFor({ body: '{{1}} hello there friend' }), /cannot start or end with a variable/);
    assert.match(problemsFor({ body: 'hello there friend {{1}}' }), /cannot start or end with a variable/);
    assert.match(problemsFor({ body: 'Hi {{1}}{{2}} there.' }), /next to each other/);
    assert.match(problemsFor({ body: 'Hi {{first_name}}, welcome.' }), /not a valid variable/);
    // A missing sample value is reported, never invented
    assert.match(problemsFor({ variables: { header: [{ index: 1, example: 'Priya' }], body: [{ index: 1, example: 'Priya' }], buttonUrlExample: 'x' } }), /sample value for \{\{2\}\}/);
    assert.match(problemsFor({ variables: { ...goodDraft.variables, header: [] } }), /Header: add a sample value/);
    assert.match(problemsFor({ variables: { ...goodDraft.variables, buttonUrlExample: '' } }), /sample value for the web address/);

    assert.match(problemsFor({ header: 'x'.repeat(61) }), /header is too long/);
    assert.match(problemsFor({ header: 'A {{1}} and {{2}}' }), /only one variable/);
    assert.match(problemsFor({ headerType: 'IMAGE' }), /not supported yet/);
    assert.match(problemsFor({ footer: 'x'.repeat(61) }), /footer is too long/);
    assert.match(problemsFor({ footer: 'Bye {{1}}' }), /footer cannot contain variables/);

    assert.match(problemsFor({ buttons: [{ type: 'QUICK_REPLY', text: 'x'.repeat(26) }] }), /text is too long/);
    assert.match(problemsFor({ buttons: [{ type: 'QUICK_REPLY', text: 'Yes' }, { type: 'QUICK_REPLY', text: 'yes' }] }), /same text/);
    assert.match(problemsFor({ buttons: [{ type: 'URL', text: 'Go', url: 'example.com' }] }), /starting with https/);
    assert.match(problemsFor({ buttons: [{ type: 'URL', text: 'Go', url: 'https://example.com/{{1}}/more' }] }), /very end of the web address/);
    assert.match(problemsFor({ buttons: [{ type: 'PHONE', text: 'Call', phoneNumber: '5550100' }] }), /country code/);
    assert.match(problemsFor({ buttons: [{ type: 'PHONE', text: 'Call', phoneNumber: '+14155550100' }, { type: 'PHONE', text: 'Call 2', phoneNumber: '+14155550101' }] }), /Only 1 call button/);
    assert.match(
      problemsFor({ buttons: [{ type: 'QUICK_REPLY', text: 'A' }, { type: 'URL', text: 'B', url: 'https://example.com' }, { type: 'QUICK_REPLY', text: 'C' }] }),
      /cannot be mixed/
    );
    assert.match(problemsFor({ buttons: Array.from({ length: 3 }, (_, i) => ({ type: 'URL' as const, text: `Site ${i}`, url: 'https://example.com' })) }), /Too many website buttons/);

    assert.equal(mapMetaStatus('APPROVED'), 'APPROVED');
    assert.equal(mapMetaStatus('IN_APPEAL'), 'PENDING');
    assert.equal(mapMetaStatus('SOMETHING_NEW'), 'PENDING', 'An unknown status is never treated as approved');
    assert.equal(mapMetaStatus('PENDING_DELETION'), 'DISABLED');
  });

  test('3. Submit: the template goes to Meta and becomes PENDING, never APPROVED on its own', async () => {
    const tpl = await createLocal(tenantA, { name: `welcome_${testId}`, footer: 'Reply STOP to unsubscribe' });
    assert.equal(tpl.status, 'DRAFT');
    assert.equal(WhatsAppTemplateService.isSendable(tpl), false);

    const submitted = await WhatsAppTemplateService.submit(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });
    assert.equal(submitted.status, 'PENDING');
    assert.ok(submitted.metaTemplateId);
    assert.ok(submitted.submittedAt);
    assert.equal(WhatsAppTemplateService.isSendable(submitted), false, 'A template in review cannot be sent');

    const call = meta.calls.find((c) => c.method === 'POST' && c.path === `${WABA_A}/message_templates`);
    assert.ok(call, 'It was posted to this tenant\'s own WhatsApp Business Account');
    assert.equal(call!.body.name, `welcome_${testId}`);
    assert.equal(call!.body.category, 'MARKETING');
    assert.deepEqual(call!.body.components[0], { type: 'BODY', text: 'Hello {{1}}, thanks for choosing us today.', example: { body_text: [['Priya']] } });

    // Submitting again while in review is refused
    await assert.rejects(WhatsAppTemplateService.submit(tenantA, tpl.id, { fetchImpl: meta.fetchImpl }), /already waiting/);

    // Meta approves: a refresh picks it up, and only now can it be sent
    meta.setStatus(submitted.metaTemplateId!, 'APPROVED', { quality_score: { score: 'GREEN' } });
    const refreshed = await WhatsAppTemplateService.refreshOne(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });
    assert.equal(refreshed.status, 'APPROVED');
    assert.equal(refreshed.qualityScore, 'GREEN');
    assert.equal(WhatsAppTemplateService.isSendable(refreshed), true);
  });

  test('4. Invalid template or Meta refusal: nothing is sent or marked pending, and the reason is given', async () => {
    const bad = await createLocal(tenantA, { body: 'Hello {{1}}', variables: {} });
    const before = meta.calls.length;
    await assert.rejects(WhatsAppTemplateService.submit(tenantA, bad.id, { fetchImpl: meta.fetchImpl }), (err: unknown) => {
      assert.ok(err instanceof WhatsAppTemplateError);
      assert.equal(err.status, 400);
      assert.ok(err.problems.length >= 2);
      assert.match(err.message, /cannot start or end with a variable/);
      assert.match(err.message, /sample value/);
      return true;
    });
    assert.equal(meta.calls.length, before, 'Meta is not called for a template that breaks the rules');
    assert.equal((await prisma.template.findUniqueOrThrow({ where: { id: bad.id } })).status, 'DRAFT');

    const ok = await createLocal(tenantA);
    meta.refuseNextCreate('There is already English content for this template.');
    await assert.rejects(WhatsAppTemplateService.submit(tenantA, ok.id, { fetchImpl: meta.fetchImpl }), (err: unknown) => {
      assert.ok(err instanceof WhatsAppTemplateError);
      assert.match(err.message, /already English content/);
      assert.ok(!err.message.includes(TOKEN));
      return true;
    });
    const after = await prisma.template.findUniqueOrThrow({ where: { id: ok.id } });
    assert.equal(after.status, 'DRAFT');
    assert.equal(after.metaTemplateId, null);
  });

  test('5. Without the official WhatsApp API connected, a template cannot be submitted', async () => {
    const tpl = await createLocal(tenantNoMeta);
    await assert.rejects(WhatsAppTemplateService.submit(tenantNoMeta, tpl.id, { fetchImpl: meta.fetchImpl }), (err: unknown) => {
      assert.ok(err instanceof WhatsAppTemplateError);
      assert.equal(err.status, 409);
      assert.match(err.message, /Cloud API must be connected first/);
      return true;
    });
    assert.equal((await prisma.template.findUniqueOrThrow({ where: { id: tpl.id } })).status, 'DRAFT');
  });

  test('6. Rejection: the reason is stored, and a corrected template is sent back for review', async () => {
    const tpl = await createLocal(tenantA, { name: `promo_${testId}` });
    const submitted = await WhatsAppTemplateService.submit(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });
    meta.setStatus(submitted.metaTemplateId!, 'REJECTED', { rejected_reason: 'INVALID_FORMAT' });

    const rejected = await WhatsAppTemplateService.refreshOne(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.rejectionReason, 'INVALID_FORMAT');
    assert.equal(WhatsAppTemplateService.isSendable(rejected), false);

    await prisma.template.update({ where: { id: tpl.id }, data: { body: 'Hello {{1}}, here is our corrected offer for you.' } });
    const again = await WhatsAppTemplateService.submit(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });
    assert.equal(again.status, 'PENDING');
    assert.equal(again.rejectionReason, null);
    assert.equal(again.metaTemplateId, submitted.metaTemplateId, 'The same Meta template is updated, not duplicated');
    const update = meta.calls.find((c) => c.method === 'POST' && c.path === submitted.metaTemplateId);
    assert.ok(update);
    assert.match(update!.body.components[0].text, /corrected offer/);
  });

  test('7. Sync: statuses are updated, Meta-only templates are imported, deleted ones are disabled', async () => {
    const pending = await createLocal(tenantA, { name: `sync_pending_${testId}` });
    const sub = await WhatsAppTemplateService.submit(tenantA, pending.id, { fetchImpl: meta.fetchImpl });
    meta.setStatus(sub.metaTemplateId!, 'APPROVED', { category: 'UTILITY' });

    const remoteId = meta.addRemote(WABA_A, {
      name: `made_at_meta_${testId}`,
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Welcome' },
        { type: 'BODY', text: 'Hi {{1}}, your order has shipped today.', example: { body_text: [['Sam']] } },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Thanks' }] },
      ],
    });
    const imageId = meta.addRemote(WABA_A, {
      name: `image_tpl_${testId}`,
      components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'New arrivals this week.' }],
    });
    // A template in another tenant's account must never appear here
    meta.addRemote(WABA_B, { name: `other_tenant_${testId}`, components: [{ type: 'BODY', text: 'Belongs to B.' }] });

    const gone = await createLocal(tenantA, { name: `deleted_at_meta_${testId}`, status: 'APPROVED', metaTemplateId: '1234500000' });

    const result = await WhatsAppTemplateService.syncTenant(tenantA, { fetchImpl: meta.fetchImpl });
    assert.equal(result.imported, 2);
    assert.equal(result.missingAtMeta, 1);

    const synced = await prisma.template.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(synced.status, 'APPROVED');
    assert.equal(synced.category, 'UTILITY', 'Meta decides the category');

    const imported = await prisma.template.findFirstOrThrow({ where: { tenantId: tenantA, metaTemplateId: remoteId } });
    assert.equal(imported.status, 'APPROVED');
    assert.equal(imported.headerType, 'TEXT');
    assert.equal(imported.header, 'Welcome');
    assert.equal(imported.body, 'Hi {{1}}, your order has shipped today.');
    assert.deepEqual(imported.ctaButtons, [{ type: 'QUICK_REPLY', text: 'Thanks' }]);

    const image = await prisma.template.findFirstOrThrow({ where: { tenantId: tenantA, metaTemplateId: imageId } });
    assert.equal(image.status, 'DISABLED', 'A template we cannot send is not offered as usable');
    assert.match(image.rejectionReason || '', /image header/);

    const disabled = await prisma.template.findUniqueOrThrow({ where: { id: gone.id } });
    assert.equal(disabled.status, 'DISABLED');
    assert.match(disabled.rejectionReason || '', /no longer exists at Meta/);

    assert.equal(await prisma.template.count({ where: { tenantId: tenantA, name: `other_tenant_${testId}` } }), 0);
    assert.equal(await prisma.template.count({ where: { tenantId: tenantB, name: { contains: testId } } }), 0, 'Syncing A changes nothing in B');

    // Running it again imports nothing twice
    const second = await WhatsAppTemplateService.syncTenant(tenantA, { fetchImpl: meta.fetchImpl });
    assert.equal(second.imported, 0);
    assert.equal(second.missingAtMeta, 0);
  });

  test('8. Webhook event: the status is read from Meta, so a forged event cannot approve a template', async () => {
    const tpl = await createLocal(tenantA, { name: `hook_${testId}` });
    const sub = await WhatsAppTemplateService.submit(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });

    const forged = {
      object: 'whatsapp_business_account',
      entry: [{ id: WABA_A, changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: Number(sub.metaTemplateId), message_template_name: tpl.name } }] }],
    };
    const events = extractTemplateEvents(forged);
    assert.deepEqual(events, [{ wabaId: WABA_A, metaTemplateId: sub.metaTemplateId }]);

    // Meta still says PENDING, whatever the event claims
    let res = await WhatsAppTemplateService.handleWebhookEvent(events[0], { fetchImpl: meta.fetchImpl });
    assert.equal(res.refreshed, 1);
    assert.equal((await prisma.template.findUniqueOrThrow({ where: { id: tpl.id } })).status, 'PENDING');

    // Once Meta really approves, the same event brings the real status in
    meta.setStatus(sub.metaTemplateId!, 'APPROVED');
    await WhatsAppTemplateService.handleWebhookEvent(events[0], { fetchImpl: meta.fetchImpl });
    assert.equal((await prisma.template.findUniqueOrThrow({ where: { id: tpl.id } })).status, 'APPROVED');

    // Meta pauses it for low quality
    meta.setStatus(sub.metaTemplateId!, 'PAUSED');
    await WhatsAppTemplateService.handleWebhookEvent(events[0], { fetchImpl: meta.fetchImpl });
    const paused = await prisma.template.findUniqueOrThrow({ where: { id: tpl.id } });
    assert.equal(paused.status, 'PAUSED');
    assert.equal(WhatsAppTemplateService.isSendable(paused), false);

    // An event naming another account, or an unknown template, changes nothing
    res = await WhatsAppTemplateService.handleWebhookEvent({ wabaId: WABA_B, metaTemplateId: sub.metaTemplateId! }, { fetchImpl: meta.fetchImpl });
    assert.equal(res.refreshed, 0);
    res = await WhatsAppTemplateService.handleWebhookEvent({ wabaId: '999', metaTemplateId: '1' }, { fetchImpl: meta.fetchImpl });
    assert.equal(res.refreshed, 0);
    assert.deepEqual(extractTemplateEvents({ object: 'page', entry: [] }), []);
  });

  test('9. Periodic pull picks up approvals for every tenant with templates in review', async () => {
    const a = await createLocal(tenantA, { name: `pull_a_${testId}` });
    const b = await createLocal(tenantB, { name: `pull_b_${testId}` });
    const subA = await WhatsAppTemplateService.submit(tenantA, a.id, { fetchImpl: meta.fetchImpl });
    const subB = await WhatsAppTemplateService.submit(tenantB, b.id, { fetchImpl: meta.fetchImpl });
    meta.setStatus(subA.metaTemplateId!, 'APPROVED');
    meta.setStatus(subB.metaTemplateId!, 'REJECTED', { rejected_reason: 'PROMOTIONAL' });

    const result = await WhatsAppTemplateService.syncPendingTenants({ fetchImpl: meta.fetchImpl, limit: 1000 });
    assert.ok(result.tenants >= 2);
    assert.equal((await prisma.template.findUniqueOrThrow({ where: { id: a.id } })).status, 'APPROVED');
    const rejected = await prisma.template.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.rejectionReason, 'PROMOTIONAL');
    // B's sync used B's account only
    assert.equal(await prisma.template.count({ where: { tenantId: tenantB, name: { startsWith: 'made_at_meta' } } }), 0);
  });

  test('10. Delete: removed at Meta too; another tenant cannot touch it; in-use templates are protected', async () => {
    const tpl = await createLocal(tenantA, { name: `del_${testId}` });
    const sub = await WhatsAppTemplateService.submit(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });
    assert.ok(meta.store.has(sub.metaTemplateId!));

    // Tenant isolation
    await assert.rejects(WhatsAppTemplateService.remove(tenantB, tpl.id, { fetchImpl: meta.fetchImpl }), /not found/i);
    await assert.rejects(WhatsAppTemplateService.submit(tenantB, tpl.id, { fetchImpl: meta.fetchImpl }), /not found/i);
    await assert.rejects(WhatsAppTemplateService.refreshOne(tenantB, tpl.id, { fetchImpl: meta.fetchImpl }), /not found/i);
    assert.ok(meta.store.has(sub.metaTemplateId!));

    // Used by a campaign that has not finished
    const campaign = await prisma.broadcastCampaign.create({
      data: { tenantId: tenantA, name: `uses ${testId}`, channel: 'WHATSAPP', status: 'QUEUED', templateId: tpl.id },
    });
    await assert.rejects(WhatsAppTemplateService.remove(tenantA, tpl.id, { fetchImpl: meta.fetchImpl }), /has not finished/);
    await prisma.broadcastCampaign.update({ where: { id: campaign.id }, data: { status: 'COMPLETED' } });

    await WhatsAppTemplateService.remove(tenantA, tpl.id, { fetchImpl: meta.fetchImpl });
    assert.equal(meta.store.has(sub.metaTemplateId!), false, 'Deleted at Meta');
    assert.equal(await prisma.template.findUnique({ where: { id: tpl.id } }), null);

    // A draft that was never submitted is deleted without calling Meta
    const draft = await createLocal(tenantA);
    const before = meta.calls.length;
    await WhatsAppTemplateService.remove(tenantA, draft.id, { fetchImpl: meta.fetchImpl });
    assert.equal(meta.calls.length, before);
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
});
