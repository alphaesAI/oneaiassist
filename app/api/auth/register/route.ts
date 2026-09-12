import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hash } from 'bcryptjs';
import crypto from 'crypto';

// Generate a random 16-character Base32 secret for TOTP
function generateSecret32(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 16; i++) {
    const index = crypto.randomInt ? crypto.randomInt(0, alphabet.length) : Math.floor(Math.random() * alphabet.length);
    secret += alphabet[index];
  }
  return secret;
}

import { AuthValidator } from '@/lib/auth/validation';

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();

    // 1. Strict Server-Side Validation
    const validation = AuthValidator.validateRegistration(rawBody);
    if (!validation.isValid || !validation.data) {
      return NextResponse.json(
        { error: validation.error || 'Invalid registration details provided.' },
        { status: 400 }
      );
    }

    const { tenantName, tenantSlug: slug, email, password } = validation.data;

    // Check if tenant slug is already taken
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      return NextResponse.json(
        { error: 'Registration could not be completed with the provided organization details.' },
        { status: 400 }
      );
    }

    // Check if user email is already registered
    const existingUser = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`
      );
      return tx.user.findUnique({
        where: { email },
      });
    });

    if (existingUser) {
      // Generic error response to prevent user account enumeration
      return NextResponse.json(
        { error: 'Registration could not be completed with the provided organization details.' },
        { status: 400 }
      );
    }

    // 3. Cryptographic Password Hashing (OWASP 12 rounds)
    const hashedPassword = await hash(password, 12);
    const totpSecret = generateSecret32();

    // Create the Tenant and their first User (ADMIN) in a transaction.
    // We execute set_config('app.current_user_role', 'PLATFORM_OWNER', true)
    // to bypass the RLS restriction on user creation during registration.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`
      );

      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          subscriptionPlan: 'FREE',
          subscriptionStatus: 'ACTIVE',
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          hashedPassword,
          role: 'ADMIN',
          tenantId: tenant.id,
          totpSecret,
          twoFactorEnabled: false, // Disabled by default; user can enable later
        },
      });

      return { tenant, user };
    });

    return NextResponse.json({
      success: true,
      tenantId: result.tenant.id,
      userId: result.user.id,
      totpSecret, // Return secret so the user can register it in Google Authenticator
    });
  } catch (err: unknown) {
    // 4. Generic error response - do not leak internal database messages
    console.error('[Registration] Unhandled error during tenant registration:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while setting up your account. Please try again later.' },
      { status: 500 }
    );
  }
}
