import 'dotenv/config';
import { getTenantPrisma, prisma } from '../lib/db';

async function run() {
  console.log('=== Running Gate 4.1: Dynamic Intake Question CRUD & Reorder Test ===');

  const testTenantId = 'tenant_pme_ff9xl';
  const db = getTenantPrisma(testTenantId, 'ADMIN');

  // Clean up any test questions
  await db.dynamicIntakeQuestion.deleteMany({
    where: {
      tenantId: testTenantId,
      fieldKey: { in: ['test_crud_field_1', 'test_crud_field_2'] },
    },
  });

  // 1. Create Question
  console.log('\n--- Step 1: Create Dynamic Question ---');
  const q1 = await db.dynamicIntakeQuestion.create({
    data: {
      tenantId: testTenantId,
      stepOrder: 98,
      fieldKey: 'test_crud_field_1',
      questionPrompt: 'Do you have prior continuous coverage in the last 12 months?',
      validationType: 'ENUM',
      options: ['Yes', 'No'],
      isMandatory: true,
      isActive: true,
    },
  });

  console.log('Created Question:', { id: q1.id, fieldKey: q1.fieldKey, stepOrder: q1.stepOrder });
  if (q1.fieldKey !== 'test_crud_field_1' || q1.validationType !== 'ENUM') {
    throw new Error('Step 1 failed: Question creation mismatch');
  }

  // 2. Update Question
  console.log('\n--- Step 2: Update Question Prompt & Type ---');
  const updated = await db.dynamicIntakeQuestion.update({
    where: { id: q1.id },
    data: {
      questionPrompt: 'Updated: Do you have prior continuous healthcare coverage?',
      isSkippable: true,
    },
  });

  console.log('Updated Question:', { id: updated.id, prompt: updated.questionPrompt, isSkippable: updated.isSkippable });
  if (!updated.questionPrompt.startsWith('Updated:') || !updated.isSkippable) {
    throw new Error('Step 2 failed: Question update mismatch');
  }

  // 3. Reorder Step
  console.log('\n--- Step 3: Reorder Step Order ---');
  const reordered = await db.dynamicIntakeQuestion.update({
    where: { id: q1.id },
    data: { stepOrder: 99 },
  });

  console.log('Reordered Step:', { id: reordered.id, stepOrder: reordered.stepOrder });
  if (reordered.stepOrder !== 99) {
    throw new Error('Step 3 failed: Reorder mismatch');
  }

  // 4. Delete Question
  console.log('\n--- Step 4: Delete Question ---');
  await db.dynamicIntakeQuestion.delete({
    where: { id: q1.id },
  });

  const checkDeleted = await db.dynamicIntakeQuestion.findUnique({
    where: { id: q1.id },
  });

  if (checkDeleted) {
    throw new Error('Step 4 failed: Question was not deleted');
  }

  console.log('\n✅ Gate 4.1: Dynamic Intake Question CRUD & Reorder Passed Perfectly!');
}

run().catch((err) => {
  console.error('❌ Gate 4.1 Failed:', err);
  process.exit(1);
});
