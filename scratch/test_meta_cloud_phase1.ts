import 'dotenv/config';
import { MetaNormalizer } from '../whatsapp-engine/MetaNormalizer';
import { MetaCloudTransportAdapter } from '../whatsapp-engine/transport/MetaCloudTransportAdapter';
import { TransportManager } from '../whatsapp-engine/transport/TransportManager';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function testMetaCloudPhase1() {
  console.log('================================================================');
  console.log('🚀 TESTING PHASE 1: META WHATSAPP CLOUD API INTEGRATION');
  console.log('================================================================');

  // 1. Test MetaNormalizer.parsePayload
  const mockMetaWebhookPayload = {
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
              contacts: [
                { wa_id: '918220850596', profile: { name: 'Meta Test Customer' } },
              ],
              messages: [
                {
                  from: '918220850596',
                  id: 'wamid.HBgMOTE4MjIwODUwNTk2FQIAERgSRjE1QTUzODg2RkY3RTEx',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'Hello from official Meta WhatsApp Cloud API!' },
                  context: { id: 'wamid.parent_msg_123' },
                },
              ],
              statuses: [
                {
                  id: 'wamid.sent_msg_999',
                  status: 'read',
                  timestamp: '1700000005',
                  recipient_id: '918220850596',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  const parsed = MetaNormalizer.parsePayload(mockMetaWebhookPayload);
  console.log('Parsed Meta Payload:', JSON.stringify(parsed, null, 2));

  if (
    parsed.messages.length === 1 &&
    parsed.messages[0].text === 'Hello from official Meta WhatsApp Cloud API!' &&
    parsed.messages[0].contextMessageId === 'wamid.parent_msg_123' &&
    parsed.statuses.length === 1 &&
    parsed.statuses[0].status === 'READ'
  ) {
    console.log('✅ PASS: MetaNormalizer correctly parsed inbound message, contextMessageId, and status receipt!');
  } else {
    console.error('❌ FAIL: MetaNormalizer parsing failed!');
  }

  // 2. Test WhatsAppNumber database model Meta fields
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'apex-assurance' } });
  if (!tenant) throw new Error('Tenant apex-assurance not found');

  const db = getTenantPrisma(tenant.id, 'ADMIN');

  const updatedNumber = await db.whatsAppNumber.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      sessionData: 'meta_cloud_mock_session',
      provider: 'META_CLOUD_API',
      metaPhoneNumberId: '10987654321',
      metaWabaId: 'META_WABA_123',
      metaAccessToken: 'EAAG_mock_meta_access_token_123456789',
      metaVerifyToken: 'oneai_verify_secret_999',
      status: 'CONNECTED',
    },
    update: {
      provider: 'META_CLOUD_API',
      metaPhoneNumberId: '10987654321',
      metaWabaId: 'META_WABA_123',
      metaAccessToken: 'EAAG_mock_meta_access_token_123456789',
      metaVerifyToken: 'oneai_verify_secret_999',
      status: 'CONNECTED',
    },
  });

  console.log(`Updated WhatsAppNumber for tenant ${tenant.id}: provider = ${updatedNumber.provider}, phoneId = ${updatedNumber.metaPhoneNumberId}`);

  // 3. Test TransportManager async provider routing
  const transport = await TransportManager.getTransportAsync(tenant.id);
  console.log(`Transport instance created: ${transport.constructor.name}`);

  if (transport.constructor.name === 'MetaCloudTransportAdapter') {
    console.log('✅ PASS: TransportManager correctly routed provider META_CLOUD_API to MetaCloudTransportAdapter!');
  } else {
    console.error(`❌ FAIL: TransportManager returned ${transport.constructor.name} instead of MetaCloudTransportAdapter!`);
  }

  // Revert provider back to BAILEYS for active dev testing
  await db.whatsAppNumber.update({
    where: { tenantId: tenant.id },
    data: { provider: 'BAILEYS', status: 'DISCONNECTED' },
  });
  TransportManager.destroyTransport(tenant.id);
  console.log('Reverted provider to BAILEYS & cleaned up transport manager cache.');
}

testMetaCloudPhase1().catch(console.error).finally(() => prisma.$disconnect());
