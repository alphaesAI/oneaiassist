import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { otpService } from '@/lib/otp';

export async function POST(req: Request) {
  try {
    const { tenantSlug, consent, phoneNumber } = await req.json();

    if (!tenantSlug || !phoneNumber) {
      return NextResponse.json({ error: 'tenantSlug and phoneNumber are required' }, { status: 400 });
    }

    if (!consent) {
      return NextResponse.json({ error: 'Consent is required to begin the qualification flow.' }, { status: 400 });
    }

    // Resolve Tenant by slug (Tenant has no RLS)
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug.toLowerCase().trim() },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Agency not found.' }, { status: 404 });
    }

    // Clean and validate phone number format (standardize for verification)
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
      return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 });
    }

    // Trigger OTP SMS dispatch
    const otpSent = await otpService.sendOTP(cleanPhone);
    if (!otpSent) {
      return NextResponse.json({ error: 'Failed to dispatch verification code SMS. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown initialization error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
