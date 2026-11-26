import 'dotenv/config';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { AbTestingService } from '../../lib/email/abTesting';
import { CampaignReportService } from '../../lib/email/campaignReport';
import { resolveJobVariantPayload } from '../../worker/senders/emailSender';
import { GET as abWinnerGET, POST as abWinnerPOST } from '../../app/api/dashboard/broadcast/[id]/ab-winner/route';

describe('Step E9: A/B Testing - Audience Partitioning, Winner Evaluation & Remainder Rollout', () => {
  const testId = `e9_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let tenantId: string;
  let otherTenantId: string;
  let templateAId: string;
  let templateBId: string;
  let campaignId: string;
  const customerIds: string[] = [];

  test('setup test tenants, templates, customers, and A/B campaign', async () => {
    // 1. Create primary tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: `E9 Primary Agency ${testId}`,
        slug: `e9-agency-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        postalAddress: '100 AB Testing Way, Austin, TX 78701',
      },
    });
    tenantId = tenant.id;

    // 2. Create other tenant for multi-tenant isolation
    const otherTenant = await prisma.tenant.create({
      data: {
        name: `E9 Foreign Agency ${testId}`,
        slug: `e9-other-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        postalAddress: '200 Foreign Rd, Dallas, TX 75201',
      },
    });
    otherTenantId = otherTenant.id;

    // 3. Create Templates A & B
    const tplA = await prisma.template.create({
      data: {
        tenantId,
        name: `Template A ${testId}`,
        subject: `Variant A Subject ${testId}`,
        body: `Hello {{name}}, this is Variant A content.`,
        htmlBody: `<p>Hello {{name}}, this is <strong>Variant A</strong> content.</p>`,
        channel: 'EMAIL',
        category: 'MARKETING',
      },
    });
    templateAId = tplA.id;

    const tplB = await prisma.template.create({
      data: {
        tenantId,
        name: `Template B ${testId}`,
        subject: `Variant B Winning Subject ${testId}`,
        body: `Hello {{name}}, this is Variant B content!`,
        htmlBody: `<p>Hello {{name}}, this is <strong>Variant B</strong> content!</p>`,
        channel: 'EMAIL',
        category: 'MARKETING',
      },
    });
    templateBId = tplB.id;

    // 4. Create 10 customers
    for (let i = 1; i <= 10; i++) {
      const cust = await prisma.customer.create({
        data: {
          tenantId,
          displayName: `Subscriber ${i} ${testId}`,
          email: `sub${i}_${testId}@example.com`,
          primaryPhone: `+1555999${String(i).padStart(4, '0')}`,
          emailConsentStatus: 'SUBSCRIBED',
          emailConsentSource: 'E9 Test Harness',
        },
      });
      customerIds.push(cust.id);
    }

    // 5. Create A/B BroadcastCampaign (50% test split, 4h duration, metric = CLICKS)
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId,
        name: `E9 Product Launch A/B Test ${testId}`,
        subject: `Variant A Subject ${testId}`,
        templateId: templateAId,
        channel: 'EMAIL',
        status: 'SENDING',
        isAbTest: true,
        abSubjectB: `Variant B Winning Subject ${testId}`,
        abSenderNameB: `Apex Deals Team`,
        abTemplateIdB: templateBId,
        abTestSplit: 50,
        abWinnerMetric: 'CLICKS',
        abDurationHours: 4,
        totalRecipients: 10,
        startedAt: new Date(Date.now() - 5 * 3600_000), // 5 hours ago (past test duration)
      },
    });
    campaignId = campaign.id;

    // 6. Partition audience jobs manually or simulate runner logic:
    // With 10 customers, 50% test split = 5 test contacts (2 A, 3 B), 5 REMAINDER contacts.
    // - Customer 1 & 2: Variant A (scheduled now, sent 5h ago)
    // - Customer 3, 4, 5: Variant B (scheduled now, sent 5h ago)
    // - Customer 6..10: Variant REMAINDER (scheduledFor = now + 4h, held)
    const now = new Date();
    const futureTime = new Date(now.getTime() + 4 * 3600_000);

    // Variant A jobs (2 jobs)
    for (let i = 1; i <= 2; i++) {
      await prisma.broadcastJob.create({
        data: {
          tenantId,
          campaignId,
          customerId: customerIds[i - 1],
          recipient: `sub${i}_${testId}@example.com`,
          channel: 'EMAIL',
          status: 'SENT',
          variant: 'A',
          scheduledFor: new Date(now.getTime() - 5 * 3600_000),
          processedAt: new Date(now.getTime() - 5 * 3600_000),
        },
      });
    }

    // Variant B jobs (3 jobs)
    for (let i = 3; i <= 5; i++) {
      await prisma.broadcastJob.create({
        data: {
          tenantId,
          campaignId,
          customerId: customerIds[i - 1],
          recipient: `sub${i}_${testId}@example.com`,
          channel: 'EMAIL',
          status: 'SENT',
          variant: 'B',
          scheduledFor: new Date(now.getTime() - 5 * 3600_000),
          processedAt: new Date(now.getTime() - 5 * 3600_000),
        },
      });
    }

    // Remainder jobs (5 jobs) - status PENDING, scheduledFor held in future
    for (let i = 6; i <= 10; i++) {
      await prisma.broadcastJob.create({
        data: {
          tenantId,
          campaignId,
          customerId: customerIds[i - 1],
          recipient: `sub${i}_${testId}@example.com`,
          channel: 'EMAIL',
          status: 'PENDING',
          variant: 'REMAINDER',
          scheduledFor: futureTime,
        },
      });
    }

    // 7. Seed Email Events:
    // Variant A (2 delivered):
    // - sub 1: OPENED, NO CLICK
    // - sub 2: DELIVERED, NO OPEN, NO CLICK
    // Rate A: 1 Open (50%), 0 Clicks (0.0%)
    await prisma.emailEvent.createMany({
      data: [
        { tenantId, campaignId, email: `sub1_${testId}@example.com`, eventType: 'DELIVERED' },
        { tenantId, campaignId, email: `sub1_${testId}@example.com`, eventType: 'OPEN' },
        { tenantId, campaignId, email: `sub2_${testId}@example.com`, eventType: 'DELIVERED' },
      ],
    });

    // Variant B (3 delivered):
    // - sub 3: OPEN, CLICK
    // - sub 4: OPEN, CLICK
    // - sub 5: DELIVERED
    // Rate B: 2 Opens (66.7%), 2 Clicks (66.7%) -> CLEAR WINNER ON CLICKS & OPENS!
    await prisma.emailEvent.createMany({
      data: [
        { tenantId, campaignId, email: `sub3_${testId}@example.com`, eventType: 'DELIVERED' },
        { tenantId, campaignId, email: `sub3_${testId}@example.com`, eventType: 'OPEN' },
        { tenantId, campaignId, email: `sub3_${testId}@example.com`, eventType: 'CLICK', url: 'https://example.com/win' },
        { tenantId, campaignId, email: `sub4_${testId}@example.com`, eventType: 'DELIVERED' },
        { tenantId, campaignId, email: `sub4_${testId}@example.com`, eventType: 'OPEN' },
        { tenantId, campaignId, email: `sub4_${testId}@example.com`, eventType: 'CLICK', url: 'https://example.com/win' },
        { tenantId, campaignId, email: `sub5_${testId}@example.com`, eventType: 'DELIVERED' },
      ],
    });
  });

  test('1. Audience partitioning verification: Variant A, Variant B, and Remainder', async () => {
    const jobs = await prisma.broadcastJob.findMany({
      where: { campaignId, tenantId },
      orderBy: { recipient: 'asc' },
    });
    assert.equal(jobs.length, 10, 'Total of 10 jobs created');

    const variantAJobs = jobs.filter((j) => j.variant === 'A');
    const variantBJobs = jobs.filter((j) => j.variant === 'B');
    const remainderJobs = jobs.filter((j) => j.variant === 'REMAINDER');

    assert.equal(variantAJobs.length, 2, 'Variant A has 2 recipients');
    assert.equal(variantBJobs.length, 3, 'Variant B has 3 recipients');
    assert.equal(remainderJobs.length, 5, 'Remainder has 5 recipients held');

    // Verify remainder jobs have future scheduledFor
    for (const r of remainderJobs) {
      assert.ok(r.scheduledFor > new Date(), 'Remainder job must be scheduled for the future during test phase');
    }
  });

  test('2. Dynamic variant resolution in email sender for Variant A, B, and Remainder', async () => {
    const campaign = await prisma.broadcastCampaign.findUniqueOrThrow({
      where: { id: campaignId, tenantId },
      include: { template: true },
    });

    const jobA = await prisma.broadcastJob.findFirstOrThrow({
      where: { campaignId, tenantId, variant: 'A' },
    });
    const jobB = await prisma.broadcastJob.findFirstOrThrow({
      where: { campaignId, tenantId, variant: 'B' },
    });
    const jobRemainder = await prisma.broadcastJob.findFirstOrThrow({
      where: { campaignId, tenantId, variant: 'REMAINDER' },
    });

    // Resolve Variant A
    const resA = await resolveJobVariantPayload(campaign, jobA);
    assert.equal(resA.effectiveVariant, 'A');
    assert.equal(resA.subject, `Variant A Subject ${testId}`);

    // Resolve Variant B
    const resB = await resolveJobVariantPayload(campaign, jobB);
    assert.equal(resB.effectiveVariant, 'B');
    assert.equal(resB.subject, `Variant B Winning Subject ${testId}`);
    assert.equal(resB.senderName, 'Apex Deals Team');
    assert.equal(resB.templateId, templateBId);

    // Resolve Remainder BEFORE winner selection -> defaults to A
    const resRemBefore = await resolveJobVariantPayload(campaign, jobRemainder);
    assert.equal(resRemBefore.effectiveVariant, 'A', 'Remainder before winner selection defaults to Variant A');

    // Resolve Remainder AFTER winner B selected -> must resolve to Variant B!
    const campaignWithWinnerB = { ...campaign, abWinnerSelected: 'B' };
    const resRemAfter = await resolveJobVariantPayload(campaignWithWinnerB, jobRemainder);
    assert.equal(resRemAfter.effectiveVariant, 'B', 'Remainder after winner B selected must resolve to Variant B');
    assert.equal(resRemAfter.subject, `Variant B Winning Subject ${testId}`);
    assert.equal(resRemAfter.templateId, templateBId);
  });

  test('3. AbTestingService.getCampaignAbPerformance returns live rates from DB', async () => {
    const perf = await AbTestingService.getCampaignAbPerformance(tenantId, campaignId);
    assert.ok(perf, 'Performance summary must be returned');

    // Variant A checks
    assert.equal(perf.variantA.sent, 2);
    assert.equal(perf.variantA.delivered, 2);
    assert.equal(perf.variantA.opens, 1);
    assert.equal(perf.variantA.openRate, 50.0);
    assert.equal(perf.variantA.clicks, 0);
    assert.equal(perf.variantA.clickRate, 0.0);

    // Variant B checks
    assert.equal(perf.variantB.sent, 3);
    assert.equal(perf.variantB.delivered, 3);
    assert.equal(perf.variantB.opens, 2);
    assert.ok(Math.abs(perf.variantB.openRate - 66.7) < 0.1);
    assert.equal(perf.variantB.clicks, 2);
    assert.ok(Math.abs(perf.variantB.clickRate - 66.7) < 0.1);

    // Remainder checks
    assert.equal(perf.remainder.total, 5);
    assert.equal(perf.remainder.sent, 0);
  });

  test('4. Winner evaluation selects Variant B and unlocks remainder jobs', async () => {
    const result = await AbTestingService.evaluateAbWinner(tenantId, campaignId);
    assert.ok(result, 'Evaluation result must be returned');

    assert.equal(result.winner, 'B', 'Variant B must win by higher click rate (66.7% vs 0.0%)');
    assert.equal(result.metric, 'CLICKS');
    assert.ok(result.message.includes('Variant B won'));

    // Verify DB was updated
    const updatedCampaign = await prisma.broadcastCampaign.findUniqueOrThrow({
      where: { id: campaignId, tenantId },
    });
    assert.equal(updatedCampaign.abWinnerSelected, 'B', 'abWinnerSelected must be saved as B');

    // Verify remainder jobs were unlocked (scheduledFor set to now)
    const remainderJobs = await prisma.broadcastJob.findMany({
      where: { campaignId, tenantId, variant: 'REMAINDER' },
    });
    assert.equal(remainderJobs.length, 5);
    for (const r of remainderJobs) {
      assert.ok(r.scheduledFor <= new Date(), 'Remainder jobs must now be unlocked and ready for worker dispatch');
    }
  });

  test('5. Remainder receives ONLY the winning version upon worker execution', async () => {
    // Fetch refreshed campaign with winner selected
    const refreshedCamp = await prisma.broadcastCampaign.findUniqueOrThrow({
      where: { id: campaignId, tenantId },
      include: { template: true },
    });
    assert.equal(refreshedCamp.abWinnerSelected, 'B');

    // For every remainder job, test that resolveJobVariantPayload returns winning variant B
    const remainderJobs = await prisma.broadcastJob.findMany({
      where: { campaignId, tenantId, variant: 'REMAINDER' },
    });

    for (const job of remainderJobs) {
      const payload = await resolveJobVariantPayload(refreshedCamp, job);
      assert.equal(payload.effectiveVariant, 'B', 'Remainder job must receive winning variant B');
      assert.equal(payload.subject, `Variant B Winning Subject ${testId}`);
      assert.equal(payload.templateId, templateBId);
      assert.ok(payload.htmlContent.includes('Variant B'), 'HTML content must contain Variant B body');
      assert.ok(!payload.htmlContent.includes('Variant A'), 'HTML content must NOT contain Variant A body');
    }
  });

  test('6. Campaign report summary includes A/B testing metrics side-by-side', async () => {
    const report = await CampaignReportService.getCampaignReport(tenantId, campaignId);
    assert.ok(report);
    assert.ok(report.abTest, 'Campaign report must contain abTest section');

    assert.equal(report.abTest.winner, 'B');
    assert.equal(report.abTest.variantA.subject, `Variant A Subject ${testId}`);
    assert.equal(report.abTest.variantB.subject, `Variant B Winning Subject ${testId}`);
    assert.equal(report.abTest.variantA.clicks, 0);
    assert.equal(report.abTest.variantB.clicks, 2);
    assert.equal(report.abTest.remainder.total, 5);
    assert.equal(report.abTest.remainder.sent, 0);

    // Test contact drilldown with variant filter
    const contactsA = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'recipients', {
      variant: 'A',
    });
    assert.ok(contactsA);
    assert.equal(contactsA.totalContacts, 2, 'Variant A drilldown contains 2 recipients');

    const contactsB = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'recipients', {
      variant: 'B',
    });
    assert.ok(contactsB);
    assert.equal(contactsB.totalContacts, 3, 'Variant B drilldown contains 3 recipients');

    const contactsRem = await CampaignReportService.getCampaignMetricContacts(tenantId, campaignId, 'recipients', {
      variant: 'REMAINDER',
    });
    assert.ok(contactsRem);
    assert.equal(contactsRem.totalContacts, 5, 'Remainder drilldown contains 5 recipients');
  });

  test('7. Multi-tenant isolation: foreign tenant cannot access A/B performance or pick winner', async () => {
    const foreignPerf = await AbTestingService.getCampaignAbPerformance(otherTenantId, campaignId);
    assert.equal(foreignPerf, null, 'Foreign tenant cannot view campaign A/B performance');

    const foreignWinner = await AbTestingService.evaluateAbWinner(otherTenantId, campaignId);
    assert.equal(foreignWinner, null, 'Foreign tenant cannot trigger A/B winner evaluation');
  });

  test('8. Unauthenticated route protection on /api/dashboard/broadcast/[id]/ab-winner', async () => {
    const reqGet = new Request(`http://localhost:3000/api/dashboard/broadcast/${campaignId}/ab-winner`);
    const resGet = await abWinnerGET(reqGet, { params: Promise.resolve({ id: campaignId }) });
    assert.equal(resGet.status, 401, 'Unauthenticated GET /ab-winner must return 401');

    const reqPost = new Request(`http://localhost:3000/api/dashboard/broadcast/${campaignId}/ab-winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const resPost = await abWinnerPOST(reqPost, { params: Promise.resolve({ id: campaignId }) });
    assert.equal(resPost.status, 401, 'Unauthenticated POST /ab-winner must return 401');
  });

  // Cleanup
  test('cleanup test tenants and associated records', async () => {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherTenantId] } },
    });
  });
});
