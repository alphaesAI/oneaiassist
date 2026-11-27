import 'dotenv/config';
import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { prisma } from '../../lib/db';
import { decrypt, encrypt } from '../../lib/encryption';
import { WhatsAppConnectionError, WhatsAppConnectionService } from '../../lib/whatsapp/connection';
import crypto from 'node:crypto';
import { captureRawBody, isValidWebhookVerifyToken, findTenantIdByPhoneNumberId } from '../../lib/whatsapp/webhookAuth';
import type { FetchLike } from '../../lib/whatsapp/metaGraph';
import { TransportManager } from '../../whatsapp-engine/transport/TransportManager';
import { MetaCloudTransportAdapter } from '../../whatsapp-engine/transport/MetaCloudTransportAdapter';
import { createMetaWebhookRouter } from '../../whatsapp-engine/routes/metaWebhook';

const testId = `w1_${Date.now().toString(36)}`;
const tenantIds: string[] = [];
const uniqueDigits = String(Date.now()).slice(-9);
const WABA = `77${uniqueDigits}1`;
const PHONE = `88${uniqueDigits}1`;
const OTHER_PHONE = `88${uniqueDigits}2`;
const TOKEN = `EAAG_test_token_${testId}_secret_value`;

async function createTenant(label: string) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `W1 ${label} ${testId}`, slug: `w1-${label}-${testId}`, status: 'ACTIVE',
      subscriptionPlan: 'FREE', subscriptionStatus: 'ACTIVE',
    },
  });
  tenantIds.push(tenant.id);
  return tenant.id;
}

interface FakeMetaOptions {
  validToken?: string;
  wabaPhones?: Record<string, string[]>;
  tier?: string | null;
  subscribeFails?: boolean;
  networkDown?: boolean;
}

/** Stands in for the Meta Graph API. Records every call so tests can check what was sent. */
function fakeMeta(opts: FakeMetaOptions = {}) {
  const validToken = opts.validToken ?? TOKEN;
  const wabaPhones = opts.wabaPhones ?? { [WABA]: [PHONE] };
  const calls: Array<{ method: string; url: string; auth: string }> = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method || 'GET';
    const auth = String((init?.headers as Record<string, string>)?.Authorization || '');
    calls.push({ method, url, auth });
    if (opts.networkDown) throw new Error('getaddrinfo ENOTFOUND graph.facebook.com');
    if (auth !== `Bearer ${validToken}`) {
      return json(401, { error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } });
    }
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean); // [version, id, edge?]
    const id = parts[1];
    const edge = parts[2];
    if (edge === 'phone_numbers') {
      if (!wabaPhones[id]) return json(400, { error: { message: 'Unsupported get request.', code: 100, error_subcode: 33 } });
      return json(200, { data: wabaPhones[id].map((p) => ({ id: p })) });
    }
    if (edge === 'subscribed_apps') {
      if (opts.subscribeFails) return json(403, { error: { message: 'Missing permission.', code: 200 } });
      return json(200, { success: true });
    }
    const known = Object.values(wabaPhones).flat();
    if (!known.includes(id) && id !== OTHER_PHONE) {
      return json(400, { error: { message: 'Object does not exist.', code: 100, error_subcode: 33 } });
    }
    if (u.searchParams.get('fields') === 'messaging_limit_tier') {
      if (opts.tier === null) return json(400, { error: { message: 'Tried accessing nonexisting field', code: 100 } });
      return json(200, { messaging_limit_tier: opts.tier ?? 'TIER_1K', id });
    }
    return json(200, { id, display_phone_number: '+1 555 010 0199', verified_name: 'W1 Test Business', quality_rating: 'GREEN' });
  };
  return { fetchImpl, calls };
}

