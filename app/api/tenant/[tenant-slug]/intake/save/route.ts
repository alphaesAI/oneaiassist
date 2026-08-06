import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { 'tenant-slug': string } }
) {
  try {
    const slug = params['tenant-slug'];
    const { customerId, answers, consent } = await req.json();

    if (!customerId || !answers) {
      return NextResponse.json({ error: 'customerId and answers are required' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Retrieve client IP address
    const xForwardedFor = req.headers.get('x-forwarded-for');
    const ip = xForwardedFor ? xForwardedFor.split(',')[0].trim() : '127.0.0.1';

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', $2, true);`,
        tenant.id,
        'PLATFORM_OWNER'
      );

      // 1. Fetch Customer
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer || customer.tenantId !== tenant.id) {
        return { error: 'Customer not found' };
      }

      // 2. Prepare customer consent updates
      const customerData: any = {};
      if (consent) {
        customerData.optedIn = true;
        customerData.optedInAt = new Date();
        customerData.consentIp = ip;
        customerData.consentTimestamp = new Date();
      }

      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: customerData,
      });

      // 3. Find or Create Lead
      let lead = await tx.lead.findFirst({
        where: {
          tenantId: tenant.id,
          customerId,
        },
      });

      // Extract specific fields from answers JSON mapping
      let intakeAge: number | undefined = undefined;
      let intakeState: string | undefined = undefined;
      let intakeBudgetMin: number | undefined = undefined;
      let intakeBudgetMax: number | undefined = undefined;
      let intakeFamilySize: number | undefined = undefined;
      const intakeHealthConditions: string[] = [];

      // Flexible extraction by scanning answers object values or keys
      for (const [key, value] of Object.entries(answers)) {
        const valStr = String(value).toLowerCase();
        const keyStr = key.toLowerCase();

        // Match state
        if (keyStr.includes('state') || valStr === 'ca' || valStr === 'ny' || valStr === 'tx') {
          intakeState = String(value).toUpperCase();
        }
        // Match age
        if (keyStr.includes('age') || keyStr.includes('how old') || (typeof value === 'number' && keyStr.includes('q'))) {
          const num = parseInt(valStr);
          if (!isNaN(num) && num > 0 && num < 120) {
            intakeAge = num;
          }
        }
        // Match budget
        if (keyStr.includes('budget') || keyStr.includes('monthly') || keyStr.includes('slider')) {
          const num = parseInt(valStr);
          if (!isNaN(num) && num > 0) {
            intakeBudgetMax = num;
            intakeBudgetMin = Math.round(num * 0.75); // rough min bounds stub
          }
        }
        // Match family size
        if (keyStr.includes('family') || keyStr.includes('size') || keyStr.includes('people')) {
          const num = parseInt(valStr);
          if (!isNaN(num) && num > 0) {
            intakeFamilySize = num;
          }
        }
        // Match health conditions
        if (keyStr.includes('condition') || keyStr.includes('health') || keyStr.includes('illness')) {
          if (Array.isArray(value)) {
            intakeHealthConditions.push(...value.map(String));
          } else {
            intakeHealthConditions.push(String(value));
          }
        }
      }

      const leadData: any = {
        intakeAnswers: answers,
        status: 'NEW',
      };

      if (intakeAge !== undefined) leadData.intakeAge = intakeAge;
      if (intakeState !== undefined) leadData.intakeState = intakeState;
      if (intakeBudgetMin !== undefined) leadData.intakeBudgetMin = intakeBudgetMin;
      if (intakeBudgetMax !== undefined) leadData.intakeBudgetMax = intakeBudgetMax;
      if (intakeFamilySize !== undefined) leadData.intakeFamilySize = intakeFamilySize;
      if (intakeHealthConditions.length > 0) leadData.intakeHealthConditions = intakeHealthConditions;

      if (lead) {
        lead = await tx.lead.update({
          where: { id: lead.id },
          data: leadData,
        });
      } else {
        lead = await tx.lead.create({
          data: {
            tenantId: tenant.id,
            customerId,
            source: 'WIZARD',
            ...leadData,
          },
        });
      }

      return {
        success: true,
        customerId: updatedCustomer.id,
        leadId: lead.id,
      };
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[Intake Save Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
