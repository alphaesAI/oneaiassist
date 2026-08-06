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

export async function POST(req: Request) {
  try {
    const { tenantName, tenantSlug, email, password } = await req.json();

    if (!tenantName || !tenantSlug || !email || !password) {
      return NextResponse.json(
        { error: 'All fields are required.' },
        { status: 400 }
      );
    }

    const slug = tenantSlug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');

    if (!slug) {
      return NextResponse.json(
        { error: 'Invalid tenant slug.' },
        { status: 400 }
      );
    }

    // Check if tenant slug is already taken
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      return NextResponse.json(
        { error: 'Tenant slug is already in use.' },
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
      return NextResponse.json(
        { error: 'User email is already registered.' },
        { status: 400 }
      );
    }

    // Hash the password securely using bcryptjs
    const hashedPassword = await hash(password, 10);
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
    const message = err instanceof Error ? err.message : 'Unknown database error';
    return NextResponse.json(
      { error: `Registration failed: ${message}` },
      { status: 500 }
    );
  }
}
