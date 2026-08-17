// Integration test script for D5 Checkout & D6 Customer Portal
import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';

async function main() {
  console.log('=== Step 1: Querying default tenant & catalog item ===');
  const tenant = await prisma.tenant.findFirst({});

  if (!tenant) {
    throw new Error('No tenant found in database');
  }
  console.log('Tenant found:', tenant.name, tenant.id, tenant.slug);

  const db = getTenantPrisma(tenant.id, 'ADMIN');

  let catalogItem = await db.policyCatalogItem.findFirst({
    where: { tenantId: tenant.id },
  });

  if (!catalogItem) {
    console.log('Creating test catalog item...');
    catalogItem = await db.policyCatalogItem.create({
      data: {
        tenantId: tenant.id,
        policyId: `POL-CAT-${Date.now()}`,
        name: 'Comprehensive Family Health Cover',
        insurerName: 'Prime Assurance Ltd',
        states: ['CA', 'NY', 'TX'],
        premiumMin: 4900,
        premiumMax: 15000,
        sumInsured: 10000000,
        extractedSummary: 'Full family health coverage with $100k annual benefit limit.',
        pdfUrl: 'https://r2.oneaiassist.internal/docs/policy.pdf',
      },
    });
  }

  console.log('Catalog Item ready:', catalogItem.name, catalogItem.id);

  console.log('=== Step 2: Testing Checkout API Submit ===');
  const port = process.env.PORT || 3002;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
  const testPhone = `+1555${Math.floor(100000 + Math.random() * 900000)}`;
  const submitRes = await fetch(`${baseUrl}/api/tenant/${tenant.slug}/checkout/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policyCatalogId: catalogItem.id,
      customerName: 'Test Portal Customer',
      customerPhone: testPhone,
      customerEmail: 'portaltest@example.com',
    }),
  });

  const submitData = await submitRes.json();
  console.log('Checkout Submit Status:', submitRes.status);
  console.log('Checkout Submit Response:', submitData);

  if (!submitRes.ok || !submitData.success) {
    throw new Error(`Checkout failed: ${JSON.stringify(submitData)}`);
  }

  console.log('=== Step 3: Testing Portal Auth Request OTP ===');
  const reqOtpRes = await fetch(`${baseUrl}/api/tenant/${tenant.slug}/portal/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone }),
  });

  const reqOtpData = await reqOtpRes.json();
  console.log('Request OTP Status:', reqOtpRes.status);
  console.log('Request OTP Response:', reqOtpData);

  if (!reqOtpRes.ok) {
    throw new Error('Request OTP failed');
  }

  console.log('=== Step 4: Testing Portal Auth Verify OTP ===');
  const verifyRes = await fetch(`${baseUrl}/api/tenant/${tenant.slug}/portal/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, otpCode: '123456' }),
  });

  const verifyData = await verifyRes.json();
  console.log('Verify OTP Status:', verifyRes.status);
  console.log('Verify OTP Response:', verifyData);

  if (!verifyRes.ok || !verifyData.customerId) {
    throw new Error('Verify OTP failed');
  }

  const cookieHeader = verifyRes.headers.get('set-cookie') || `customer_auth_token=${verifyData.customerId}; Path=/`;

  console.log('=== Step 5: Testing Customer Data Export JSON ===');
  const exportRes = await fetch(`${baseUrl}/api/tenant/${tenant.slug}/portal/account/export`, {
    headers: { Cookie: cookieHeader },
  });

  console.log('Export Status:', exportRes.status);
  const exportJson = await exportRes.json();
  console.log('Export Customer Name:', exportJson.customerProfile?.displayName);
  console.log('Export Policies Count:', exportJson.policies?.length);

  if (!exportRes.ok || exportJson.policies?.length === 0) {
    throw new Error('Export JSON failed or missing policies');
  }

  console.log('=== Step 6: Testing Customer Data Delete / Anonymize ===');
  const deleteRes = await fetch(`${baseUrl}/api/tenant/${tenant.slug}/portal/account/delete`, {
    method: 'POST',
    headers: { Cookie: cookieHeader },
  });

  const deleteData = await deleteRes.json();
  console.log('Delete Status:', deleteRes.status);
  console.log('Delete Response:', deleteData);

  if (!deleteRes.ok) {
    throw new Error('Delete failed');
  }

  console.log('🎉 E2E TEST PASSED FOR CHECKOUT (D5) & PORTAL (D6)!');
}

main().catch((e) => {
  console.error('Test script failed:', e);
  process.exit(1);
});
