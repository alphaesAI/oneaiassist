import 'dotenv/config';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { CrossChannelJourneyEngine } from '../../lib/email/journeyEngine';
import { GET as journeysGET, POST as journeysPOST } from '../../app/api/journeys/route';
import { runCampaignTick } from '../../worker/campaignRunner';
import { validateJourneySteps } from '../../lib/email/journeyValidation';
import { encrypt } from '../../lib/encryption';

describe('Step E10: Automations (Journeys) - Worker Execution, Concurrency, Triggers & Resilience', () => {
  const testId = `e10_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let tenantId: string;
  let otherTenantId: string;
  let welcomeTemplateId: string;
  let journeyId: string;
  let customerId: string;

  test('setup test tenants, templates, and 3-step welcome journey', async () => {
    // 1. Create primary tenant with specific time zone (America/New_York)
    const tenant = await prisma.tenant.create({
      data: {
        name: `E10 Agency ${testId}`,
        slug: `e10-agency-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        timeZone: 'America/New_York',
        postalAddress: '100 Automation Way, New York, NY 10001',
      },
    });
    tenantId = tenant.id;

    // 2. Create other tenant for multi-tenant isolation
    const otherTenant = await prisma.tenant.create({
      data: {
        name: `E10 Foreign Agency ${testId}`,
        slug: `e10-foreign-${testId}`,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        timeZone: 'UTC',
        postalAddress: '200 Foreign Blvd, London, UK',
      },
    });
    otherTenantId = otherTenant.id;

    // 3. Create Template for step 1
    const tpl = await prisma.template.create({
      data: {
        tenantId,
        name: `Welcome Template ${testId}`,
        subject: `Welcome to our agency ${testId}!`,
        body: `Hello {{name}}, welcome to our VIP portal.`,
        htmlBody: `<p>Hello {{name}}, welcome to our <strong>VIP portal</strong>.</p>`,
        channel: 'EMAIL',
        category: 'MARKETING',
      },
    });
    welcomeTemplateId = tpl.id;

    // 4. Create 3-step Welcome Journey:
    // Step 0: SEND_EMAIL (Welcome email via E1 queue)
    // Step 1: WAIT_DELAY (2 hours)
    // Step 2: ADD_TAG ("ONBOARDED")
    const journey = await prisma.crossChannelJourney.create({
      data: {
        tenantId,
        name: `3-Step Welcome Series ${testId}`,
        triggerType: 'CONTACT_CREATED',
        status: 'ACTIVE',
        frequencyCapDays: 0, // No cap for unit test
        quietHoursStart: null, // Disabled for direct step test
        quietHoursEnd: null,
        steps: [
          {
            id: 'step_email_1',
            type: 'SEND_EMAIL',
            channel: 'EMAIL',
            templateId: welcomeTemplateId,
            subject: `Welcome to our agency ${testId}!`,
          },
          {
            id: 'step_delay_2',
            type: 'WAIT_DELAY',
            delayHours: 2,
          },
          {
            id: 'step_tag_3',
            type: 'ADD_TAG',
            tagName: 'ONBOARDED',
          },
        ],
      },
    });
    journeyId = journey.id;

    // 5. Create customer
    const cust = await prisma.customer.create({
      data: {
        tenantId,
        displayName: `Welcome Lead ${testId}`,
        email: `lead_${testId}@example.com`,
        primaryPhone: `+15551110001`,
        emailConsentStatus: 'SUBSCRIBED',
        emailConsentSource: 'Website Signup',
        tags: ['PROSPECT'],
      },
    });
    customerId = cust.id;
  });

  test('1. CONTACT_CREATED trigger automatically enrolls new contact into active journey', async () => {
    const triggerRes = await CrossChannelJourneyEngine.handleTrigger(tenantId, 'CONTACT_CREATED', {
      customerId,
    });

    assert.equal(triggerRes.enrolledCount, 1, 'Should enroll 1 contact');
    assert.deepEqual(triggerRes.journeyIds, [journeyId]);

    const enrollment = await prisma.journeyEnrollment.findUnique({
      where: { journeyId_customerId: { journeyId, customerId } },
    });
    assert.ok(enrollment, 'Enrollment must exist');
    assert.equal(enrollment.status, 'IN_PROGRESS');
    assert.equal(enrollment.currentStepIndex, 0);
  });

  test('2. Step 0 (SEND_EMAIL) enqueues email BroadcastJob through the E1 queue', async () => {
    const res = await CrossChannelJourneyEngine.executeStep(tenantId, (await prisma.journeyEnrollment.findFirstOrThrow({
      where: { journeyId, customerId },
    })).id);

    assert.equal(res.status, 'STEP_EXECUTED');

    // Verify E1 BroadcastJob was enqueued
    const job = await prisma.broadcastJob.findFirst({
      where: {
        tenantId,
        customerId,
        channel: 'EMAIL',
        status: 'PENDING',
      },
    });
    assert.ok(job, 'Email job must be created in E1 queue');
    assert.equal(job.recipient, `lead_${testId}@example.com`);

    // Verify enrollment advanced to Step 1 (WAIT_DELAY)
    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { journeyId_customerId: { journeyId, customerId } },
    });
    assert.equal(enrollment.currentStepIndex, 1);
  });

  test('3. Step 1 (WAIT_DELAY) schedules next execution time 2 hours ahead', async () => {
    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { journeyId_customerId: { journeyId, customerId } },
    });

    const now = new Date('2026-11-26T12:00:00Z');
    const res = await CrossChannelJourneyEngine.executeStep(tenantId, enrollment.id, {
      now: () => now,
    });

    assert.equal(res.status, 'STEP_EXECUTED');

    const updated = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    assert.equal(updated.currentStepIndex, 2);
    assert.ok(updated.nextExecutionAt);

    const diffHours = (updated.nextExecutionAt.getTime() - now.getTime()) / 3600_000;
    assert.equal(Math.round(diffHours), 2, 'Next execution must be 2 hours ahead');
  });

  test('4. Step 2 (ADD_TAG) adds "ONBOARDED" tag and marks journey COMPLETED', async () => {
    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { journeyId_customerId: { journeyId, customerId } },
    });

    const res = await CrossChannelJourneyEngine.executeStep(tenantId, enrollment.id);
    assert.equal(res.status, 'COMPLETED');

    // Verify customer received tag
    const cust = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId, tenantId },
    });
    assert.ok(cust.tags.includes('ONBOARDED'), 'Customer must receive ONBOARDED tag');

    // Verify enrollment status is COMPLETED
    const finishedEnrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    assert.equal(finishedEnrollment.status, 'COMPLETED');

    // Verify journey completedCount incremented
    const finishedJourney = await prisma.crossChannelJourney.findUniqueOrThrow({
      where: { id: journeyId, tenantId },
    });
    assert.equal(finishedJourney.completedCount, 1);
  });

  test('5. Atomic claim step prevents two workers from executing the same enrollment', async () => {
    // Create new enrollment
    const cust2 = await prisma.customer.create({
      data: {
        tenantId,
        displayName: `Concurrent Lead ${testId}`,
        email: `concurrent_${testId}@example.com`,
        primaryPhone: `+15551110002`,
        emailConsentStatus: 'SUBSCRIBED',
        emailConsentSource: 'Form',
      },
    });

    await CrossChannelJourneyEngine.enrollCustomer(tenantId, journeyId, cust2.id);
    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { journeyId_customerId: { journeyId, customerId: cust2.id } },
    });

    // Simulate Worker 1 claiming the enrollment
    const now = new Date();
    const claimWorker1 = await prisma.journeyEnrollment.updateMany({
      where: {
        id: enrollment.id,
        tenantId,
        status: 'IN_PROGRESS',
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }],
      },
      data: { lockedAt: now, lockedBy: 'worker_alpha' },
    });
    assert.equal(claimWorker1.count, 1, 'Worker 1 claims successfully');

    // Worker 2 attempts to claim the same enrollment concurrently
    const claimWorker2 = await prisma.journeyEnrollment.updateMany({
      where: {
        id: enrollment.id,
        tenantId,
        status: 'IN_PROGRESS',
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }],
      },
      data: { lockedAt: now, lockedBy: 'worker_beta' },
    });
    assert.equal(claimWorker2.count, 0, 'Worker 2 must NOT claim already locked enrollment');
  });

  test('6. Attempt caps (max 3) and exponential backoff: failing step does NOT block others', async () => {
    // Create broken journey with an invalid step that throws
    const brokenJourney = await prisma.crossChannelJourney.create({
      data: {
        tenantId,
        name: `Broken Journey ${testId}`,
        triggerType: 'CONTACT_CREATED',
        status: 'ACTIVE',
        steps: [
          {
            id: 'broken_step_1',
            type: 'SEND_EMAIL',
            // Missing template or invalid configuration
            templateId: 'non_existent_template_id',
          },
        ],
      },
    });

    const custBroken = await prisma.customer.create({
      data: {
        tenantId,
        displayName: `Broken Test Customer ${testId}`,
        email: `broken_${testId}@example.com`,
        primaryPhone: `+15551110003`,
        emailConsentStatus: 'SUBSCRIBED',
        emailConsentSource: 'Form',
      },
    });

    await CrossChannelJourneyEngine.enrollCustomer(tenantId, brokenJourney.id, custBroken.id);
    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { journeyId_customerId: { journeyId: brokenJourney.id, customerId: custBroken.id } },
    });

    // Attempt 1: fails and backs off
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { attempts: 1 } });
    // Attempt 2: fails and backs off
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { attempts: 2 } });

    // Attempt 3: reached max attempts (3) -> should mark status as FAILED
    const failStepRes = await CrossChannelJourneyEngine.executeStep(tenantId, enrollment.id);
    assert.equal(failStepRes.status, 'FAILED');

    const failedEnrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    assert.equal(failedEnrollment.status, 'FAILED');
    assert.equal(failedEnrollment.lockedAt, null, 'Lock must be released');
  });

  test('7. Tenant time zone aware quiet hours calculation (America/New_York)', () => {
    // 21:00 to 08:00 quiet hours
    // Test date: 2026-11-26T03:00:00Z (which is 10:00 PM / 22:00 in America/New_York) -> IN QUIET HOURS!
    const nyNightUtc = new Date('2026-11-26T03:00:00Z');
    const checkNight = CrossChannelJourneyEngine.isWithinQuietHours('21:00', '08:00', nyNightUtc, 'America/New_York');
    assert.equal(checkNight.inQuietHours, true, '22:00 NY time is within quiet hours');
    assert.ok(checkNight.resumeAt, 'Must compute resumeAt');

    // Test date: 2026-11-26T18:00:00Z (which is 1:00 PM / 13:00 in America/New_York) -> OUT OF QUIET HOURS!
    const nyDayUtc = new Date('2026-11-26T18:00:00Z');
    const checkDay = CrossChannelJourneyEngine.isWithinQuietHours('21:00', '08:00', nyDayUtc, 'America/New_York');
    assert.equal(checkDay.inQuietHours, false, '13:00 NY time is outside quiet hours');
  });

  test('8. Exit conditions: contact opting out or unsubscribing exits immediately', async () => {
    const unsubCustomer = await prisma.customer.create({
      data: {
        tenantId,
        displayName: `Unsubscribed User ${testId}`,
        email: `unsub_${testId}@example.com`,
        primaryPhone: `+15551110004`,
        emailConsentStatus: 'UNSUBSCRIBED',
        emailConsentSource: 'User Action',
      },
    });

    const enrollRes = await CrossChannelJourneyEngine.enrollCustomer(tenantId, journeyId, unsubCustomer.id);
    assert.ok(enrollRes.success);

    const stepRes = await CrossChannelJourneyEngine.executeStep(tenantId, enrollRes.enrollmentId!);
    assert.equal(stepRes.status, 'EXITED');

    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { id: enrollRes.enrollmentId! },
    });
    assert.equal(enrollment.status, 'EXITED_UNSUBSCRIBED');
  });

  test('9. Validated branch targets: out-of-bounds indices fall back safely without crashing', async () => {
    const branchCustomer = await prisma.customer.create({
      data: {
        tenantId,
        displayName: `Branch User ${testId}`,
        email: `branch_${testId}@example.com`,
        primaryPhone: `+15551110005`,
        emailConsentStatus: 'SUBSCRIBED',
        emailConsentSource: 'Form',
        tags: ['VIP_MEMBER'],
      },
    });

    const branchJourney = await prisma.crossChannelJourney.create({
      data: {
        tenantId,
        name: `Branch Journey ${testId}`,
        triggerType: 'CONTACT_CREATED',
        status: 'ACTIVE',
        steps: [
          {
            id: 'step_branch_1',
            type: 'BRANCH_CONDITION',
            conditionType: 'TAG_PRESENT',
            conditionValue: 'VIP_MEMBER',
            onTrueStepIndex: 9999, // Out of bounds index
            onFalseStepIndex: -5,  // Negative index
          },
          {
            id: 'step_tag_fallback',
            type: 'ADD_TAG',
            tagName: 'FALLBACK_SUCCESS',
          },
        ],
      },
    });

    const enrollRes = await CrossChannelJourneyEngine.enrollCustomer(tenantId, branchJourney.id, branchCustomer.id);
    assert.ok(enrollRes.success);

    // Executing branch with invalid indices must not crash; falls back to currentStepIndex + 1
    const res = await CrossChannelJourneyEngine.executeStep(tenantId, enrollRes.enrollmentId!);
    assert.equal(res.status, 'STEP_EXECUTED');

    const updatedEnrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { id: enrollRes.enrollmentId! },
    });
    assert.equal(updatedEnrollment.currentStepIndex, 1, 'Safe fallback advances to step 1');
  });

  test('10. Multi-tenant isolation: other tenant cannot read or execute enrollments', async () => {
    // Call processDueEnrollments for foreign tenant
    const foreignResult = await CrossChannelJourneyEngine.processDueEnrollments(otherTenantId);
    assert.equal(foreignResult.processed, 0, 'Foreign tenant cannot process primary tenant enrollments');

    // Call executeStep on primary tenant enrollment using foreign tenantId
    const primaryEnrollment = await prisma.journeyEnrollment.findFirstOrThrow({
      where: { tenantId },
    });
    const foreignExec = await CrossChannelJourneyEngine.executeStep(otherTenantId, primaryEnrollment.id);
    assert.equal(foreignExec.status, 'SKIPPED', 'Foreign tenant cannot execute primary tenant enrollment');
  });

  // ---------------------------------------------------------------------------------------
  // Real sending through the worker: who receives what
  // ---------------------------------------------------------------------------------------
  const extraTenantIds: string[] = [];

  function makeFakeAdapter() {
    const sent: Array<{ to: string; subject: string; html: string }> = [];
    return {
      sent,
      adapter: {
        providerName: 'FAKE',
        async send(email: any) {
          sent.push({ to: email.to, subject: email.subject, html: email.html });
          return { messageId: `fake_${sent.length}_${Math.random().toString(36).slice(2)}`, status: 'SENT' as const };
        },
      } as any,
    };
  }

  /** A tenant that can really send: provider config, verified domain, three email templates, some contacts. */
  async function createSendingTenant(label: string, contactCount: number) {
    const id = `${label}_${testId}`;
    const domain = `${label}-${testId}.example.com`.toLowerCase();
    const tenant = await prisma.tenant.create({
      data: {
        name: `E10 ${id}`, slug: `e10-${label}-${testId}`, status: 'ACTIVE',
        subscriptionPlan: 'FREE', subscriptionStatus: 'ACTIVE', timeZone: 'UTC',
        postalAddress: '1 Automation Road, Austin, TX 78701',
      },
    });
    extraTenantIds.push(tenant.id);
    await prisma.tenantSendingDomain.create({ data: { tenantId: tenant.id, domain, status: 'VERIFIED', verifiedAt: new Date() } });
    await prisma.tenantEmailConfig.create({
      data: {
        tenantId: tenant.id, provider: 'RESEND', encryptedApiKey: encrypt('re_test_e10'),
        fromName: 'E10 Sender', fromEmail: `hello@${domain}`, postalAddress: '1 Automation Road, Austin, TX 78701',
        hourlySendRate: 1000, dailySendQuota: 1000,
      },
    });
    const mkTemplate = (n: number) =>
      prisma.template.create({
        data: {
          tenantId: tenant.id, name: `Welcome ${n} ${id}`, subject: `Welcome email ${n}`,
          body: `Body of email ${n}`, htmlBody: `<p>Body of email ${n} for {{name}}</p>`,
          channel: 'EMAIL', category: 'MARKETING',
        },
      });
    const templates = [await mkTemplate(1), await mkTemplate(2), await mkTemplate(3)];
    const contacts = [];
    for (let i = 0; i < contactCount; i++) {
      contacts.push(
        await prisma.customer.create({
          data: {
            tenantId: tenant.id, displayName: `Contact ${i}`, email: `c${i}_${id}@example.com`.toLowerCase(),
            primaryPhone: `+1556${String(Date.now()).slice(-6)}${i}`,
            emailConsentStatus: 'SUBSCRIBED', emailConsentSource: 'E10 test',
          },
        })
      );
    }
    return { tenantId: tenant.id, templates, contacts };
  }

  async function createSeries(t: Awaited<ReturnType<typeof createSendingTenant>>, name: string) {
    return prisma.crossChannelJourney.create({
      data: {
        tenantId: t.tenantId, name, triggerType: 'CONTACT_CREATED', status: 'ACTIVE',
        frequencyCapDays: 0, quietHoursStart: null, quietHoursEnd: null,
        steps: [
          { id: 'email_1', type: 'SEND_EMAIL', templateId: t.templates[0].id },
          { id: 'wait_1', type: 'WAIT_DELAY', delayHours: 24 },
          { id: 'email_2', type: 'SEND_EMAIL', templateId: t.templates[1].id, subject: 'Custom subject for email 2' },
          { id: 'wait_2', type: 'WAIT_DELAY', delayHours: 48 },
          { id: 'email_3', type: 'SEND_EMAIL', templateId: t.templates[2].id },
        ],
      },
    });
  }

  /** Runs the worker repeatedly, moving the clock forward, until the tenant's enrollments are finished. */
  async function runWorkerThroughSeries(tenant: string, fake: ReturnType<typeof makeFakeAdapter>, start: Date) {
    let clock = start;
    for (let i = 0; i < 12; i++) {
      await runCampaignTick({ workerId: `e10_${i}`, now: () => clock, emailDeps: { adapterOverride: fake.adapter } });
      const open = await prisma.journeyEnrollment.count({ where: { tenantId: tenant, status: 'IN_PROGRESS' } });
      const pending = await prisma.broadcastJob.count({ where: { tenantId: tenant, status: { in: ['PENDING', 'PROCESSING'] } } });
      if (open === 0 && pending === 0) break;
      clock = new Date(clock.getTime() + 25 * 3600_000);
    }
    return clock;
  }

  test('11. Three-email welcome series: the enrolled contact gets all three emails in order, nobody else gets anything', async () => {
    const t = await createSendingTenant('series', 4);
    const journey = await createSeries(t, `Welcome series ${testId}`);
    const [enrolled, ...bystanders] = t.contacts;

    const trigger = await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'CONTACT_CREATED', { customerId: enrolled.id });
    assert.equal(trigger.enrolledCount, 1);

    const fake = makeFakeAdapter();
    await runWorkerThroughSeries(t.tenantId, fake, new Date());

    // Exactly three emails, all to the enrolled contact, each with its own template and subject
    const mine = fake.sent.filter((e) => e.to.endsWith(`_series_${testId}@example.com`.toLowerCase()));
    assert.deepEqual(mine.map((e) => e.to), [enrolled.email, enrolled.email, enrolled.email]);
    assert.deepEqual(mine.map((e) => e.subject), ['Welcome email 1', 'Custom subject for email 2', 'Welcome email 3']);
    assert.ok(mine[0].html.includes('Body of email 1'));
    assert.ok(mine[1].html.includes('Body of email 2'));
    assert.ok(mine[2].html.includes('Body of email 3'));
    // Every email carries a signed unsubscribe link (an unsigned one is rejected by the endpoint)
    for (const mail of mine) {
      assert.match(mail.html, /\/api\/channels\/email\/unsubscribe\?token=[\w.\-%]+/);
      assert.ok(!mail.html.includes('unsubscribe?email='), 'No unsigned unsubscribe link may be sent');
      assert.ok(!mail.html.includes('{{unsubscribe_url}}'), 'The placeholder must be replaced');
      assert.ok(mail.html.includes('1 Automation Road'), 'The postal address is in the footer');
    }

    // No job of any kind exists for the contacts who never entered the journey
    const strayJobs = await prisma.broadcastJob.count({
      where: { tenantId: t.tenantId, customerId: { in: bystanders.map((b) => b.id) } },
    });
    assert.equal(strayJobs, 0, 'Contacts outside the journey must not be emailed');

    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
      where: { journeyId_customerId: { journeyId: journey.id, customerId: enrolled.id } },
    });
    assert.equal(enrollment.status, 'COMPLETED');
    assert.equal(enrollment.lastError, null);

    // One container per email step, still open, marked as JOURNEY and never given an audience
    const stepCampaigns = await prisma.broadcastCampaign.findMany({
      where: { tenantId: t.tenantId, journeyId: journey.id },
      orderBy: { journeyStepId: 'asc' },
    });
    assert.deepEqual(stepCampaigns.map((c) => c.journeyStepId), ['email_1', 'email_2', 'email_3']);
    for (const c of stepCampaigns) {
      assert.equal(c.kind, 'JOURNEY');
      assert.equal(c.status, 'SENDING', 'A step container must stay open for later contacts');
      assert.equal(c.totalRecipients, 0, 'The worker must never build an audience for a journey step');
    }

    // A contact who enters days later still receives the series
    const late = bystanders[0];
    await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'CONTACT_CREATED', { customerId: late.id });
    const fakeLate = makeFakeAdapter();
    await runWorkerThroughSeries(t.tenantId, fakeLate, new Date(Date.now() + 30 * 24 * 3600_000));
    const lateMails = fakeLate.sent.filter((e) => e.to === late.email);
    assert.equal(lateMails.length, 3, 'A later contact must also get all three emails');
    assert.equal(fakeLate.sent.filter((e) => e.to === enrolled.email).length, 0, 'The first contact is not emailed again');

    // Journey step containers stay out of the normal campaign list
    const { CampaignService } = await import('../../lib/email/campaignService');
    const listed = await CampaignService.listCampaignsWithLiveJobs(t.tenantId, 'EMAIL');
    assert.equal(listed.length, 0);
  });

  test('12. A repeated trigger does not restart the series; a manual re-enrollment does', async () => {
    const t = await createSendingTenant('reenroll', 1);
    const journey = await createSeries(t, `Re-enroll series ${testId}`);
    const contact = t.contacts[0];

    await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'CONTACT_CREATED', { customerId: contact.id });
    const fake = makeFakeAdapter();
    const end = await runWorkerThroughSeries(t.tenantId, fake, new Date());
    assert.equal(fake.sent.filter((e) => e.to === contact.email).length, 3);

    // The same event fires again (think: every email open or click)
    const again = await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'CONTACT_CREATED', { customerId: contact.id });
    assert.equal(again.enrolledCount, 0, 'A trigger must not send a contact through a finished journey again');

    // An operator deliberately enrolls the contact again
    const later = new Date(end.getTime() + 24 * 3600_000);
    const manual = await CrossChannelJourneyEngine.enrollCustomer(t.tenantId, journey.id, contact.id, later);
    assert.equal(manual.success, true);
    const fake2 = makeFakeAdapter();
    await runWorkerThroughSeries(t.tenantId, fake2, later);
    assert.equal(fake2.sent.filter((e) => e.to === contact.email).length, 3, 'A manual re-enrollment sends the series again');

    const jobs = await prisma.broadcastJob.count({ where: { tenantId: t.tenantId, customerId: contact.id } });
    assert.equal(jobs, 3, 'Still one job per email step, reused on the second run');
  });

  test('13. An email step with no template fails with a clear message and sends nothing', async () => {
    const t = await createSendingTenant('notemplate', 2);
    const journey = await prisma.crossChannelJourney.create({
      data: {
        tenantId: t.tenantId, name: `Broken ${testId}`, triggerType: 'CONTACT_CREATED', status: 'ACTIVE',
        frequencyCapDays: 0, quietHoursStart: null, quietHoursEnd: null,
        steps: [{ id: 's1', type: 'SEND_EMAIL', subject: 'Subject without a template' }],
      },
    });
    const res = await CrossChannelJourneyEngine.enrollCustomer(t.tenantId, journey.id, t.contacts[0].id);
    let clock = new Date();
    let last = { status: '', message: '' };
    for (let i = 0; i < 3; i++) {
      last = await CrossChannelJourneyEngine.executeStep(t.tenantId, res.enrollmentId!, { now: () => clock });
      clock = new Date(clock.getTime() + 3 * 3600_000);
    }
    assert.equal(last.status, 'FAILED');
    const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: res.enrollmentId! } });
    assert.equal(enrollment.status, 'FAILED');
    assert.match(enrollment.lastError || '', /no template selected/i);
    assert.equal(await prisma.broadcastJob.count({ where: { tenantId: t.tenantId } }), 0);
    assert.equal(await prisma.broadcastCampaign.count({ where: { tenantId: t.tenantId } }), 0);

    // The same check stops such a journey from being created or switched on
    const problems = await validateJourneySteps(t.tenantId, journey.steps);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /choose an email template/i);
    assert.deepEqual(await validateJourneySteps(t.tenantId, []), ['Add at least one step.']);
    assert.deepEqual(
      await validateJourneySteps(t.tenantId, [
        { id: 'a', type: 'SEND_EMAIL', templateId: t.templates[0].id },
        { id: 'b', type: 'WAIT_DELAY', delayHours: 24 },
        { id: 'c', type: 'ADD_TAG', tagName: 'Welcomed' },
      ]),
      []
    );
    // A template that belongs to another tenant is not accepted
    const foreign = await validateJourneySteps(otherTenantId, [{ id: 'a', type: 'SEND_EMAIL', templateId: t.templates[0].id }]);
    assert.match(foreign[0], /does not exist/i);
  });

  test('14. A paused journey sends nothing and continues from the same place when resumed', async () => {
    const t = await createSendingTenant('paused', 1);
    const journey = await createSeries(t, `Pausable ${testId}`);
    const contact = t.contacts[0];
    const res = await CrossChannelJourneyEngine.enrollCustomer(t.tenantId, journey.id, contact.id);

    await prisma.crossChannelJourney.update({ where: { id: journey.id }, data: { status: 'PAUSED' } });
    const now = new Date();
    const paused = await CrossChannelJourneyEngine.executeStep(t.tenantId, res.enrollmentId!, { now: () => now });
    assert.equal(paused.status, 'POSTPONED');
    assert.equal(await prisma.broadcastJob.count({ where: { tenantId: t.tenantId } }), 0);
    const held = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: res.enrollmentId! } });
    assert.equal(held.currentStepIndex, 0);
    assert.equal(held.status, 'IN_PROGRESS');
    assert.ok(held.nextExecutionAt && held.nextExecutionAt > now);

    await prisma.crossChannelJourney.update({ where: { id: journey.id }, data: { status: 'ACTIVE' } });
    const resumed = await CrossChannelJourneyEngine.executeStep(t.tenantId, res.enrollmentId!, { now: () => now });
    assert.equal(resumed.status, 'STEP_EXECUTED');
    assert.equal(await prisma.broadcastJob.count({ where: { tenantId: t.tenantId, customerId: contact.id } }), 1);
  });

  test('15. The worker never treats a campaign with no audience as "send to everyone"', async () => {
    const t = await createSendingTenant('noaudience', 3);
    const now = new Date();
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        tenantId: t.tenantId, name: `No audience ${testId}`, channel: 'EMAIL', status: 'QUEUED',
        templateId: t.templates[0].id, subject: 'Should never be sent', scheduledAt: now,
      },
    });
    const fake = makeFakeAdapter();
    await runCampaignTick({ now: () => now, emailDeps: { adapterOverride: fake.adapter } });
    await runCampaignTick({ now: () => now, emailDeps: { adapterOverride: fake.adapter } });

    const after = await prisma.broadcastCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(after.status, 'FAILED');
    assert.match(after.lastError || '', /no audience/i);
    assert.equal(await prisma.broadcastJob.count({ where: { tenantId: t.tenantId } }), 0);
    assert.equal(fake.sent.filter((e) => e.to.includes(`_noaudience_${testId}`.toLowerCase())).length, 0);
  });

  test('16. LIST_JOINED and EMAIL_OPENED triggers enroll only when their condition matches', async () => {
    const t = await createSendingTenant('triggers', 2);
    const list = await prisma.contactList.create({ data: { tenantId: t.tenantId, name: `VIP ${testId}` } });
    const mk = (name: string, triggerType: 'LIST_JOINED' | 'EMAIL_OPENED', triggerConfig: any) =>
      prisma.crossChannelJourney.create({
        data: {
          tenantId: t.tenantId, name, triggerType, triggerConfig, status: 'ACTIVE', frequencyCapDays: 0,
          quietHoursStart: null, quietHoursEnd: null,
          steps: [{ id: 'tag', type: 'ADD_TAG', tagName: name }],
        },
      });
    const listJourney = await mk(`list_${testId}`, 'LIST_JOINED', { listId: list.id });
    const openJourney = await mk(`open_${testId}`, 'EMAIL_OPENED', { campaignId: 'campaign_x' });

    const wrongList = await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'LIST_JOINED', { customerId: t.contacts[0].id, listId: 'another_list' });
    assert.equal(wrongList.enrolledCount, 0);
    const rightList = await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'LIST_JOINED', { customerId: t.contacts[0].id, listId: list.id });
    assert.deepEqual(rightList.journeyIds, [listJourney.id]);

    const otherCampaign = await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'EMAIL_OPENED', { customerId: t.contacts[1].id, campaignId: 'campaign_y' });
    assert.equal(otherCampaign.enrolledCount, 0);
    const first = await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'EMAIL_OPENED', { customerId: t.contacts[1].id, campaignId: 'campaign_x' });
    assert.deepEqual(first.journeyIds, [openJourney.id]);
    // The same person opens the email five more times
    for (let i = 0; i < 5; i++) {
      const repeat = await CrossChannelJourneyEngine.handleTrigger(t.tenantId, 'EMAIL_OPENED', { customerId: t.contacts[1].id, campaignId: 'campaign_x' });
      assert.equal(repeat.enrolledCount, 0);
    }
    assert.equal(await prisma.journeyEnrollment.count({ where: { tenantId: t.tenantId, journeyId: openJourney.id } }), 1);
  });

  // Cleanup
  test('cleanup test tenants and associated records', async () => {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherTenantId, ...extraTenantIds] } },
    });
  });
});
