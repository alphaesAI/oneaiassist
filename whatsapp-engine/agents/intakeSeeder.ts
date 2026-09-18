import { prisma } from '../../lib/db';
import { ValidationType } from '@prisma/client';

export interface DefaultQuestionSeed {
  stepOrder: number;
  fieldKey: string;
  questionText: string;
  helpText?: string;
  validationType: ValidationType;
  isRequired: boolean;
  options?: string[];
}

export const DEFAULT_INTAKE_QUESTIONS: DefaultQuestionSeed[] = [
  {
    stepOrder: 1,
    fieldKey: 'age',
    questionText: 'What is your current age? (e.g., 34)',
    helpText: 'Age is used to determine eligible insurance brackets and rate tables.',
    validationType: ValidationType.NUMBER,
    isRequired: true,
  },
  {
    stepOrder: 2,
    fieldKey: 'state',
    questionText: 'Which US State do you currently reside in? (e.g., TX, CA, NY)',
    helpText: 'Health insurance plans and carrier networks are state-regulated.',
    validationType: ValidationType.US_STATE,
    isRequired: true,
  },
  {
    stepOrder: 3,
    fieldKey: 'family_size',
    questionText: 'How many family members (including yourself) need coverage? (e.g., 1 for Individual, 4 for Family)',
    helpText: 'Used to calculate total member premium and deductible thresholds.',
    validationType: ValidationType.NUMBER,
    isRequired: true,
  },
  {
    stepOrder: 4,
    fieldKey: 'budget',
    questionText: 'What is your approximate monthly budget for health insurance? (e.g., $150 or 250)',
    helpText: 'Helps us match you with plans in your comfortable price range.',
    validationType: ValidationType.CURRENCY,
    isRequired: true,
  },
  {
    stepOrder: 5,
    fieldKey: 'conditions',
    questionText: 'Do you or any family members have pre-existing health conditions or regular prescriptions? (e.g., None, Diabetes, Asthma)',
    helpText: 'Helps us check formulary drug coverage and specialist network requirements.',
    validationType: ValidationType.TEXT,
    isRequired: false,
  },
];

/**
 * Seeds the standard 5-step dynamic intake question suite for a given tenant if not already present.
 */
export async function seedTenantDynamicIntakeQuestions(tenantId: string): Promise<number> {
  let createdCount = 0;
  for (const q of DEFAULT_INTAKE_QUESTIONS) {
    const existing = await prisma.dynamicIntakeQuestion.findUnique({
      where: {
        tenantId_fieldKey: {
          tenantId,
          fieldKey: q.fieldKey,
        },
      },
    });

    if (!existing) {
      await prisma.dynamicIntakeQuestion.create({
        data: {
          tenantId,
          stepOrder: q.stepOrder,
          fieldKey: q.fieldKey,
          questionPrompt: q.questionText,
          validationType: q.validationType,
          isMandatory: q.isRequired,
          options: q.options || [],
          isActive: true,
        },
      });
      createdCount++;
    }
  }
  return createdCount;
}
