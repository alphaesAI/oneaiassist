import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ 'tenant-slug': string }> }
) {
  try {
    const { 'tenant-slug': slug } = await params;
    const cookieStore = await cookies();
    const customerId = cookieStore.get('customer_auth_token')?.value;

    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const db = getTenantPrisma(tenant.id, 'ADMIN');

    const customer = await db.customer.findFirst({
      where: { id: customerId, tenantId: tenant.id },
      select: {
        id: true,
        displayName: true,
        primaryPhone: true,
        email: true,
        optedIn: true,
        optedInAt: true,
        consentTimestamp: true,
        createdAt: true,
        policies: {
          select: {
            id: true,
            policyNumber: true,
            status: true,
            effectiveDate: true,
            expiryDate: true,
            policyCatalog: {
              select: {
                name: true,
                insurerName: true,
                sumInsured: true,
              },
            },
          },
        },
        leads: {
          select: {
            id: true,
            status: true,
            source: true,
            createdAt: true,
          },
        },
        conversations: {
          select: {
            id: true,
            status: true,
            channel: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer record not found' }, { status: 404 });
    }

    const exportData = {
      exportTimestamp: new Date().toISOString(),
      tenant: tenant.name,
      customerProfile: {
        id: customer.id,
        displayName: customer.displayName,
        primaryPhone: customer.primaryPhone,
        email: customer.email,
        optedIn: customer.optedIn,
        optedInAt: customer.optedInAt,
        consentTimestamp: customer.consentTimestamp,
        createdAt: customer.createdAt,
      },
      policies: customer.policies,
      leads: customer.leads,
      conversations: customer.conversations,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="customer_data_${customer.id}.json"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
