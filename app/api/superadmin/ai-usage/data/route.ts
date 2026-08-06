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

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 1. Fetch all tenants
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        createdAt: true,
      }
    });

    // 2. Fetch all logs in the last 30 days
    const logs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
      return tx.tokenUsageLog.findMany({
        where: {
          timestamp: { gte: thirtyDaysAgo }
        },
        orderBy: { timestamp: 'asc' }
      });
    });

    // 3. Compute overall platform stats
    let totalPlatformCostThisMonth = 0;
    
    logs.forEach(log => {
      if (log.timestamp >= startOfMonth) {
        totalPlatformCostThisMonth += log.cost;
      }
    });

    // Virtual revenue calculation from active plans
    let virtualRevenue = 0;
    tenants.forEach(t => {
      if (t.subscriptionPlan === 'STARTUP') virtualRevenue += 49;
      else if (t.subscriptionPlan === 'GROWTH') virtualRevenue += 99;
      else if (t.subscriptionPlan === 'ENTERPRISE') virtualRevenue += 499;
    });

    const ratio = virtualRevenue > 0 ? ((totalPlatformCostThisMonth / virtualRevenue) * 100).toFixed(1) + '%' : '0.0%';

    // 4. Group logs by day for chart
    const dailyMap = new Map<string, { date: string; input: number; output: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dateKey = d.toISOString().split('T')[0];
      dailyMap.set(dateKey, { date: dateStr, input: 0, output: 0 });
    }

    logs.forEach(log => {
      const dateKey = log.timestamp.toISOString().split('T')[0];
      if (dailyMap.has(dateKey)) {
        const existing = dailyMap.get(dateKey)!;
        existing.input += log.inputTokens;
        existing.output += log.outputTokens;
      }
    });

    const chartData = Array.from(dailyMap.values());

    // 5. Group logs by tenant for Top 10 list
    const tenantStatsMap = new Map<string, {
      totalTokens: number;
      totalCost: number;
      todayTokens: number;
      trailingDaysTokens: number;
    }>();

    tenants.forEach(t => {
      tenantStatsMap.set(t.id, {
        totalTokens: 0,
        totalCost: 0,
        todayTokens: 0,
        trailingDaysTokens: 0,
      });
    });

    const startOfTodayMs = startOfDay.getTime();
    const sevenDaysAgoMs = startOfTodayMs - (7 * 24 * 60 * 60 * 1000);

    logs.forEach(log => {
      const stats = tenantStatsMap.get(log.tenantId);
      if (stats) {
        stats.totalTokens += log.inputTokens + log.outputTokens;
        stats.totalCost += log.cost;
        
        const logTime = log.timestamp.getTime();
        if (logTime >= startOfTodayMs) {
          stats.todayTokens += log.inputTokens + log.outputTokens;
        } else if (logTime >= sevenDaysAgoMs) {
          stats.trailingDaysTokens += log.inputTokens + log.outputTokens;
        }
      }
    });

    const planLimits = {
      FREE: 100000,
      STARTUP: 1000000,
      GROWTH: 10000000,
      ENTERPRISE: 500000000
    };

    const tenantData = tenants.map(t => {
      const stats = tenantStatsMap.get(t.id) || {
        totalTokens: 0,
        totalCost: 0,
        todayTokens: 0,
        trailingDaysTokens: 0,
      };

      const trailingAvg = stats.trailingDaysTokens / 7;
      const isAnomaly = stats.todayTokens > 10 * trailingAvg && stats.todayTokens > 20000;

      const planLimit = planLimits[t.subscriptionPlan as keyof typeof planLimits] || 1000000;
      const planPercent = Math.min(Math.round((stats.todayTokens / planLimit) * 100), 100);

      return {
        id: t.id,
        name: t.name,
        plan: t.subscriptionPlan,
        tokens: stats.totalTokens,
        cost: stats.totalCost,
        planPercent,
        isAnomaly,
        todayTokens: stats.todayTokens,
        trailingAvg: Math.round(trailingAvg)
      };
    });

    const topTenants = tenantData
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const costAlerts = tenantData
      .filter(t => t.isAnomaly)
      .map(t => ({
        id: t.id,
        name: t.name,
        reason: `Usage surge: today's usage (${(t.todayTokens/1000).toFixed(1)}k tokens) is >10x average (${(t.trailingAvg/1000).toFixed(1)}k)`,
        action: 'Review limit'
      }));

    return NextResponse.json({
      success: true,
      totalCostThisMonth: totalPlatformCostThisMonth,
      virtualRevenue,
      ratio,
      chartData,
      topTenants,
      costAlerts
    });
  } catch (err: unknown) {
    console.error('Error fetching AI usage data:', err);
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
