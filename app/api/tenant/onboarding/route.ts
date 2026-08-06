import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const context = await getTenantContext();
    const { tenantId, role } = context;

    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No active tenant context.' }, { status: 401 });
    }

    const db = getTenantPrisma(tenantId, role);

    // 1. Get or create the TenantOnboardingProgress row
    let progress = await db.tenantOnboardingProgress.findUnique({
      where: { tenantId }
    });

    if (!progress) {
      progress = await db.tenantOnboardingProgress.create({
        data: { tenantId }
      });
    }

    // 2. Perform dynamic database checks concurrently
    const [whatsapp, botConfig, policy, userCount, message] = await Promise.all([
      db.whatsAppNumber.findFirst({
        where: { tenantId, status: 'CONNECTED' }
      }),
      db.botConfig.findUnique({
        where: { tenantId }
      }),
      db.policyCatalogItem.findFirst(),
      db.user.count(),
      db.message.findFirst(),
    ]);

    const whatsappConnected = !!whatsapp;
    const botNameSet = !!(botConfig && botConfig.name.trim() && botConfig.greetingMessage.trim());
    const productAdded = !!policy;
    const agentInvited = userCount > 1;
    const testMessageSent = !!message;

    // 3. Compile onboarding status object
    const status = {
      accountCreated: true, // Always true
      whatsappConnected,
      botNameSet,
      intakeFlowBuilt: progress.intakeFlowBuilt, // Stored boolean
      productAdded,
      agentInvited,
      testMessageSent,
      goneLive: progress.goneLive, // Stored boolean
    };

    // 4. Calculate total steps complete
    const stepsComplete = Object.values(status).filter(Boolean).length;
    const progressPercent = Math.round((stepsComplete / 8) * 100);

    return NextResponse.json({
      success: true,
      status,
      stepsComplete,
      progressPercent
    });
  } catch (err: unknown) {
    console.error('Error fetching onboarding progress:', err);
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getTenantContext();
    const { tenantId, role } = context;

    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No active tenant context.' }, { status: 401 });
    }

    const body = await req.json();
    const { step, completed } = body; // e.g. { step: 'intakeFlowBuilt', completed: true }

    if (!['intakeFlowBuilt', 'goneLive'].includes(step)) {
      return NextResponse.json({ error: 'Invalid step name for manual override.' }, { status: 400 });
    }

    const db = getTenantPrisma(tenantId, role);

    let progress = await db.tenantOnboardingProgress.findUnique({
      where: { tenantId },
    });

    if (progress) {
      progress = await db.tenantOnboardingProgress.update({
        where: { tenantId },
        data: { [step]: !!completed },
      });
    } else {
      progress = await db.tenantOnboardingProgress.create({
        data: {
          tenantId,
          [step]: !!completed,
        },
      });
    }

    return NextResponse.json({ success: true, progress });
  } catch (err: unknown) {
    console.error('Error updating onboarding progress:', err);
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
