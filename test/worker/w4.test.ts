import 'dotenv/config';
import test, { describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { prisma } from '../../lib/db';
import { encrypt } from '../../lib/encryption';
import { captureRawBody, isValidMetaSignature } from '../../lib/whatsapp/webhookAuth';
import { recordDeliveryEvent } from '../../lib/whatsapp/deliveryTracking';
import { createMetaWebhookRouter } from '../../whatsapp-engine/routes/metaWebhook';
import { MetaNormalizer } from '../../whatsapp-engine/MetaNormalizer';

const testId = `w4_${Date.now().toString(36)}`;
const digits = String(Date.now()).slice(-8);
const APP_SECRET = `app_secret_${testId}_value`;
const tenantIds: string[] = [];
let seq = 0;

const sign = (body: string, secret = APP_SECRET) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

async function createTenant(label: string) {
  const tenant = await prisma.tenant.create({
    data: { name: `W4 ${label} ${testId}`, slug: `w4-${label}-${testId}`, status: 'ACTIVE', subscriptionPlan: 'FREE', subscriptionStatus: 'ACTIVE' },
  });
  tenantIds.push(tenant.id);
  const phoneNumberId = `84${digits}${tenantIds.length}`;
  await prisma.whatsAppNumber.create({
    data: {
      tenantId: tenant.id, sessionData: 'meta_cloud_config', provider: 'META_CLOUD_API', status: 'CONNECTED',
      metaWabaId: `74${digits}${tenantIds.length}`, metaPhoneNumberId: phoneNumberId, metaAccessToken: encrypt('token'),
    },
  });
  return { tenantId: tenant.id, phoneNumberId };
}

/** A campaign with `count` messages already sent through Meta, each with its own wamid. */
async function createSentCampaign(tenantId: string, count: number) {
  const campaign = await prisma.broadcastCampaign.create({
    data: { tenantId, name: `W4 ${testId} ${++seq}`, channel: 'WHATSAPP', status: 'COMPLETED', sent: count, totalRecipients: count, recipientFilter: { type: 'all' } },
  });
  const jobs = [];
  for (let i = 0; i < count; i++) {
    seq++;
    const customer = await prisma.customer.create({
      data: { tenantId, displayName: `W4 Contact ${seq}`, primaryPhone: encrypt(`+1555${digits.slice(-4)}${String(seq).padStart(3, '0')}`), optedIn: true },
    });
    const wamid = `wamid.${testId}_${seq}`;
    const conversation = await prisma.conversation.create({ data: { tenantId, customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN' } });
    const message = await prisma.message.create({
      data: { tenantId, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'BOT', content: 'Hello', channel: 'WHATSAPP', channelMessageId: wamid, status: 'SENT' },
    });
    const job = await prisma.broadcastJob.create({
      data: { tenantId, campaignId: campaign.id, customerId: customer.id, channel: 'WHATSAPP', recipient: '15550000000', status: 'SENT', providerMessageId: wamid, scheduledFor: new Date(), processedAt: new Date() },
    });
    jobs.push({ job, wamid, messageId: message.id });
  }
  return { campaign, jobs };
}

function statusPayload(phoneNumberId: string, statuses: Array<Record<string, unknown>>) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '1555', phone_number_id: phoneNumberId }, statuses } }] }],
  });
}

