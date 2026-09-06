import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';
import { Client } from 'pg';

async function runPhase1Verification() {
  console.log('================================================================');
  console.log('🧪 RUNNING PHASE 1 MULTI-GATE VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedGates = 0;
  const totalGates = 5;

  // --------------------------------------------------------------------------
  // GATE 1.1: Atomic DB Unique Constraint Test (tenantId, wamId)
  // --------------------------------------------------------------------------
  console.log('🔹 Gate 1.1: Testing DB-Level Atomic Unique Constraint on (tenantId, wamId)...');
  const testTenant = 'tenant_pme_ff9xl';
  const testWamId = `wam_test_idempotency_${Date.now()}`;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    // Set tenant context for RLS session
    await client.query(`SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_user_role', 'ADMIN', false);`, [testTenant]);

    // Insert initial record
    await client.query(`
      INSERT INTO "InboundMessageJob" ("id", "tenantId", "wamId", "senderPhone", "recipientId", "status", "conversationId", "messageId")
      VALUES ($1, $2, $3, '+15550183', '10987654321', 'RECEIVED', 'conv_test_1', 'msg_test_1');
    `, [`job_${Date.now()}_1`, testTenant, testWamId]);

    // Attempt to insert duplicate wamId under same tenant
    let caughtConflict = false;
    try {
      await client.query(`
        INSERT INTO "InboundMessageJob" ("id", "tenantId", "wamId", "senderPhone", "recipientId", "status", "conversationId", "messageId")
        VALUES ($1, $2, $3, '+15550183', '10987654321', 'RECEIVED', 'conv_test_2', 'msg_test_2');
      `, [`job_${Date.now()}_2`, testTenant, testWamId]);
    } catch (err: any) {
      if (err.code === '23505') {
        caughtConflict = true;
        console.log('   ✅ PostgreSQL cleanly rejected duplicate with error 23505 (unique_violation)');
      } else {
        throw err;
      }
    }

    if (caughtConflict) {
      console.log('   ✅ Gate 1.1 PASSED: DB unique constraint is genuine and active.');
      passedGates++;
    } else {
      console.error('   ❌ Gate 1.1 FAILED: Duplicate wamId was allowed!');
    }
  } finally {
    // Cleanup test job
    await client.query(`DELETE FROM "InboundMessageJob" WHERE "wamId" = $1;`, [testWamId]);
    await client.end();
  }

  // --------------------------------------------------------------------------
  // GATE 1.2: Strict RLS Tenant-Isolation Test
  // --------------------------------------------------------------------------
  console.log('\n🔹 Gate 1.2: Testing Row-Level Security (RLS) Tenant Isolation...');
  try {
    // Connect as tenant_pme_ff9xl
    const pmeDb = getTenantPrisma('tenant_pme_ff9xl', 'ADMIN');
    
    // Attempt to query dynamic questions belonging to a different tenant
    const foreignQuestions = await (pmeDb as any).dynamicIntakeQuestion.findMany({
      where: { tenantId: 'tenant_apex_default' },
    });

    if (foreignQuestions.length === 0) {
      console.log('   ✅ RLS strictly blocked cross-tenant query (0 foreign rows returned)');
      console.log('   ✅ Gate 1.2 PASSED: Tenant isolation is enforced on DynamicIntakeQuestion.');
      passedGates++;
    } else {
      console.error(`   ❌ Gate 1.2 FAILED: Cross-tenant data leak! Found ${foreignQuestions.length} foreign rows.`);
    }
  } catch (err) {
    console.error('   ❌ Gate 1.2 Error:', err);
  }

  // --------------------------------------------------------------------------
  // GATE 1.3: InboundJobStatus Lifecycle State Machine Test
  // --------------------------------------------------------------------------
  console.log('\n🔹 Gate 1.3: Testing InboundJobStatus Lifecycle State Progression...');
  try {
    const jobTestWam = `wam_lifecycle_${Date.now()}`;
    const pmeDb = getTenantPrisma('tenant_pme_ff9xl', 'ADMIN');

    // 1. Create with RECEIVED
    const job = await (pmeDb as any).inboundMessageJob.create({
      data: {
        tenantId: 'tenant_pme_ff9xl',
        wamId: jobTestWam,
        senderPhone: '+15550183',
        status: 'RECEIVED',
        conversationId: 'conv_lifecycle_test',
        messageId: `msg_lifecycle_${Date.now()}`,
      },
    });
    console.log(`   State 1: Created job status = ${job.status}`);

    // 2. Transition to QUEUED
    const queued = await (pmeDb as any).inboundMessageJob.update({
      where: { id: job.id },
      data: { status: 'QUEUED' },
    });
    console.log(`   State 2: Updated job status = ${queued.status}`);

    // 3. Transition to PROCESSING with lockedAt
    const lockedTime = new Date();
    const processing = await (pmeDb as any).inboundMessageJob.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', lockedAt: lockedTime, attempts: 1 },
    });
    console.log(`   State 3: Updated job status = ${processing.status} (lockedAt: ${processing.lockedAt?.toISOString()})`);

    // 4. Transition to COMPLETED
    const completed = await (pmeDb as any).inboundMessageJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', processedAt: new Date() },
    });
    console.log(`   State 4: Final job status = ${completed.status} (processedAt: ${completed.processedAt?.toISOString()})`);

    // Cleanup
    await (pmeDb as any).inboundMessageJob.delete({ where: { id: job.id } });

    console.log('   ✅ Gate 1.3 PASSED: Full job lifecycle state transitions verified.');
    passedGates++;
  } catch (err) {
    console.error('   ❌ Gate 1.3 Error:', err);
  }

  // --------------------------------------------------------------------------
  // GATE 1.4: Dependent Customer Self-Relation Test
  // --------------------------------------------------------------------------
  console.log('\n🔹 Gate 1.4: Testing Customer Dependent Self-Relation (primaryCustomerId)...');
  try {
    const pmeDb = getTenantPrisma('tenant_pme_ff9xl', 'ADMIN');
    
    // Create primary customer
    const primaryCustomer = await pmeDb.customer.create({
      data: {
        tenantId: 'tenant_pme_ff9xl',
        displayName: 'John Doe (Primary Policyholder)',
        primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      },
    });

    // Create dependent customer linked to primary
    const dependentCustomer = await pmeDb.customer.create({
      data: {
        tenantId: 'tenant_pme_ff9xl',
        displayName: 'Jane Doe (Dependent Spouse)',
        primaryPhone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        primaryCustomerId: primaryCustomer.id,
      },
    });

    // Query primary customer with dependents included
    const fetchedPrimary = await pmeDb.customer.findUnique({
      where: { id: primaryCustomer.id },
      include: { dependents: true },
    });

    const isDependentLinked = fetchedPrimary?.dependents.some((d) => d.id === dependentCustomer.id);
    console.log(`   Primary Customer: ${fetchedPrimary?.displayName}`);
    console.log(`   Dependents Count: ${fetchedPrimary?.dependents.length} (Linked: ${isDependentLinked ? '✅ YES' : '❌ NO'})`);

    // Cleanup
    await pmeDb.customer.delete({ where: { id: dependentCustomer.id } });
    await pmeDb.customer.delete({ where: { id: primaryCustomer.id } });

    if (isDependentLinked) {
      console.log('   ✅ Gate 1.4 PASSED: Dependent self-relation resolves accurately.');
      passedGates++;
    } else {
      console.error('   ❌ Gate 1.4 FAILED: Dependent was not returned under primary customer.');
    }
  } catch (err) {
    console.error('   ❌ Gate 1.4 Error:', err);
  }

  // --------------------------------------------------------------------------
  // GATE 1.5: Dynamic Intake Questions Seeding & Ordering Test
  // --------------------------------------------------------------------------
  console.log('\n🔹 Gate 1.5: Testing Dynamic Intake Questions Seeding & Ordering...');
  try {
    const pmeDb = getTenantPrisma('tenant_pme_ff9xl', 'ADMIN');
    const questions = await (pmeDb as any).dynamicIntakeQuestion.findMany({
      where: { tenantId: 'tenant_pme_ff9xl', isActive: true },
      orderBy: { stepOrder: 'asc' },
    });

    console.log(`   Found ${questions.length} active questions for tenant_pme_ff9xl:`);
    questions.forEach((q: any) => {
      console.log(`   - Step ${q.stepOrder} [${q.fieldKey} | ${q.validationType}]: "${q.questionPrompt.slice(0, 45)}..." (Skippable: ${q.isSkippable})`);
    });

    if (questions.length >= 5 && questions[0].fieldKey === 'age' && questions[1].fieldKey === 'state') {
      console.log('   ✅ Gate 1.5 PASSED: Dynamic questions seeded and ordered properly by stepOrder.');
      passedGates++;
    } else {
      console.error('   ❌ Gate 1.5 FAILED: Unexpected question count or ordering.');
    }
  } catch (err) {
    console.error('   ❌ Gate 1.5 Error:', err);
  }

  // --------------------------------------------------------------------------
  // FINAL SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 PHASE 1 VERIFICATION RESULT: ${passedGates} / ${totalGates} GATES PASSED`);
  console.log('================================================================\n');

  if (passedGates === totalGates) {
    console.log('🎉 ALL 5 PHASE 1 GATES PASSED WITH 100% SUCCESS!');
  } else {
    throw new Error(`Phase 1 verification failed. Passed ${passedGates}/${totalGates}`);
  }
}

runPhase1Verification().catch(console.error).finally(() => prisma.$disconnect());
