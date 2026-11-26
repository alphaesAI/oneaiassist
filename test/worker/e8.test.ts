import 'dotenv/config';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { CampaignReportService } from '../../lib/email/campaignReport';
import { GET as reportGET } from '../../app/api/dashboard/broadcast/[id]/report/route';
import { GET as reportContactsGET } from '../../app/api/dashboard/broadcast/[id]/report/contacts/route';
import { GET as analyticsGET } from '../../app/api/analytics/route';
import { GET as analyticsExportGET } from '../../app/api/analytics/export/route';

describe('Step E8: Campaign Reports, Analytics, Per-Link Clicks & Contact Drilldown', () => {
  const testId = `e8_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let tenantId: string;
  let otherTenantId: string;
  let campaignId: string;
  const customerIds: string[] = [];

  test('setup test tenants, customers, campaign, jobs, and events', async () => {
    // 1. Create primary tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: `E8 Primary Agency ${testId}`,
        slug: `e8-agency-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        postalAddress: '100 Report Way, Austin, TX 78701',
      },
    });
    tenantId = tenant.id;

    // 2. Create other tenant for multi-tenant isolation tests
    const otherTenant = await prisma.tenant.create({
      data: {
        name: `E8 Other Agency ${testId}`,
        slug: `e8-other-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        postalAddress: '200 Isolation St, Dallas, TX 75201',
      },
    });
    otherTenantId = otherTenant.id;

    // 3. Create 10 customers
    for (let i = 1; i <= 10; i++) {
      const cust = await prisma.customer.create({
        data: {
          tenantId,
          displayName: `Customer ${i} ${testId}`,
          email: `cust${i}_${testId}@example.com`,
          primaryPhone: `+1555000${String(i).padStart(4, '0')}`,
          emailConsentStatus: 'SUBSCRIBED',
          emailConsentSource: 'E8 Test Harness',
        },
      });
      customerIds.push(cust.id);
    }

    // 4. Create BroadcastCampaign
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId,
        name: `E8 Fall Product Launch ${testId}`,
        subject: `Big news for you ${testId}`,
        channel: 'EMAIL',
        status: 'COMPLETED',
        totalRecipients: 10,
        sent: 8,
        delivered: 7,
        read: 3,
        replied: 2,
        failed: 2,
        optedOut: 1,
        startedAt: new Date(Date.now() - 3600000),
        completedAt: new Date(),
      },
    });
    campaignId = campaign.id;

    // 5. Create 10 BroadcastJob rows:
    // - 7 SENT (cust 1 to 7)
    // - 1 DELIVERED (cust 8, count as sent)
    // - 1 FAILED (cust 9)
    // - 1 SKIPPED_SUPPRESSED (cust 10)
    for (let i = 1; i <= 10; i++) {
      const custId = customerIds[i - 1];
      const email = `cust${i}_${testId}@example.com`;
      let status: any = 'SENT';
      let lastError: string | null = null;

      if (i === 8) {
        status = 'SENT';
      } else if (i === 9) {
        status = 'FAILED';
        lastError = '550 5.1.1 User unknown';
      } else if (i === 10) {
        status = 'SKIPPED_SUPPRESSED';
        lastError = 'Recipient address is suppressed in GlobalSuppression';
      }

      await prisma.broadcastJob.create({
        data: {
          tenantId,
          campaignId,
          customerId: custId,
          channel: 'EMAIL',
          recipient: email,
          status,
          lastError,
          scheduledFor: new Date(Date.now() - 3600000),
          processedAt: new Date(Date.now() - 3500000),
        },
      });
    }

    // 6. Create EmailEvent rows:
    // - 7 DELIVERED events (cust 1 to 7)
    for (let i = 1; i <= 7; i++) {
      await prisma.emailEvent.create({
        data: {
          tenantId,
          campaignId,
          customerId: customerIds[i - 1],
          email: `cust${i}_${testId}@example.com`,
          eventType: 'DELIVERED',
          messageId: `msg_${i}_${testId}`,
        },
      });
    }

    // - 4 OPEN events across 3 unique contacts:
    //   cust1 opens twice, cust2 opens once, cust3 opens once
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[0],
        email: `cust1_${testId}@example.com`,
        eventType: 'OPEN',
      },
    });
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[0],
        email: `cust1_${testId}@example.com`,
        eventType: 'OPEN',
      },
    });
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[1],
        email: `cust2_${testId}@example.com`,
        eventType: 'OPEN',
      },
    });
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[2],
        email: `cust3_${testId}@example.com`,
        eventType: 'OPEN',
      },
    });

    // - 2 CLICK events:
    //   cust1 clicks link A: https://example.com/promo
    //   cust2 clicks link B: https://example.com/pricing
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[0],
        email: `cust1_${testId}@example.com`,
        eventType: 'CLICK',
        url: 'https://example.com/promo',
      },
    });
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[1],
        email: `cust2_${testId}@example.com`,
        eventType: 'CLICK',
        url: 'https://example.com/pricing',
      },
    });

    // - 1 BOUNCE_HARD event: cust9
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[8],
        email: `cust9_${testId}@example.com`,
        eventType: 'BOUNCE_HARD',
      },
    });

    // - 1 UNSUBSCRIBE event: cust3
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[2],
        email: `cust3_${testId}@example.com`,
        eventType: 'UNSUBSCRIBE',
      },
    });

    // - 1 COMPLAINT event: cust4
    await prisma.emailEvent.create({
      data: {
        tenantId,
        campaignId,
        customerId: customerIds[3],
        email: `cust4_${testId}@example.com`,
        eventType: 'COMPLAINT',
      },
    });
  });

  test('1. CampaignReportService computes metrics and true rates from real DB rows', async () => {
    const report = await CampaignReportService.getCampaignReport(tenantId, campaignId);
    assert.ok(report, 'Report should be returned');

    assert.equal(report.metrics.recipients, 10, 'Total recipients should be 10');
    assert.equal(report.metrics.sent, 8, 'Total sent should be 8');
    assert.equal(report.metrics.delivered, 7, 'Delivered should be 7');
    assert.equal(report.metrics.opened, 3, 'Unique openers should be 3');
    assert.equal(report.metrics.totalOpens, 4, 'Total opens should be 4');
    assert.equal(report.metrics.clicked, 2, 'Unique clickers should be 2');
    assert.equal(report.metrics.totalClicks, 2, 'Total clicks should be 2');
    assert.equal(report.metrics.bounced, 1, 'Total bounced should be 1');
    assert.equal(report.metrics.hardBounces, 1, 'Hard bounces should be 1');
    assert.equal(report.metrics.softBounces, 0, 'Soft bounces should be 0');
    assert.equal(report.metrics.unsubscribed, 1, 'Unsubscribed should be 1');
    assert.equal(report.metrics.complained, 1, 'Complained should be 1');
    assert.equal(report.metrics.failed, 2, 'Failed + skipped should be 2');

    // Verify computed rates
    assert.equal(report.rates.deliveryRate, 87.5, 'Delivery rate: 7/8 = 87.5%');
    assert.equal(report.rates.openRate, 42.9, 'Open rate: 3/7 = 42.9%');
    assert.equal(report.rates.clickRate, 28.6, 'Click rate: 2/7 = 28.6%');
    assert.equal(report.rates.clickToOpenRate, 66.7, 'CTOR: 2/3 = 66.7%');
    assert.equal(report.rates.bounceRate, 12.5, 'Bounce rate: 1/8 = 12.5%');
    assert.equal(report.rates.unsubscribeRate, 14.3, 'Unsubscribe rate: 1/7 = 14.3%');
    assert.equal(report.rates.complaintRate, 14.3, 'Complaint rate: 1/7 = 14.3%');
    assert.equal(report.rates.failureRate, 20.0, 'Failure rate: 2/10 = 20.0%');
  });

  test('2. CampaignReportService returns distinct per-link click counts', async () => {
    const report = await CampaignReportService.getCampaignReport(tenantId, campaignId);
    assert.ok(report?.links, 'Links array should exist');
    assert.equal(report.links.length, 2, 'Should have 2 distinct clicked links');

    const promoLink = report.links.find((l) => l.url === 'https://example.com/promo');
    assert.ok(promoLink, 'Promo link should be present');
    assert.equal(promoLink.totalClicks, 1);
    assert.equal(promoLink.uniqueContacts, 1);

    const pricingLink = report.links.find((l) => l.url === 'https://example.com/pricing');
    assert.ok(pricingLink, 'Pricing link should be present');
    assert.equal(pricingLink.totalClicks, 1);
    assert.equal(pricingLink.uniqueContacts, 1);
  });

  test('3. CampaignReportService drilldown lists contacts behind each number', async () => {
    // A. Recipients drilldown
    const recipientsList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'recipients');
    assert.ok(recipientsList);
    assert.equal(recipientsList.totalContacts, 10, 'All 10 recipients listed');

    // B. Sent drilldown
    const sentList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'sent');
    assert.ok(sentList);
    assert.equal(sentList.totalContacts, 8, '8 sent contacts listed');

    // C. Opened drilldown
    const openedList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'opened');
    assert.ok(openedList);
    assert.equal(openedList.totalContacts, 3, '3 unique openers listed');
    const cust1 = openedList.contacts.find((c) => c.email.startsWith('cust1_'));
    assert.ok(cust1);
    assert.equal(cust1.count, 2, 'cust1 opened twice');

    // D. Clicked drilldown
    const clickedList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'clicked');
    assert.ok(clickedList);
    assert.equal(clickedList.totalContacts, 2, '2 unique clickers listed');

    // E. Per-link clicked drilldown
    const promoClickers = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'clicked', {
      url: 'https://example.com/promo',
    });
    assert.ok(promoClickers);
    assert.equal(promoClickers.totalContacts, 1, 'Only 1 contact clicked promo link');
    assert.ok(promoClickers.contacts[0].email.startsWith('cust1_'));

    // F. Bounced drilldown
    const bouncedList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'bounced');
    assert.ok(bouncedList);
    assert.equal(bouncedList.totalContacts, 1, '1 bounced contact listed');
    assert.ok(bouncedList.contacts[0].email.startsWith('cust9_'));

    // G. Unsubscribed drilldown
    const unsubList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'unsubscribed');
    assert.ok(unsubList);
    assert.equal(unsubList.totalContacts, 1, '1 unsubscribed contact listed');
    assert.ok(unsubList.contacts[0].email.startsWith('cust3_'));

    // H. Complaints drilldown
    const complaintList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'complained');
    assert.ok(complaintList);
    assert.equal(complaintList.totalContacts, 1, '1 complained contact listed');
    assert.ok(complaintList.contacts[0].email.startsWith('cust4_'));

    // I. Failed drilldown
    const failedList = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'failed');
    assert.ok(failedList);
    assert.equal(failedList.totalContacts, 2, '2 failed/skipped jobs listed');
  });

  test('4. Contact drilldown supports search filtering and pagination', async () => {
    // Search by unique email
    const searchRes = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'recipients', {
      search: `cust1_${testId}`,
    });
    assert.ok(searchRes);
    assert.equal(searchRes.totalContacts, 1);
    assert.ok(searchRes.contacts[0].email.startsWith(`cust1_${testId}`));

    // Pagination
    const page1 = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'recipients', {
      page: 1,
      pageSize: 3,
    });
    assert.ok(page1);
    assert.equal(page1.contacts.length, 3);
    assert.equal(page1.totalPages, 4);
    assert.equal(page1.totalContacts, 10);
  });

  test('5. Multi-tenant isolation: other tenant cannot read campaign report or contacts', async () => {
    const reportOther = await CampaignReportService.getCampaignReport(otherTenantId, campaignId);
    assert.equal(reportOther, null, 'Campaign report must be null for foreign tenant');

    const contactsOther = await CampaignReportService.getCampaignMetricContacts(otherTenantId, campaignId, 'opened');
    assert.equal(contactsOther, null, 'Contacts drilldown must be null for foreign tenant');
  });

  test('6. GET /api/dashboard/broadcast/[id]/report returns 401 when unauthenticated', async () => {
    const req = new Request('http://localhost:3000/api/dashboard/broadcast/non_existent/report');
    const res = await reportGET(req, { params: Promise.resolve({ id: 'non_existent' }) });
    assert.equal(res.status, 401, 'Unauthenticated request must return 401');
  });

  test('7. GET /api/dashboard/broadcast/[id]/report/contacts returns 401 when unauthenticated', async () => {
    const req = new Request('http://localhost:3000/api/dashboard/broadcast/non_existent/report/contacts');
    const res = await reportContactsGET(req, { params: Promise.resolve({ id: 'non_existent' }) });
    assert.equal(res.status, 401, 'Unauthenticated contacts drilldown request must return 401');
  });

  test('8. GET /api/analytics and /api/analytics/export return 401 when unauthenticated (SEC-02 fix)', async () => {
    const resAnalytics = await analyticsGET(new Request('http://localhost:3000/api/analytics'));
    assert.equal(resAnalytics.status, 401, 'Analytics must return 401 without session (no tenant_pme_ff9xl fallback!)');

    const resExport = await analyticsExportGET(new Request('http://localhost:3000/api/analytics/export?tab=leads'));
    assert.equal(resExport.status, 401, 'Export must return 401 without session (no anonymous lead leak!)');
  });

  // Cleanup
  test('cleanup test tenants and associated records', async () => {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherTenantId] } },
    });
  });
});
