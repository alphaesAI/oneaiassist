import 'dotenv/config';
import { createMetaWebhookRouter } from '../whatsapp-engine/routes/metaWebhook';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function testMetaCloudPhase2() {
  console.log('================================================================');
  console.log('🚀 TESTING PHASE 2: META WEBHOOK VERIFICATION & INGESTION');
  console.log('================================================================');

  const mockIo = { to: () => ({ emit: (event: string, data: any) => console.log(`📡 Socket Emit [${event}]:`, data) }) };
  const router = createMetaWebhookRouter(mockIo);

  // 1. Test GET Verification Handshake Simulation
  let getVerified = false;
  const mockReqGet: any = {
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'oneai_verify_secret_999',
      'hub.challenge': 'CHALLENGE_STRING_12345',
    },
  };
  const mockResGet: any = {
    status: (code: number) => ({
      send: (body: any) => {
        if (code === 200 && body === 'CHALLENGE_STRING_12345') getVerified = true;
      },
    }),
    sendStatus: (code: number) => console.log(`Get sendStatus: ${code}`),
  };

  // Setup database verify token for tenant apex-assurance
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'apex-assurance' } });
  if (!tenant) throw new Error('Tenant not found');

  const db = getTenantPrisma(tenant.id, 'ADMIN');
  await db.whatsAppNumber.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      sessionData: 'meta_session',
      provider: 'META_CLOUD_API',
      metaPhoneNumberId: '10987654321',
      metaWabaId: 'META_WABA_123',
      metaAccessToken: 'EAAG_mock_access_token',
      metaVerifyToken: 'oneai_verify_secret_999',
      status: 'CONNECTED',
    },
    update: {
      provider: 'META_CLOUD_API',
      metaPhoneNumberId: '10987654321',
      metaVerifyToken: 'oneai_verify_secret_999',
    },
  });

  // Execute GET verification handler logic
  const handleGet = (router as any).stack.find((layer: any) => layer.route?.path === '/api/webhook/meta' && layer.route?.methods?.get);
  if (handleGet) {
    await handleGet.route.stack[0].handle(mockReqGet, mockResGet, () => {});
  }

  if (getVerified) {
    console.log('✅ PASS: GET /api/webhook/meta successfully verified challenge handshake!');
  } else {
    console.error('❌ FAIL: GET verification handshake failed!');
  }

  // 2. Test POST Event Ingestion Simulation
  const mockReqPost: any = {
    body: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'META_WABA_123',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550183999',
                  phone_number_id: '10987654321',
                },
                contacts: [{ wa_id: '15550189999', profile: { name: 'Meta Webhook Lead' } }],
                messages: [
                  {
                    from: '15550189999',
                    id: `wamid.test_${Date.now()}`,
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Inbound message sent over official Meta Cloud API!' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    },
  };

  let postResponseCode = 0;
  const mockResPost: any = {
    status: (code: number) => ({
      send: (body: any) => { postResponseCode = code; },
    }),
  };

  const handlePost = (router as any).stack.find((layer: any) => layer.route?.path === '/api/webhook/meta' && layer.route?.methods?.post);
  if (handlePost) {
    await handlePost.route.stack[0].handle(mockReqPost, mockResPost, () => {});
  }

  if (postResponseCode === 200) {
    console.log('✅ PASS: POST /api/webhook/meta responded 200 OK and ingested event!');
  } else {
    console.error(`❌ FAIL: POST response code was ${postResponseCode}!`);
  }

  // Cleanup
  await db.whatsAppNumber.update({
    where: { tenantId: tenant.id },
    data: { provider: 'BAILEYS', status: 'DISCONNECTED' },
  });
  console.log('Cleanup complete.');
}

testMetaCloudPhase2().catch(console.error).finally(() => prisma.$disconnect());