describe('Step W1: WhatsApp Cloud API connection', () => {
  let tenantA = '';
  let tenantB = '';

  test('setup', async () => {
    tenantA = await createTenant('a');
    tenantB = await createTenant('b');
  });

  test('1. Valid credentials: connected only after Meta confirms; details saved; token stored encrypted', async () => {
    const meta = fakeMeta();
    const before = await WhatsAppConnectionService.getView(tenantA);
    assert.equal(before.status, 'DISCONNECTED');
    assert.equal(before.accessTokenConfigured, false);

    const { view, warning } = await WhatsAppConnectionService.saveAndVerify(
      tenantA,
      { wabaId: WABA, phoneNumberId: PHONE, accessToken: TOKEN },
      { fetchImpl: meta.fetchImpl }
    );
    assert.equal(warning, null);
    assert.equal(view.status, 'CONNECTED');
    assert.equal(view.provider, 'META_CLOUD_API');
    assert.equal(view.displayPhoneNumber, '+1 555 010 0199');
    assert.equal(view.verifiedName, 'W1 Test Business');
    assert.equal(view.qualityRating, 'GREEN');
    assert.equal(view.messagingLimitTier, 'TIER_1K');
    assert.equal(view.webhookSubscribed, true);
    assert.ok(view.lastVerifiedAt);

    const row = await prisma.whatsAppNumber.findUniqueOrThrow({ where: { tenantId: tenantA } });
    assert.notEqual(row.metaAccessToken, TOKEN, 'The token must not be stored in plain text');
    assert.ok(!String(row.metaAccessToken).includes(TOKEN));
    assert.equal(decrypt(row.metaAccessToken!), TOKEN);
    assert.equal(row.metaVerifyToken, null);

    // The token only ever travels in the Authorization header, never in a URL
    assert.ok(meta.calls.length >= 3);
    for (const call of meta.calls) assert.ok(!call.url.includes(TOKEN), 'Token must not appear in a URL');
    assert.ok(meta.calls.some((c) => c.method === 'POST' && c.url.includes(`/${WABA}/subscribed_apps`)));
  });

  test('2. The real token is never returned; saving with an empty or masked token keeps the saved one', async () => {
    const view = await WhatsAppConnectionService.getView(tenantA);
    assert.ok(!JSON.stringify(view).includes(TOKEN));
    assert.equal(view.accessTokenConfigured, true);
    assert.match(view.metaAccessToken, /^•+$/);

    for (const typed of ['', view.metaAccessToken]) {
      const meta = fakeMeta();
      const res = await WhatsAppConnectionService.saveAndVerify(
        tenantA,
        { wabaId: WABA, phoneNumberId: PHONE, accessToken: typed },
        { fetchImpl: meta.fetchImpl }
      );
      assert.equal(res.view.status, 'CONNECTED');
      assert.ok(meta.calls.every((c) => c.auth === `Bearer ${TOKEN}`), 'The saved token is used');
      const row = await prisma.whatsAppNumber.findUniqueOrThrow({ where: { tenantId: tenantA } });
      assert.equal(decrypt(row.metaAccessToken!), TOKEN);
    }
  });

  test('3. Meta rejects the token: nothing is saved as connected and the token never leaks', async () => {
    const meta = fakeMeta();
    const badToken = `EAAG_wrong_${testId}_token`;
    await assert.rejects(
      WhatsAppConnectionService.saveAndVerify(
        tenantB,
        { wabaId: WABA, phoneNumberId: OTHER_PHONE, accessToken: badToken },
        { fetchImpl: meta.fetchImpl }
      ),
      (err: unknown) => {
        assert.ok(err instanceof WhatsAppConnectionError);
        assert.equal(err.status, 400);
        assert.match(err.message, /rejected the access token/i);
        assert.match(err.message, /code 190/);
        assert.ok(!err.message.includes(badToken));
        return true;
      }
    );
    assert.equal(await prisma.whatsAppNumber.findUnique({ where: { tenantId: tenantB } }), null, 'No row is created by a failed attempt');
    assert.ok(!meta.calls.some((c) => c.url.includes('subscribed_apps')), 'No subscription is attempted after a refusal');
  });

  test('4. A phone number that is not part of the account is refused', async () => {
    const meta = fakeMeta({ wabaPhones: { [WABA]: [PHONE] } });
    await assert.rejects(
      WhatsAppConnectionService.saveAndVerify(
        tenantB,
        { wabaId: WABA, phoneNumberId: OTHER_PHONE, accessToken: TOKEN },
        { fetchImpl: meta.fetchImpl }
      ),
      /not part of this WhatsApp Business Account/i
    );
    assert.equal(await prisma.whatsAppNumber.findUnique({ where: { tenantId: tenantB } }), null);
  });

  test('5. A phone number already connected to another tenant is refused, in the service and in the database', async () => {
    const meta = fakeMeta();
    await assert.rejects(
      WhatsAppConnectionService.saveAndVerify(
        tenantB,
        { wabaId: WABA, phoneNumberId: PHONE, accessToken: TOKEN },
        { fetchImpl: meta.fetchImpl }
      ),
      (err: unknown) => err instanceof WhatsAppConnectionError && err.status === 409
    );
    assert.equal(meta.calls.length, 0, 'Meta is not even asked');
    await assert.rejects(
      prisma.whatsAppNumber.create({
        data: { tenantId: tenantB, sessionData: 'x', provider: 'META_CLOUD_API', metaPhoneNumberId: PHONE },
      }),
      /Unique constraint/i
    );
  });

  test('6. Input is validated before Meta is called', async () => {
    const meta = fakeMeta();
    await assert.rejects(
      WhatsAppConnectionService.saveAndVerify(tenantB, { wabaId: '', phoneNumberId: OTHER_PHONE, accessToken: TOKEN }, { fetchImpl: meta.fetchImpl }),
      /WhatsApp Business Account ID/
    );
    await assert.rejects(
      WhatsAppConnectionService.saveAndVerify(tenantB, { wabaId: WABA, phoneNumberId: 'abc/../x', accessToken: TOKEN }, { fetchImpl: meta.fetchImpl }),
      /Phone Number ID/
    );
    await assert.rejects(
      WhatsAppConnectionService.saveAndVerify(tenantB, { wabaId: WABA, phoneNumberId: OTHER_PHONE, accessToken: '' }, { fetchImpl: meta.fetchImpl }),
      /No WhatsApp access token is saved/
    );
    assert.equal(meta.calls.length, 0);
  });

  test('7. Webhook subscription failure: connected, with a clear warning', async () => {
    const meta = fakeMeta({ subscribeFails: true, tier: null });
    const { view, warning } = await WhatsAppConnectionService.saveAndVerify(
      tenantA,
      { wabaId: WABA, phoneNumberId: PHONE, accessToken: '' },
      { fetchImpl: meta.fetchImpl }
    );
    assert.equal(view.status, 'CONNECTED');
    assert.equal(view.webhookSubscribed, false);
    assert.equal(view.messagingLimitTier, null, 'A tier Meta does not report is left empty, not invented');
    assert.match(warning || '', /will not arrive yet/);
    assert.equal(view.lastError, warning);
  });

  test('8. Test connection: refreshes details; a refusal marks the line not connected; an outage does not', async () => {
    const ok = await WhatsAppConnectionService.testSaved(tenantA, { fetchImpl: fakeMeta({ tier: 'TIER_10K' }).fetchImpl });
    assert.equal(ok.ok, true);
    assert.equal(ok.view.messagingLimitTier, 'TIER_10K');
    assert.equal(ok.view.status, 'CONNECTED');

    const outage = await WhatsAppConnectionService.testSaved(tenantA, { fetchImpl: fakeMeta({ networkDown: true }).fetchImpl });
    assert.equal(outage.ok, false);
    assert.match(outage.error || '', /Could not reach Meta/);
    assert.equal(outage.view.status, 'CONNECTED', 'A network problem says nothing about the credentials');

    const revoked = await WhatsAppConnectionService.testSaved(tenantA, { fetchImpl: fakeMeta({ validToken: 'a_new_token' }).fetchImpl });
    assert.equal(revoked.ok, false);
    assert.equal(revoked.view.status, 'DISCONNECTED');
    assert.match(revoked.view.lastError || '', /rejected the access token/i);
    assert.ok(!JSON.stringify(revoked).includes(TOKEN));

    const back = await WhatsAppConnectionService.testSaved(tenantA, { fetchImpl: fakeMeta().fetchImpl });
    assert.equal(back.view.status, 'CONNECTED');

    // A tenant with nothing set up cannot test, and cannot reach another tenant's configuration
    await assert.rejects(WhatsAppConnectionService.testSaved(tenantB, { fetchImpl: fakeMeta().fetchImpl }), /not set up yet/);
    const viewB = await WhatsAppConnectionService.getView(tenantB);
    assert.equal(viewB.metaPhoneNumberId, '');
    assert.equal(viewB.accessTokenConfigured, false);
  });

  test('9. A Cloud API tenant always sends through Meta with its own decrypted token; never through Baileys', async () => {
    const transport = await TransportManager.resolveTransport(tenantA, 'WHATSAPP');
    assert.ok(transport instanceof MetaCloudTransportAdapter);
    // Asked again (a cached instance must not change the answer)
    assert.ok((await TransportManager.resolveTransport(tenantA)) instanceof MetaCloudTransportAdapter);
    assert.ok((await TransportManager.getTransportAsync(tenantA)) instanceof MetaCloudTransportAdapter);

    const realFetch = globalThis.fetch;
    const seen: Array<{ url: string; auth: string; body: any }> = [];
    globalThis.fetch = (async (url: any, init?: any) => {
      seen.push({ url: String(url), auth: init?.headers?.Authorization, body: JSON.parse(init?.body || '{}') });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.TEST123' }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await transport.sendText('+1 (555) 010-7788', 'Hello from W1');
      assert.equal(result.messageId, 'wamid.TEST123');
      assert.equal(seen.length, 1);
      assert.ok(seen[0].url.endsWith(`/${PHONE}/messages`));
      assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
      assert.equal(seen[0].body.to, '15550107788');

      // A stored value that cannot be decrypted is never sent to Meta as a token
      await prisma.whatsAppNumber.update({ where: { tenantId: tenantA }, data: { metaAccessToken: 'plain_text_token_left_in_db' } });
      await assert.rejects(transport.sendText('+15550107788', 'x'), /could not be read/i);
      assert.equal(seen.length, 1, 'Nothing was sent');

      // Missing token: clear error, and still the Meta transport (no silent fallback)
      await prisma.whatsAppNumber.update({ where: { tenantId: tenantA }, data: { metaAccessToken: null } });
      await assert.rejects(transport.sendText('+15550107788', 'x'), /No WhatsApp access token is saved/);
      assert.ok((await TransportManager.resolveTransport(tenantA)) instanceof MetaCloudTransportAdapter);
      assert.equal(seen.length, 1);
    } finally {
      globalThis.fetch = realFetch;
      await prisma.whatsAppNumber.update({ where: { tenantId: tenantA }, data: { metaAccessToken: encrypt(TOKEN) } });
    }

    // A tenant that is not on the Cloud API does not get the Meta transport
    assert.ok(!((await TransportManager.resolveTransport(tenantB)) instanceof MetaCloudTransportAdapter));
    TransportManager.destroyTransport(tenantB);
  });

  test('10. Webhook handshake accepts only the configured verify token', async () => {
    const saved = process.env.META_WEBHOOK_VERIFY_TOKEN;
    const good = `verify_${testId}_long_random_value`;
    const app = express();
    app.use(express.json({ verify: captureRawBody }));
    app.use(createMetaWebhookRouter({ to: () => ({ emit: () => {} }) }));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhook/meta`;
    const handshake = (token: string) =>
      fetch(`${base}?hub.mode=subscribe&hub.challenge=CHALLENGE_42&hub.verify_token=${encodeURIComponent(token)}`);

    try {
      process.env.META_WEBHOOK_VERIFY_TOKEN = good;
      const ok = await handshake(good);
      assert.equal(ok.status, 200);
      assert.equal(await ok.text(), 'CHALLENGE_42');
      assert.equal((await handshake('wrong_token_value_here')).status, 403);
      assert.equal((await handshake('oneai_meta_verify_secret_123')).status, 403, 'The old built-in default is refused');
      assert.equal((await handshake('')).status, 403);
      assert.equal((await fetch(`${base}?hub.mode=unsubscribe&hub.challenge=x&hub.verify_token=${good}`)).status, 403);

      // No env value: nothing is accepted, not even the old default
      delete process.env.META_WEBHOOK_VERIFY_TOKEN;
      assert.equal((await handshake(good)).status, 403);
      assert.equal((await handshake('oneai_meta_verify_secret_123')).status, 403);
      assert.equal(isValidWebhookVerifyToken(''), false);
      // A short, guessable value is not accepted as a secret
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'short';
      assert.equal((await handshake('short')).status, 403);

      // An event for an unknown phone number is dropped: it lands in no tenant at all
      const unknownPhone = `99${uniqueDigits}9`;
      const wamid = `wamid.unknown_${testId}`;
      const savedSecret = process.env.META_APP_SECRET;
      process.env.META_APP_SECRET = `app_secret_${testId}`;
      const payload = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [{
            id: 'x',
            changes: [{
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15550000000', phone_number_id: unknownPhone },
                contacts: [{ profile: { name: 'Stranger' }, wa_id: '15551230000' }],
                messages: [{ from: '15551230000', id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'hello' } }],
                statuses: [{ id: `wamid.status_${testId}`, status: 'delivered', timestamp: '1700000000', recipient_id: '15551230000' }],
              },
            }],
          }],
        });
      const signature = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(payload).digest('hex');
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
        body: payload,
      });
      if (savedSecret === undefined) delete process.env.META_APP_SECRET;
      else process.env.META_APP_SECRET = savedSecret;
      assert.equal(res.status, 200);
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal(await prisma.message.count({ where: { channelMessageId: wamid } }), 0);
      assert.equal(await prisma.inboundMessageJob.count({ where: { wamId: wamid } }), 0);
      assert.equal(await prisma.customer.count({ where: { tenantId: { in: [tenantA, tenantB] } } }), 0);
    } finally {
      if (saved === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN;
      else process.env.META_WEBHOOK_VERIFY_TOKEN = saved;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    assert.equal(await findTenantIdByPhoneNumberId(PHONE), tenantA);
    assert.equal(await findTenantIdByPhoneNumberId(`99${uniqueDigits}9`), null);
    assert.equal(await findTenantIdByPhoneNumberId(''), null);
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
});
