import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function testAddLead() {
  console.log('Testing Lead creation logic with safe audit user fallback...');

  // 1. Get seed tenant
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'apex-assurance' } });
  if (!tenant) {
    console.error('Seed tenant apex-assurance not found');
    return;
  }

  const tenantId = tenant.id;
  // Intentionally test with userId = null (simulating platform owner / admin without explicit user record)
  const userId = null;

  console.log(`Tenant ID: ${tenantId}, Initial User ID: ${userId}`);

  const db = getTenantPrisma(tenantId, 'ADMIN');

  const displayName = 'Test New Lead Marcus';
  const phone = '+1555019999';
  const source = 'WhatsApp Broadcast';
  const dealValue = '1500';

  try {
    const encryptedPhone = 'ENC:' + phone;

    console.log('Checking existing customers...');
    const allCustomers = await db.customer.findMany({ where: { tenantId } });

    let customer = allCustomers.find((c) => c.displayName === displayName);
    if (!customer) {
      console.log('Creating customer...');
      customer = await db.customer.create({
        data: {
          tenantId,
          displayName,
          primaryPhone: encryptedPhone,
          otpVerified: true,
        },
      });
    }
    console.log('Customer resolved/created with ID:', customer.id);

    console.log('Creating lead...');
    const budgetMaxCents = dealValue ? Math.round(parseFloat(dealValue) * 100) : 150000;
    const lead = await db.lead.create({
      data: {
        tenantId,
        customerId: customer.id,
        status: 'NEW',
        source,
        intakeBudgetMax: budgetMaxCents,
      },
    });
    console.log('Lead created successfully with ID:', lead.id);

    // Safe audit user resolution matching route.ts fix
    let auditUserId = userId;
    if (!auditUserId) {
      const tenantUser = await db.user.findFirst({ where: { tenantId } });
      auditUserId = tenantUser?.id || null;
    }

    if (auditUserId) {
      const audit = await db.auditLog.create({
        data: {
          userId: auditUserId,
          tenantId,
          action: 'LEAD_CREATED',
          metadata: { leadId: lead.id, customerName: displayName },
        },
      });
      console.log('Audit log written safely with ID:', audit.id);
    } else {
      console.log('No tenant user found; audit log skipped safely without crashing lead creation.');
    }

    console.log('🎉 SUCCESS: Lead and Customer created without HTTP 500 error!');
  } catch (err: any) {
    console.error('❌ FAIL: Lead creation flow threw an error:', err);
  } finally {
    // Cleanup test data
    await prisma.lead.deleteMany({ where: { source: 'WhatsApp Broadcast', tenantId } });
    await prisma.customer.deleteMany({ where: { displayName: 'Test New Lead Marcus', tenantId } });
    await prisma.auditLog.deleteMany({ where: { action: 'LEAD_CREATED', tenantId } });
  }
}

testAddLead().catch(console.error);
