import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const { phoneNumber, otpCode } = await req.json();
    if (!phoneNumber || !otpCode) {
      return NextResponse.json({ error: 'phoneNumber and otpCode required' }, { status: 400 });
    }
    // Find customer and verify OTP
    const customer = await db.customer.findFirst({
      where: { tenantId, primaryPhone: phoneNumber },
    });
    if (!customer || customer.otpCode !== otpCode) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }
    // Mark verified
    await db.customer.update({
      where: { id: customer.id },
      data: { otpVerified: true, otpCode: null },
    });
    return NextResponse.json({ success: true, customerId: customer.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
