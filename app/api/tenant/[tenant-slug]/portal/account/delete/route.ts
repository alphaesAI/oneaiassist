import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(
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
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = tenant.id;
    const db = getTenantPrisma(tenantId, 'ADMIN');

    // Perform GDPR PII anonymization
    await db.customer.update({
      where: { id: customerId },
      data: {
        displayName: 'Anonymized User',
        primaryPhone: `ANON-${Date.now()}`,
        email: null,
        optedIn: false,
        optedOutAt: new Date(),
      },
    });

    // Find an Admin/User ID for AuditLog
    const adminUser = await db.user.findFirst({
      where: { tenantId },
      select: { id: true },
    });

    // Write audit log
    await db.auditLog.create({
      data: {
        tenantId,
        userId: adminUser?.id || customerId,
        action: 'CUSTOMER_SOFT_DELETE',
        metadata: {
          customerId,
          anonymizedAt: new Date().toISOString(),
          requestedBy: 'CUSTOMER_PORTAL',
        },
      },
    });

    // Clear auth cookie
    cookieStore.delete('customer_auth_token');

    return NextResponse.json({
      success: true,
      message: 'Account and personal data have been anonymized per GDPR standards.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
