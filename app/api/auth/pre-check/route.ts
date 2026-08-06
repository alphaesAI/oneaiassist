import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`
      );
      return tx.user.findUnique({
        where: { email },
        select: {
          role: true,
          twoFactorEnabled: true,
        },
      });
    });

    if (!user) {
      return NextResponse.json({ twoFactorRequired: false });
    }

    const twoFactorRequired = user.role === 'ADMIN' || user.twoFactorEnabled;

    return NextResponse.json({ twoFactorRequired });
  } catch (error) {
    console.error('Error pre-checking user 2FA status:', error);
    return NextResponse.json({ twoFactorRequired: false });
  }
}
