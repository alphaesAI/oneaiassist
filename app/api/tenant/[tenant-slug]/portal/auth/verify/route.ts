import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ 'tenant-slug': string }> }
) {
  try {
    const { 'tenant-slug': slug } = await params;
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = tenant.id;
    const db = getTenantPrisma(tenantId, 'ADMIN');

    const { phone, otpCode } = await req.json();
    if (!phone || !otpCode) {
      return NextResponse.json({ error: 'Phone and OTP code required' }, { status: 400 });
    }

    const customer = await db.customer.findFirst({
      where: { tenantId, primaryPhone: phone },
    });

    if (!customer || customer.otpCode !== otpCode) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    await db.customer.update({
      where: { id: customer.id },
      data: {
        otpVerified: true,
        otpCode: null,
      },
    });

    const cookieStore = await cookies();
    cookieStore.set('customer_auth_token', customer.id, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
    });

    return NextResponse.json({
      success: true,
      customerId: customer.id,
      displayName: customer.displayName,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