describe('Step W4: WhatsApp delivery tracking', () => {
  let server: http.Server;
  let base = '';
  let savedSecret: string | undefined;
  const emitted: Array<{ room: string; event: string; data: any }> = [];

  before(async () => {
    savedSecret = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = APP_SECRET;
    const app = express();
    app.use(express.json({ verify: captureRawBody }));
    app.use(createMetaWebhookRouter({ to: (room: string) => ({ emit: (event: string, data: any) => emitted.push({ room, event, data }) }) }));
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhook/meta`;
  });

  const post = (body: string, signature: string | null) =>
    fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Hub-Signature-256': signature } : {}) }, body });

  /** Posts a correctly signed event and waits until the handler (which answers first, then works) has applied it. */
  async function deliver(body: string, until: () => Promise<boolean>) {
    const res = await post(body, sign(body));
    assert.equal(res.status, 200);
    for (let i = 0; i < 40; i++) {
      if (await until()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.fail('The webhook event was not applied in time');
  }

  test('1. Signature check: only the exact bytes signed with the app secret are accepted', () => {
    const body = '{"a":1}';
    assert.equal(isValidMetaSignature(Buffer.from(body), sign(body)), true);
    assert.equal(isValidMetaSignature(body, sign(body)), true);
    assert.equal(isValidMetaSignature(Buffer.from('{"a": 1}'), sign(body)), false, 'Same JSON, different bytes');
    assert.equal(isValidMetaSignature(Buffer.from(body), sign(body, 'another_secret')), false);
    assert.equal(isValidMetaSignature(Buffer.from(body), sign(body).replace('sha256=', 'sha1=')), false);
    assert.equal(isValidMetaSignature(Buffer.from(body), 'sha256=abc'), false);
    assert.equal(isValidMetaSignature(Buffer.from(body), undefined), false);
    assert.equal(isValidMetaSignature(undefined, sign(body)), false, 'Without the raw body nothing is accepted');

    delete process.env.META_APP_SECRET;
    assert.equal(isValidMetaSignature(Buffer.from(body), sign(body)), false, 'Without the app secret nothing is accepted');
    assert.equal(isValidMetaSignature(Buffer.from(body), 'sha256=' + crypto.createHmac('sha256', '').update(body).digest('hex')), false);
    process.env.META_APP_SECRET = APP_SECRET;
  });

  test('2. A forged or unsigned webhook is rejected and changes nothing', async () => {
    const t = await createTenant('forged');
    const { campaign, jobs } = await createSentCampaign(t.tenantId, 1);
    const body = statusPayload(t.phoneNumberId, [{ id: jobs[0].wamid, status: 'read', timestamp: '1790000000', recipient_id: '15550000000' }]);

    assert.equal((await post(body, null)).status, 401);
    assert.equal((await post(body, sign(body, 'guessed_secret'))).status, 401);
    assert.equal((await post(body, 'sha256=' + '0'.repeat(64))).status, 401);
    // A valid signature for a different body does not cover this one
    assert.equal((await post(body, sign(body.replace('read', 'delivered')))).status, 401);

    await new Promise((r) => setTimeout(r, 800));
    const job = await prisma.broadcastJob.findUniqueOrThrow({ where: { id: jobs[0].job.id } });
    assert.equal(job.readAt, null);
    assert.equal(job.deliveredAt, null);
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: jobs[0].messageId } })).status, 'SENT');
    assert.equal((await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).read, 0);
  });

  test('3. Signed updates move each message to delivered, read or failed, with exact campaign totals', async () => {
    const t = await createTenant('track');
    const { campaign, jobs } = await createSentCampaign(t.tenantId, 4);
    const [a, b, c, d] = jobs;

    const body = statusPayload(t.phoneNumberId, [
      { id: a.wamid, status: 'sent', timestamp: '1790000000', recipient_id: '1' },
      { id: a.wamid, status: 'delivered', timestamp: '1790000100', recipient_id: '1' },
      { id: b.wamid, status: 'delivered', timestamp: '1790000100', recipient_id: '2' },
      { id: b.wamid, status: 'read', timestamp: '1790000200', recipient_id: '2' },
      // Read arrives without a delivered event first
      { id: c.wamid, status: 'read', timestamp: '1790000300', recipient_id: '3' },
      {
        id: d.wamid, status: 'failed', timestamp: '1790000400', recipient_id: '4',
        errors: [{ code: 131026, title: 'Message undeliverable', message: 'Message undeliverable', error_data: { details: 'Recipient is not a WhatsApp user.' } }],
      },
    ]);
    await deliver(body, async () => (await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).failed === 1);

    const [ja, jb, jc, jd] = await Promise.all(jobs.map((j) => prisma.broadcastJob.findUniqueOrThrow({ where: { id: j.job.id } })));
    assert.equal(ja.status, 'SENT');
    assert.equal(ja.deliveredAt?.toISOString(), new Date(1790000100 * 1000).toISOString(), 'Meta\'s own time is stored');
    assert.equal(ja.readAt, null);
    assert.ok(jb.deliveredAt && jb.readAt);
    assert.ok(jc.readAt && jc.deliveredAt, 'A read message was necessarily delivered');
    assert.equal(jd.status, 'FAILED');
    assert.equal(jd.errorCode, '131026');
    assert.match(jd.lastError || '', /could not deliver.*Recipient is not a WhatsApp user\..*code 131026/);
    assert.ok(jd.failedAt);
    assert.equal(jd.deliveredAt, null);

    const totals = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual(
      { sent: totals.sent, delivered: totals.delivered, read: totals.read, failed: totals.failed },
      { sent: 3, delivered: 3, read: 2, failed: 1 }
    );

    // The inbox message carries the same status
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: b.messageId } })).status, 'READ');
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: d.messageId } })).status, 'FAILED');

    // The dashboard is told the exact totals for this tenant only
    const stats = emitted.filter((e) => e.event === 'broadcast_stats_updated' && e.data.campaignId === campaign.id);
    assert.ok(stats.length > 0);
    assert.ok(stats.every((e) => e.room === `tenant_${t.tenantId}`));
    assert.deepEqual(
      { sent: stats.at(-1)!.data.sent, delivered: stats.at(-1)!.data.delivered, read: stats.at(-1)!.data.read, failed: stats.at(-1)!.data.failed },
      { sent: 3, delivered: 3, read: 2, failed: 1 }
    );
  });

  test('4. Repeated and out-of-order updates never double count or move a status backwards', async () => {
    const t = await createTenant('order');
    const { campaign, jobs } = await createSentCampaign(t.tenantId, 2);
    const [a, b] = jobs;
    const at = (s: number) => new Date(s * 1000);

    // Read first, then a late "delivered", then everything repeated
    assert.equal((await recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: a.wamid, status: 'READ', timestamp: at(1790000500) })).changed, true);
    assert.equal((await recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: a.wamid, status: 'DELIVERED', timestamp: at(1790000400) })).changed, false);
    for (let i = 0; i < 3; i++) {
      assert.equal((await recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: a.wamid, status: 'READ', timestamp: at(1790000900) })).changed, false);
    }
    // A failure reported after the message was read is ignored
    assert.equal((await recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: a.wamid, status: 'FAILED', errorCode: '131000' })).changed, false);
    const ja = await prisma.broadcastJob.findUniqueOrThrow({ where: { id: a.job.id } });
    assert.equal(ja.status, 'SENT');
    assert.equal(ja.readAt?.getTime(), at(1790000500).getTime(), 'The first read time is kept');

    // A failed message does not later become delivered
    await recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: b.wamid, status: 'FAILED', errorCode: '131049', errorMessage: 'Not delivered to maintain healthy ecosystem engagement.' });
    assert.equal((await recordDeliveryEvent({ tenantId: t.tenantId, providerMessageId: b.wamid, status: 'DELIVERED' })).changed, false);
    const jb = await prisma.broadcastJob.findUniqueOrThrow({ where: { id: b.job.id } });
    assert.equal(jb.status, 'FAILED');
    assert.equal(jb.deliveredAt, null);

    const totals = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual(
      { sent: totals.sent, delivered: totals.delivered, read: totals.read, failed: totals.failed },
      { sent: 1, delivered: 1, read: 1, failed: 1 }
    );
  });

  test('5. An update is applied only inside the tenant that owns the phone number', async () => {
    const owner = await createTenant('owner');
    const other = await createTenant('other');
    const { campaign, jobs } = await createSentCampaign(owner.tenantId, 1);

    // A correctly signed event that names the OTHER tenant's phone number but the owner's message ID
    const crossed = statusPayload(other.phoneNumberId, [{ id: jobs[0].wamid, status: 'read', timestamp: '1790000000', recipient_id: '1' }]);
    assert.equal((await post(crossed, sign(crossed))).status, 200);
    // A correctly signed event for a phone number nobody owns
    const unknown = statusPayload(`99${digits}0`, [{ id: jobs[0].wamid, status: 'read', timestamp: '1790000000', recipient_id: '1' }]);
    assert.equal((await post(unknown, sign(unknown))).status, 200);
    await new Promise((r) => setTimeout(r, 1500));

    const job = await prisma.broadcastJob.findUniqueOrThrow({ where: { id: jobs[0].job.id } });
    assert.equal(job.readAt, null, 'Another tenant\'s number cannot update this tenant\'s message');
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: jobs[0].messageId } })).status, 'SENT');
    assert.equal((await recordDeliveryEvent({ tenantId: other.tenantId, providerMessageId: jobs[0].wamid, status: 'READ' })).matched, false);

    // The owner's own number does update it
    const own = statusPayload(owner.phoneNumberId, [{ id: jobs[0].wamid, status: 'delivered', timestamp: '1790000000', recipient_id: '1' }]);
    // The campaign total is written right after the job, so wait for the total itself.
    await deliver(own, async () => (await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).delivered === 1);
    assert.ok((await prisma.broadcastJob.findUniqueOrThrow({ where: { id: jobs[0].job.id } })).deliveredAt);
  });

  test('6. Meta\'s failure reason is read from the event', () => {
    const parsed = MetaNormalizer.parsePayload(JSON.parse(statusPayload('123', [
      { id: 'wamid.x', status: 'failed', timestamp: '1790000000', recipient_id: '1', errors: [{ code: 131047, title: 'Re-engagement message', error_data: { details: 'More than 24 hours have passed.' } }] },
      { id: 'wamid.y', status: 'failed', timestamp: '1790000000', recipient_id: '1' },
      { id: 'wamid.z', status: 'delivered', timestamp: '1790000000', recipient_id: '1' },
    ])));
    assert.equal(parsed.statuses.length, 3);
    assert.equal(parsed.statuses[0].errorCode, '131047');
    assert.equal(parsed.statuses[0].errorMessage, 'Re-engagement message - More than 24 hours have passed.');
    assert.equal(parsed.statuses[0].phoneNumberId, '123');
    assert.equal(parsed.statuses[1].errorCode, undefined, 'No reason is invented when Meta gives none');
    assert.equal(parsed.statuses[2].errorCode, undefined);
  });

  after(async () => {
    if (savedSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = savedSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
});
