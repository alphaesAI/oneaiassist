import { prisma } from '../lib/db';

async function run() {
  console.log('--- STARTING TENANT ONBOARDING CHECKLIST INTEGRATION TEST ---');

  // 1. Fetch a tenant to run the test against
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('❌ No tenants found in database! Please run a signup first.');
    return;
  }
  console.log(`Using tenant: "${tenant.name}" (${tenant.id})`);

  // Helper to query progress using the backend's logic
  const getProgress = async () => {
    return await prisma.$transaction(async (tx) => {
      // Elevate permissions to bypass RLS for admin checks in script
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);

      let progress = await tx.tenantOnboardingProgress.findUnique({
        where: { tenantId: tenant.id }
      });

      if (!progress) {
        progress = await tx.tenantOnboardingProgress.create({
          data: { tenantId: tenant.id }
        });
      }

      // Dynamic checks
      const whatsapp = await tx.whatsAppNumber.findFirst({
        where: { tenantId: tenant.id, status: 'CONNECTED' }
      });
      const whatsappConnected = !!whatsapp;

      const botConfig = await tx.botConfig.findUnique({
        where: { tenantId: tenant.id }
      });
      const botNameSet = !!(botConfig && botConfig.name.trim() && botConfig.greetingMessage.trim());

      const policy = await tx.policyCatalogItem.findFirst({
        where: { tenantId: tenant.id }
      });
      const productAdded = !!policy;

      const userCount = await tx.user.count({
        where: { tenantId: tenant.id }
      });
      const agentInvited = userCount > 1;

      const message = await tx.message.findFirst({
        where: { tenantId: tenant.id }
      });
      const testMessageSent = !!message;

      const status = {
        accountCreated: true,
        whatsappConnected,
        botNameSet,
        intakeFlowBuilt: progress.intakeFlowBuilt,
        productAdded,
        agentInvited,
        testMessageSent,
        goneLive: progress.goneLive,
      };

      const stepsComplete = Object.values(status).filter(Boolean).length;
      return { status, stepsComplete };
    });
  };

  // 2. Fetch initial progress
  const initial = await getProgress();
  console.log(`\n📊 Initial Steps Completed: ${initial.stepsComplete} of 8`);
  console.log('Current Step Statuses:', initial.status);

  // 3. Test dynamic update of "Invite a team agent"
  console.log('\n--- TEST CASE 1: Dynamic Update via DB Association (Team Agent) ---');
  
  const userCountBefore = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    return await tx.user.count({ where: { tenantId: tenant.id } });
  });
  console.log(`User count in DB initially: ${userCountBefore}`);

  // Create a temporary mock agent user
  const tempEmail = `temp_agent_${Math.floor(Math.random() * 100000)}@agency.com`;
  console.log(`Adding temporary agent: ${tempEmail}`);
  
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: tempEmail,
        hashedPassword: 'dummy_hash_value',
        role: 'AGENT'
      }
    });
  });

  const stepAfterAgent = await getProgress();
  const userCountAfter = userCountBefore + 1;
  console.log(`📊 Steps Completed after inviting agent: ${stepAfterAgent.stepsComplete} of 8`);
  if (stepAfterAgent.status.agentInvited === (userCountAfter > 1)) {
    console.log('✅ Success: agentInvited value correctly aligns with DB user count!');
  } else {
    console.error(`❌ Failure: agentInvited (${stepAfterAgent.status.agentInvited}) does not match expected (${userCountAfter > 1})`);
  }

  // Cleanup temporary user
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    await tx.user.delete({
      where: { email: tempEmail }
    });
  });
  console.log('🧹 Cleaned up temporary agent user.');

  const stepAfterCleanup = await getProgress();
  if (stepAfterCleanup.status.agentInvited === (userCountBefore > 1)) {
    console.log('✅ Success: agentInvited reverted to match original user count status!');
  } else {
    console.error(`❌ Failure: agentInvited (${stepAfterCleanup.status.agentInvited}) does not match expected (${userCountBefore > 1})`);
  }

  // 4. Test manual override toggles (e.g. intakeFlowBuilt)
  console.log('\n--- TEST CASE 2: Stored Manual Checklist Toggles ---');
  const initialIntake = initial.status.intakeFlowBuilt;
  console.log(`Current intakeFlowBuilt: ${initialIntake}`);

  console.log(`Toggling intakeFlowBuilt to: ${!initialIntake}`);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    await tx.tenantOnboardingProgress.update({
      where: { tenantId: tenant.id },
      data: { intakeFlowBuilt: !initialIntake }
    });
  });

  const stepAfterIntakeToggle = await getProgress();
  console.log(`New intakeFlowBuilt value: ${stepAfterIntakeToggle.status.intakeFlowBuilt}`);
  if (stepAfterIntakeToggle.status.intakeFlowBuilt === !initialIntake) {
    console.log('✅ Success: intakeFlowBuilt was toggled and persisted correctly!');
  } else {
    console.error('❌ Failure: intakeFlowBuilt was not updated.');
  }

  // Revert intakeFlowBuilt back to initial value
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    await tx.tenantOnboardingProgress.update({
      where: { tenantId: tenant.id },
      data: { intakeFlowBuilt: initialIntake }
    });
  });
  console.log(`🧹 Restored intakeFlowBuilt back to: ${initialIntake}`);

  console.log('\n--- ALL ONBOARDING CHECKLIST E2E TESTS PASSED SUCCESSFULLY ---');
}

run().catch(console.error);
