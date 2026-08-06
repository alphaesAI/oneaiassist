import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ 'tenant-slug': string }> }
) {
  try {
    const { 'tenant-slug': slug } = await params;

    // Resolve tenant by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = tenant.id;
    const db = getTenantPrisma(tenantId, 'ADMIN');

    const body = await req.json();
    const {
      policyCatalogId,
      customerName,
      customerPhone,
      customerEmail,
      documentUrl,
    } = body;

    if (!policyCatalogId || !customerPhone || !customerName) {
      return NextResponse.json(
        { error: 'Missing required fields (policyCatalogId, customerName, customerPhone)' },
        { status: 400 }
      );
    }

    // 1. Fetch Policy Catalog Item
    const catalogItem = await db.policyCatalogItem.findUnique({
      where: { id: policyCatalogId },
    });

    if (!catalogItem) {
      return NextResponse.json({ error: 'Policy catalog item not found' }, { status: 404 });
    }

    // 2. Find or Create Customer
    let customer = await db.customer.findFirst({
      where: { tenantId, primaryPhone: customerPhone },
    });

    if (!customer) {
      customer = await db.customer.create({
        data: {
          tenantId,
          displayName: customerName,
          primaryPhone: customerPhone,
          email: customerEmail || null,
          optedIn: true,
          optedInAt: new Date(),
        },
      });
    }

    // 3. Find an Admin user ID for confirmedByUserId
    const adminUser = await db.user.findFirst({
      where: { tenantId },
      select: { id: true },
    });
    const confirmedByUserId = adminUser?.id || customer.id;

    // 4. Generate Policy Number (e.g. POL-XXXXXX)
    const policyNumber = `POL-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(now.getFullYear() + 1);

    // 5. Create Policy Record
    const policy = await db.policy.create({
      data: {
        tenantId,
        customerId: customer.id,
        policyCatalogId: catalogItem.id,
        policyNumber,
        status: 'ACTIVE',
        effectiveDate: now,
        expiryDate: expiryDate,
        confirmedByUserId,
      },
    });

    // 6. Update Customer activePolicyId
    await db.customer.update({
      where: { id: customer.id },
      data: { activePolicyId: policy.id },
    });

    // 7. Check and update existing Lead status to CONVERTED
    const lead = await db.lead.findFirst({
      where: { tenantId, customerId: customer.id },
    });
    if (lead) {
      await db.lead.update({
        where: { id: lead.id },
        data: { status: 'CONVERTED', selectedPolicyId: catalogItem.id },
      });
    } else {
      await db.lead.create({
        data: {
          tenantId,
          customerId: customer.id,
          source: 'DIRECT_CHECKOUT',
          status: 'CONVERTED',
          selectedPolicyId: catalogItem.id,
        },
      });
    }

    // 8. Write Audit Log
    await db.auditLog.create({
      data: {
        tenantId,
        userId: confirmedByUserId,
        action: 'POLICY_PURCHASED',
        metadata: {
          policyNumber,
          policyName: catalogItem.name,
          customerPhone,
          amountCents: catalogItem.premiumMin,
          documentUrl: documentUrl || null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      policyNumber,
      policyId: policy.id,
      policyName: catalogItem.name,
      amountPaid: (catalogItem.premiumMin / 100).toFixed(2),
      effectiveDate: now.toISOString(),
      expiryDate: expiryDate.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Checkout processing failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
