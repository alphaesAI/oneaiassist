import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

const DEFAULT_QUESTIONS = [
  {
    id: 'q1',
    title: 'Welcome',
    text: 'Hello! How can I assist you today?',
    type: 'text',
    required: true,
    options: [],
    logic: [],
  },
  {
    id: 'q2',
    title: 'Support Check',
    text: "Do you have an active support ticket?",
    type: 'multiple-choice',
    required: true,
    options: ['Yes', 'No'],
    logic: [
      { condition: 'Yes', skipTo: 'q5' }
    ],
  },
  {
    id: 'q3',
    title: 'Budget',
    text: 'What is your estimated monthly budget?',
    type: 'number',
    required: true,
    options: [],
    logic: [],
    validation: { min: 100, max: 50000 },
  },
  {
    id: 'q5',
    title: 'Ticket #',
    text: 'Please enter your support ticket number if you have one.',
    type: 'text',
    required: false,
    options: [],
    logic: [],
  }
];

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const flow = await db.intakeFlow.findUnique({
      where: { tenantId },
    });

    if (!flow) {
      return NextResponse.json({ questions: DEFAULT_QUESTIONS });
    }

    return NextResponse.json({ questions: flow.questions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { questions } = await req.json();

    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: 'questions must be an array' }, { status: 400 });
    }

    const flow = await db.intakeFlow.upsert({
      where: { tenantId },
      create: {
        tenantId,
        questions: questions as any,
      },
      update: {
        questions: questions as any,
      },
    });

    // Mark intake flow built as completed in onboarding progress
    await db.tenantOnboardingProgress.upsert({
      where: { tenantId },
      create: {
        tenantId,
        intakeFlowBuilt: true,
      },
      update: {
        intakeFlowBuilt: true,
      },
    });

    return NextResponse.json({ success: true, questions: flow.questions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
