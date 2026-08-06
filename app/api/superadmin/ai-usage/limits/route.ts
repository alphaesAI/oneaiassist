import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limits = await prisma.planRateLimit.findMany();
    
    // Convert to a structured object mapping
    const limitsMap = {
      FREE: { maxTokens: 100000, hardStop: true },
      STARTUP: { maxTokens: 1000000, hardStop: true },
      GROWTH: { maxTokens: 10000000, hardStop: true },
      ENTERPRISE: { maxTokens: 500000000, hardStop: true },
    };

    limits.forEach(lim => {
      if (lim.plan in limitsMap) {
        limitsMap[lim.plan as keyof typeof limitsMap] = {
          maxTokens: lim.maxTokens,
          hardStop: lim.hardStop
        };
      }
    });

    return NextResponse.json({ success: true, limits: limitsMap });
  } catch (err: unknown) {
    console.error('Error fetching plan rate limits:', err);
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { limits } = body; // e.g. { FREE: { maxTokens: 100000, hardStop: true }, ... }

    if (!limits) {
      return NextResponse.json({ error: 'Missing limits object' }, { status: 400 });
    }

    const plans = ['FREE', 'STARTUP', 'GROWTH', 'ENTERPRISE'];
    
    // Transaction to update or insert limits
    await prisma.$transaction(
      plans.map(plan => {
        const data = limits[plan] || { maxTokens: 1000000, hardStop: true };
        return prisma.planRateLimit.upsert({
          where: { plan },
          update: {
            maxTokens: parseFloat(data.maxTokens),
            hardStop: !!data.hardStop
          },
          create: {
            plan,
            maxTokens: parseFloat(data.maxTokens),
            hardStop: !!data.hardStop
          }
        });
      })
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Error updating plan rate limits:', err);
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
