import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';

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

    const { phone } = await req.json();
    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const mockOtp = '123456';

    const customer = await db.customer.findFirst({
      where: { tenantId, primaryPhone: phone },
    });

    if (!customer) {
      return NextResponse.json({ error: 'No customer account found with this phone number.' }, { status: 404 });
    }

    await db.customer.update({
      where: { id: customer.id },
      data: {
        otpCode: mockOtp,
        otpVerified: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'OTP sent to your phone number.',
      mockOtp: process.env.NODE_ENV !== 'production' ? mockOtp : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to request OTP';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
