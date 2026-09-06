import { NextRequest, NextResponse } from 'next/server';
import { getTenantPrisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/admin/intake-questions
 * Fetches all dynamic intake questions configured for the tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId || req.headers.get('x-tenant-id') || 'tenant_pme_ff9xl';

    const db = getTenantPrisma(tenantId, 'ADMIN');
    const questions = await db.dynamicIntakeQuestion.findMany({
      where: { tenantId },
      orderBy: { stepOrder: 'asc' },
    });

    return NextResponse.json({ success: true, questions });
  } catch (err: any) {
    console.error('[API Intake Questions GET] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/intake-questions
 * Creates a new dynamic intake question or bulk reorders existing questions.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId || req.headers.get('x-tenant-id') || 'tenant_pme_ff9xl';
    const body = await req.json();

    const db = getTenantPrisma(tenantId, 'ADMIN');

    // Bulk Reorder Operation
    if (Array.isArray(body.reorderList)) {
      const updates = body.reorderList.map((item: { id: string; stepOrder: number }) =>
        db.dynamicIntakeQuestion.update({
          where: { id: item.id },
          data: { stepOrder: item.stepOrder },
        })
      );
      await Promise.all(updates);
      const questions = await db.dynamicIntakeQuestion.findMany({
        where: { tenantId },
        orderBy: { stepOrder: 'asc' },
      });
      return NextResponse.json({ success: true, questions });
    }

    // Single Question Create Operation
    const { fieldKey, questionPrompt, validationType, options, isMandatory, isSkippable, stepOrder } = body;
    if (!fieldKey || !questionPrompt) {
      return NextResponse.json({ success: false, error: 'fieldKey and questionPrompt are required' }, { status: 400 });
    }

    const currentMax = await db.dynamicIntakeQuestion.aggregate({
      where: { tenantId },
      _max: { stepOrder: true },
    });
    const calculatedStepOrder = stepOrder || (currentMax._max.stepOrder || 0) + 1;

    const question = await db.dynamicIntakeQuestion.create({
      data: {
        tenantId,
        stepOrder: calculatedStepOrder,
        fieldKey: fieldKey.toLowerCase().trim(),
        questionPrompt,
        validationType: validationType || 'TEXT',
        options: options || null,
        isMandatory: isMandatory !== undefined ? isMandatory : true,
        isSkippable: !!isSkippable,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, question });
  } catch (err: any) {
    console.error('[API Intake Questions POST] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/intake-questions
 * Updates an existing dynamic intake question.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId || req.headers.get('x-tenant-id') || 'tenant_pme_ff9xl';
    const body = await req.json();
    const { id, fieldKey, questionPrompt, validationType, options, isMandatory, isSkippable, isActive, stepOrder } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Question ID is required' }, { status: 400 });
    }

    const db = getTenantPrisma(tenantId, 'ADMIN');
    const updated = await db.dynamicIntakeQuestion.update({
      where: { id },
      data: {
        fieldKey: fieldKey ? fieldKey.toLowerCase().trim() : undefined,
        questionPrompt,
        validationType,
        options: options !== undefined ? options : undefined,
        isMandatory,
        isSkippable,
        isActive,
        stepOrder,
      },
    });

    return NextResponse.json({ success: true, question: updated });
  } catch (err: any) {
    console.error('[API Intake Questions PUT] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/intake-questions
 * Deletes a dynamic intake question.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId || req.headers.get('x-tenant-id') || 'tenant_pme_ff9xl';
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Question ID is required' }, { status: 400 });
    }

    const db = getTenantPrisma(tenantId, 'ADMIN');
    await db.dynamicIntakeQuestion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[API Intake Questions DELETE] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
