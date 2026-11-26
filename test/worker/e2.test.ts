import 'dotenv/config';
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { processContactImportJob, CONTACT_PUBLIC_SELECT } from '@/lib/contacts/csvImport';

const createdTenantIds: string[] = [];

async function createTenant() {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: `E2 Test ${uid}`,
      slug: `e2-test-${uid}`,
      status: 'ACTIVE',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });
  createdTenantIds.push(tenant.id);
  return tenant;
}

describe('Step E2 Contacts, Lists, Consent & 10k CSV Import', () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      const ids = createdTenantIds.splice(0, createdTenantIds.length);
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('1. Importing a 10,000-row CSV succeeds and assigns list membership', async () => {
    const tenant = await createTenant();
    const list = await prisma.contactList.create({
      data: { tenantId: tenant.id, name: '10k Import List' },
    });

    const lines = ['name,email,tags,tier'];
    for (let i = 0; i < 10000; i++) {
      lines.push(`User ${i},user${i}@example.com,vip,gold`);
    }
    const csv = lines.join('\n');

    const job = await prisma.contactImportJob.create({
      data: {
        tenantId: tenant.id,
        listId: list.id,
        fileName: '10k.csv',
        csvContent: csv,
        consentSource: 'Website Opt-in Form',
        consentProof: 'https://example.com/signup',
        status: 'PENDING',
        totalRows: 10000,
      },
    });

    const res = await processContactImportJob(job.id, tenant.id);
    assert.equal(res.status, 'COMPLETED');

    const report = await prisma.contactImportJob.findUnique({ where: { id: job.id } });
    assert.equal(report?.status, 'COMPLETED');
    assert.equal(report?.totalRows, 10000);
    assert.equal(report?.importedCount, 10000);
    assert.equal(report?.csvContent, '');

    const customerCount = await prisma.customer.count({ where: { tenantId: tenant.id } });
    assert.equal(customerCount, 10000);

    const memberCount = await prisma.contactListMember.count({
      where: { tenantId: tenant.id, listId: list.id },
    });
    assert.equal(memberCount, 10000);
  });

  it('2. Re-importing the same CSV creates no duplicate contacts', async () => {
    const tenant = await createTenant();
    const csv = [
      'name,email,tags,company_size',
      'Alice,alice@example.com,lead,50',
      'Bob,bob@example.com,lead,200',
      'Alice Duplicate,alice@example.com,vip,50',
    ].join('\n');

    const job1 = await prisma.contactImportJob.create({
      data: {
        tenantId: tenant.id,
        fileName: 'first.csv',
        csvContent: csv,
        status: 'PENDING',
        totalRows: 3,
      },
    });
    await processContactImportJob(job1.id, tenant.id);
    assert.equal(await prisma.customer.count({ where: { tenantId: tenant.id } }), 2);

    const job2 = await prisma.contactImportJob.create({
      data: {
        tenantId: tenant.id,
        fileName: 'second.csv',
        csvContent: csv,
        status: 'PENDING',
        totalRows: 3,
      },
    });
    await processContactImportJob(job2.id, tenant.id);

    const r2 = await prisma.contactImportJob.findUnique({ where: { id: job2.id } });
    assert.equal(r2?.importedCount, 0);
    assert.equal(r2?.updatedCount, 2);
    assert.equal(await prisma.customer.count({ where: { tenantId: tenant.id } }), 2);

    const alice = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, email: 'alice@example.com' },
    });
    assert.deepEqual(alice?.customFields, { company_size: '50' });
  });

  it('3. Imported contacts are NOT auto-subscribed without a stated consentSource', async () => {
    const tenant = await createTenant();
    const csv = 'name,email\nNoConsent,noconsent@example.com';

    const job = await prisma.contactImportJob.create({
      data: {
        tenantId: tenant.id,
        fileName: 'noconsent.csv',
        csvContent: csv,
        consentSource: null,
        status: 'PENDING',
        totalRows: 1,
      },
    });
    await processContactImportJob(job.id, tenant.id);

    const contact = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, email: 'noconsent@example.com' },
    });
    assert.equal(contact?.emailConsentStatus, 'PENDING');
    assert.equal(contact?.optedIn, false);
    assert.equal(contact?.emailConsentSource, null);
    assert.equal(contact?.emailConsentTimestamp, null);
  });

  it('4. Explicit contact field selection never includes otpCode', () => {
    assert.equal('otpCode' in CONTACT_PUBLIC_SELECT, false);
    assert.equal(CONTACT_PUBLIC_SELECT.emailConsentStatus, true);
    assert.equal(CONTACT_PUBLIC_SELECT.emailConsentProof, true);
    assert.equal(CONTACT_PUBLIC_SELECT.customFields, true);
  });
});
