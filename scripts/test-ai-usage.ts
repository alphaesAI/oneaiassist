import { prisma } from '../lib/db';
import { getTenantAIClient, getEmbeddingClient, checkRateLimit } from '../lib/ai/client';

async function run() {
  console.log('--- STARTING AI USAGE & RATE LIMIT E2E TEST ---');

  // 1. Fetch a tenant to run the test against
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('❌ No tenants found in database! Please run a signup first.');
    return;
  }
  console.log(`Using tenant: "${tenant.name}" (${tenant.id}) with plan: ${tenant.subscriptionPlan}`);

  // 2. Clear any previous token logs for this tenant today to start fresh
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    await tx.tokenUsageLog.deleteMany({
      where: {
        tenantId: tenant.id,
        timestamp: { gte: startOfDay }
      }
    });
  });
  console.log('🧹 Cleared today\'s token logs for a clean test run.');

  // 3. Set a tight plan rate limit in the DB to test the hard stop
  // We'll set the FREE rate limit to 10 tokens
  await prisma.planRateLimit.upsert({
    where: { plan: tenant.subscriptionPlan },
    update: { maxTokens: 10, hardStop: true },
    create: { plan: tenant.subscriptionPlan, maxTokens: 10, hardStop: true }
  });
  console.log(`⚙️ Temporarily updated ${tenant.subscriptionPlan} daily limit to 10 tokens.`);

  // 4. Initialize client and make a mock chat call
  console.log('\n--- TEST CASE 1: Normal Call (Under limit) ---');
  const aiClient = await getTenantAIClient(tenant.id);
  
  try {
    const reply = await aiClient.generateChat([
      { role: 'user', content: 'Hello there, how is my policy doing?' }
    ]);
    console.log('✅ Call succeeded! Reply:', reply);
  } catch (err: any) {
    console.error('❌ Test failed unexpectedly:', err);
  }

  // 5. Verify token usage log was written to database
  const logs = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    return tx.tokenUsageLog.findMany({
      where: {
        tenantId: tenant.id,
        timestamp: { gte: startOfDay }
      }
    });
  });

  console.log(`📊 Logs created: ${logs.length}`);
  logs.forEach((log, index) => {
    console.log(`  [Log ${index + 1}] Input: ${log.inputTokens}, Output: ${log.outputTokens}, Cost: $${log.cost.toFixed(6)}`);
  });

  if (logs.length > 0) {
    console.log('✅ Success: Token usage was correctly saved to the DB!');
  } else {
    console.error('❌ Failure: No token usage logs were written to the DB.');
  }

  // 6. Test rate limit enforcement (the limit is 50, and we just consumed ~30-40 tokens)
  // Let's call it again. It should exceed the 50 token limit and throw!
  console.log('\n--- TEST CASE 2: Exceeding Daily Limit (RateLimitExceeded) ---');
  try {
    console.log('Triggering second AI call...');
    await aiClient.generateChat([
      { role: 'user', content: 'Give me another message to exceed the 50 tokens limit.' }
    ]);
    console.log('❌ Failure: Call succeeded when it should have been blocked by the rate limit.');
  } catch (err: any) {
    if (err.message.includes('RateLimitExceeded')) {
      console.log('✅ Success: Rate limit check blocked the call as expected!');
      console.log('  Error message:', err.message);
    } else {
      console.error('❌ Failure: Threw unexpected error:', err.message);
    }
  }

  // 7. Seed dynamic historical data for past 10 days to populate charts and Top Tenants tables
  console.log('\n🌱 Seeding historical token usage records for past 10 days...');
  
  // Fetch another tenant if available to show multiple entries in the dashboard table
  const allTenants = await prisma.tenant.findMany();
  
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    
    // Clear all logs first to ensure clean chart visuals
    await tx.tokenUsageLog.deleteMany({});
    
    const logsToCreate: any[] = [];

    for (let day = 0; day < 10; day++) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      
      for (const t of allTenants) {
        // Different tenants get different usage volumes
        const multiplier = t.subscriptionPlan === 'ENTERPRISE' ? 1000 : t.subscriptionPlan === 'GROWTH' ? 100 : t.subscriptionPlan === 'STARTUP' ? 10 : 1;
        const baseInput = Math.floor(Math.random() * 50000) * multiplier + 500;
        const baseOutput = Math.floor(Math.random() * 80000) * multiplier + 1000;
        const cost = (baseInput * 10.0 + baseOutput * 30.0) / 1000000;

        logsToCreate.push({
          tenantId: t.id,
          inputTokens: baseInput,
          outputTokens: baseOutput,
          cost,
          timestamp: date
        });
      }
    }

    await tx.tokenUsageLog.createMany({
      data: logsToCreate
    });
  });
  console.log('✅ Historical records successfully seeded.');

  // 8. Cleanup/Reset rate limit to default 1M
  await prisma.planRateLimit.update({
    where: { plan: tenant.subscriptionPlan },
    data: { maxTokens: 1000000, hardStop: true }
  });
  console.log('\n🧹 Restored rate limit to default (1M tokens).');

  console.log('--- E2E TEST COMPLETED ---');
}

run().catch(console.error);
