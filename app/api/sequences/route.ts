import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { validateJourneySteps } from '@/lib/email/journeyValidation';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const journeys = await db.crossChannelJourney.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // Counts come from real enrollment rows, never from stored or sample numbers.
    const enrollmentCounts = journeys.length
      ? await db.journeyEnrollment.groupBy({
          by: ['journeyId', 'status'],
          where: { tenantId, journeyId: { in: journeys.map((j) => j.id) } },
          _count: { _all: true },
        })
      : [];
    const countsByJourney = new Map<string, { enrolled: number; completed: number; failed: number }>();
    for (const row of enrollmentCounts) {
      const c = countsByJourney.get(row.journeyId) || { enrolled: 0, completed: 0, failed: 0 };
      c.enrolled += row._count._all;
      if (row.status === 'COMPLETED') c.completed += row._count._all;
      if (row.status === 'FAILED') c.failed += row._count._all;
      countsByJourney.set(row.journeyId, c);
    }

    const mapped = journeys.map((j) => {
      const stepsArr = (j.steps as any[]) || [];
      return {
        id: j.id,
        name: j.name,
        description: j.description || '',
        trigger: j.triggerType.replace(/_/g, ' '),
        triggerType: j.triggerType,
        status: j.status,
        stepsCount: stepsArr.length,
        enrolledCount: countsByJourney.get(j.id)?.enrolled ?? 0,
        completedCount: countsByJourney.get(j.id)?.completed ?? 0,
        failedCount: countsByJourney.get(j.id)?.failed ?? 0,
        triggerConfig: j.triggerConfig ?? null,
        frequencyCapDays: j.frequencyCapDays,
        quietHoursStart: j.quietHoursStart,
        quietHoursEnd: j.quietHoursEnd,
        createdAt: j.createdAt.toISOString(),
        steps: stepsArr,
      };
    });

    return NextResponse.json({ success: true, sequences: mapped });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch sequences';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const body = await req.json();
    const {
      name,
      description,
      trigger = 'CONTACT_CREATED',
      triggerConfig,
      steps = [],
      frequencyCapDays = 1,
      quietHoursStart = '21:00',
      quietHoursEnd = '08:00',
      activate = true,
    } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Sequence name is required' }, { status: 400 });
    }

    // Steps are exactly what the user built. Nothing is filled in with sample steps or template names.
    const problems = await validateJourneySteps(tenantId, steps);
    if (problems.length > 0) {
      return NextResponse.json({ error: problems.join(' '), problems }, { status: 400 });
    }

    const cleanConfig: Record<string, string> = {};
    if (triggerConfig && typeof triggerConfig === 'object') {
      for (const key of ['tag', 'listId', 'formId', 'campaignId']) {
        const value = (triggerConfig as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) cleanConfig[key] = value.trim();
      }
    }
    if (cleanConfig.listId) {
      const list = await db.contactList.findFirst({ where: { id: cleanConfig.listId, tenantId }, select: { id: true } });
      if (!list) return NextResponse.json({ error: 'The chosen contact list does not exist.' }, { status: 400 });
    }

    const journey = await db.crossChannelJourney.create({
      data: {
        tenantId,
        name: String(name).trim(),
        description: description || '',
        triggerType: trigger as any,
        triggerConfig: Object.keys(cleanConfig).length > 0 ? cleanConfig : undefined,
        steps,
        frequencyCapDays: Number.isFinite(Number(frequencyCapDays)) ? Math.max(0, Number(frequencyCapDays)) : 1,
        quietHoursStart: quietHoursStart || null,
        quietHoursEnd: quietHoursEnd || null,
        status: activate ? 'ACTIVE' : 'DRAFT',
      },
    });

    return NextResponse.json({ success: true, sequence: journey });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create sequence';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const body = await req.json();
    const { id, status, frequencyCapDays, quietHoursStart, quietHoursEnd } = body;

    if (!id) {
      return NextResponse.json({ error: 'Sequence ID is required' }, { status: 400 });
    }

    const current = await db.crossChannelJourney.findFirst({ where: { id, tenantId } });
    if (!current) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // A journey can only be switched on if every step can really run.
    if (status === 'ACTIVE' && current.status !== 'ACTIVE') {
      const problems = await validateJourneySteps(tenantId, current.steps);
      if (problems.length > 0) {
        return NextResponse.json(
          { error: `This journey cannot be activated yet. ${problems.join(' ')}`, problems },
          { status: 400 }
        );
      }
    }

    const updated = await db.crossChannelJourney.update({
      where: { id, tenantId },
      data: {
        status: status || undefined,
        frequencyCapDays: frequencyCapDays !== undefined ? Number(frequencyCapDays) : undefined,
        quietHoursStart: quietHoursStart !== undefined ? quietHoursStart : undefined,
        quietHoursEnd: quietHoursEnd !== undefined ? quietHoursEnd : undefined,
      },
    });

    return NextResponse.json({ success: true, sequence: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update sequence';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
