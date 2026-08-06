import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { phoneNumber } = await req.json();
    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 });
    }
    // Mock OTP generation (in prod replace with SMS provider)
    const mockOtp = '123456';
    // Find existing customer or create new
    const existing = await db.customer.findFirst({
      where: { tenantId, primaryPhone: phoneNumber },
    });
    if (existing) {
      await db.customer.update({
        where: { id: existing.id },
        data: {
          otpCode: mockOtp,
          otpVerified: false,
        },
      });
    } else {
      await db.customer.create({
        data: {
          tenantId,
          displayName: phoneNumber,
          primaryPhone: phoneNumber,
          otpCode: mockOtp,
          otpVerified: false,
        },
      });
    }
    // TODO: integrate actual SMS provider to send mockOtp
    return NextResponse.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
