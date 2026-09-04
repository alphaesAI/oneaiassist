import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function testMetaCloudPhase3() {
  console.log('================================================================');
  console.log('🚀 TESTING PHASE 3: META CLOUD API ADMIN SETTINGS CONSOLE');
  console.log('================================================================');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'apex-assurance' } });
  if (!tenant) throw new Error('Tenant apex-assurance not found');

  const db = getTenantPrisma(tenant.id, 'ADMIN');

  // Test updating Meta Cloud API settings
  const result = await db.whatsAppNumber.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      sessionData: 'meta_cloud_config',
      provider: 'META_CLOUD_API',
      metaPhoneNumberId: '10987654321',
      metaWabaId: 'META_WABA_123',
      metaAccessToken: 'EAAG_test_token_999',
      metaVerifyToken: 'oneai_verify_secret_999',
      status: 'CONNECTED',
    },
    update: {
      provider: 'META_CLOUD_API',
      metaPhoneNumberId: '10987654321',
      metaWabaId: 'META_WABA_123',
      metaAccessToken: 'EAAG_test_token_999',
      metaVerifyToken: 'oneai_verify_secret_999',
      status: 'CONNECTED',
    },
  });

  console.log('Saved Meta Credentials:', {
    provider: result.provider,
    phoneNumberId: result.metaPhoneNumberId,
    wabaId: result.metaWabaId,
    status: result.status,
  });

  if (result.provider === 'META_CLOUD_API' && result.metaPhoneNumberId === '10987654321') {
    console.log('✅ PASS: Meta Cloud API credentials saved successfully in database!');
  } else {
    console.error('❌ FAIL: Database update failed!');
  }

  // Cleanup back to BAILEYS
  await db.whatsAppNumber.update({
    where: { tenantId: tenant.id },
    data: { provider: 'BAILEYS', status: 'DISCONNECTED' },
  });
  console.log('Cleaned up test provider state.');
}

testMetaCloudPhase3().catch(console.error).finally(() => prisma.$disconnect());
