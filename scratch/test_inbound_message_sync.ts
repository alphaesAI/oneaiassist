import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function testInboundMessageSync() {
  console.log('================================================================');
  console.log('🚀 TESTING INBOUND WHATSAPP MESSAGE MATCHING & CONVERSATION SYNC');
  console.log('================================================================');

  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'apex-assurance' },
  });

  if (!tenant) throw new Error('Tenant apex-assurance not found');

  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // Test Customer: logi (+91 82208 50596)
  const customer = await db.customer.findFirst({
    where: { displayName: 'logi' },
  });

  if (!customer) throw new Error('Customer logi not found');

  console.log(`Found Customer: ${customer.displayName} (${customer.primaryPhone}) ID: ${customer.id}`);

  // Fetch conversations before simulation
  const convsBefore = await db.conversation.findMany({
    where: { customerId: customer.id },
  });

  console.log(`Conversations count for logi before sync test: ${convsBefore.length}`);

  // Simulate normalized phone matching logic from engine-logic.ts
  const rawPayloadPhone = '918220850596'; // Raw digits from WhatsApp Baileys notify event

  const customers = await db.customer.findMany({ where: { tenantId } });
  let matchedCustomer = null;
  const normRawPhone = rawPayloadPhone.replace(/[^\d]/g, '');

  const { decrypt } = await import('../lib/encryption');
  const { toJid } = await import('../whatsapp-engine/transport/TransportManager');
  const targetJid = toJid(rawPayloadPhone);

  for (const c of customers) {
    try {
      let decPhone = c.primaryPhone;
      if (c.primaryPhone && (c.primaryPhone.includes(':') || c.primaryPhone.length > 25)) {
        try {
          decPhone = decrypt(c.primaryPhone);
        } catch {
          decPhone = c.primaryPhone;
        }
      }

      const normDecPhone = decPhone.replace(/[^\d]/g, '');

      if (
        decPhone === rawPayloadPhone ||
        normDecPhone === normRawPhone ||
        toJid(decPhone) === targetJid ||
        (normDecPhone.length >= 10 && normRawPhone.endsWith(normDecPhone.slice(-10))) ||
        (normRawPhone.length >= 10 && normDecPhone.endsWith(normRawPhone.slice(-10)))
      ) {
        matchedCustomer = c;
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  if (matchedCustomer && matchedCustomer.id === customer.id) {
    console.log(`✅ SUCCESS: Raw payload phone '${rawPayloadPhone}' correctly matched Customer logi (${customer.id})!`);
  } else {
    console.error(`❌ FAILURE: Could not match customer for '${rawPayloadPhone}'! Matched: ${matchedCustomer?.id}`);
  }
}

testInboundMessageSync().catch(console.error).finally(() => prisma.$disconnect());
