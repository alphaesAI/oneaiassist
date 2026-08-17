import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { sessionId, leadId, intake } = await req.json();

    if (!sessionId || !leadId || !intake) {
      return NextResponse.json({ error: 'sessionId, leadId, and intake are required' }, { status: 400 });
    }

    // 1. Resolve session to get tenant boundary context using platform owner bypass
    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Intake session not found' }, { status: 404 });
    }

    const tenantId = session.tenantId;

    const result = await prisma.$transaction(async (tx) => {
      // Set session configs inside transaction context explicitly
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_user_role', $2, false);`,
        tenantId,
        'PLATFORM_OWNER'
      );

      // 2. Verify entity tenant mapping
      const s = await tx.intakeSession.findUnique({
        where: { id: sessionId },
      });
      if (!s || s.tenantId !== tenantId) {
        return { error: 'Session tenant mismatch' };
      }
      if (s.status === 'COMPLETED') {
        return { error: 'Session already completed', status: 400 };
      }

      const lead = await tx.lead.findUnique({
        where: { id: leadId },
      });
      if (!lead || lead.tenantId !== tenantId) {
        return { error: 'Lead tenant mismatch' };
      }

      const customer = await tx.customer.findUnique({
        where: { id: lead.customerId },
      });
      if (!customer || customer.tenantId !== tenantId) {
        return { error: 'Customer tenant mismatch' };
      }

      // 3. Manual parameter type/range validations
      if (intake.age !== undefined && (typeof intake.age !== 'number' || intake.age <= 0 || intake.age > 120)) {
        return { error: 'Invalid age' };
      }
      if (intake.state !== undefined && (typeof intake.state !== 'string' || intake.state.trim().length !== 2)) {
        return { error: 'Invalid state' };
      }
      if (intake.familySize !== undefined && (typeof intake.familySize !== 'number' || intake.familySize <= 0)) {
        return { error: 'Invalid family size' };
      }
      if (intake.budgetMin !== undefined && (typeof intake.budgetMin !== 'number' || intake.budgetMin < 0)) {
        return { error: 'Invalid budgetMin' };
      }
      if (intake.budgetMax !== undefined && (typeof intake.budgetMax !== 'number' || intake.budgetMax <= 0)) {
        return { error: 'Invalid budgetMax' };
      }

      // Merge and save final collected fields
      const currentFields = (s.collectedFields as any) || {};
      const mergedFields = { ...currentFields, ...intake };

      await tx.intakeSession.update({
        where: { id: sessionId },
        data: {
          collectedFields: mergedFields,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Transition Lead status & fields
      const parsedState = mergedFields.state?.toUpperCase() || null;
      await tx.lead.update({
        where: { id: leadId },
        data: {
          intakeAge: mergedFields.age,
          intakeState: parsedState,
          intakeHealthConditions: mergedFields.healthConditions,
          intakeBudgetMin: mergedFields.budgetMin ? mergedFields.budgetMin * 100 : null,
          intakeBudgetMax: mergedFields.budgetMax ? mergedFields.budgetMax * 100 : null,
          intakeFamilySize: mergedFields.familySize,
          status: 'QUALIFIED',
        },
      });

      // 4. Match eligibility policies
      let matchingPolicies: any[] = [];
      if (parsedState) {
        const budgetMinCents = mergedFields.budgetMin ? mergedFields.budgetMin * 100 : 0;
        const budgetMaxCents = mergedFields.budgetMax ? mergedFields.budgetMax * 100 : 99999999;

        matchingPolicies = await tx.policyCatalogItem.findMany({
          where: {
            active: true,
            states: {
              has: parsedState,
            },
            premiumMin: {
              lte: budgetMaxCents,
            },
            premiumMax: {
              gte: budgetMinCents,
            },
          },
          take: 4,
        });

        const recIds = matchingPolicies.map((p) => p.id);
        await tx.lead.update({
          where: { id: leadId },
          data: { recommendedPolicyIds: recIds },
        });
      }

      // 5. Save System Audit Log
      const tenantUser = await tx.user.findFirst({
        where: { tenantId },
      });
      const logUserId = tenantUser?.id || 'system';

      if (logUserId && logUserId !== 'system') {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: logUserId,
            action: 'INTAKE_COMPLETE',
            metadata: { leadId, sessionId, matchedCount: matchingPolicies.length },
          },
        });
      }

      return {
        success: true,
        matchedCount: matchingPolicies.length,
        matchingPolicies,
      };
    }, { timeout: 20000 });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Trigger Socket.io real-time broadcast on port 3001
    try {
      await fetch('http://localhost:3001/api/whatsapp/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          event: 'lead_status_updated',
          data: {
            leadId,
            status: 'QUALIFIED',
          },
        }),
      });
      console.log(`[Handoff API] Broadcasted lead_status_updated for lead ${leadId}`);
    } catch (socketErr) {
      console.warn('[Handoff API] Failed to broadcast real-time status update:', socketErr);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[Bot Intake Complete Hook Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
