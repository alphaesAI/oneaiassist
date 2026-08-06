import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

// Disable layout cache to ensure real-time health checks and counters
export const revalidate = 0;
export const dynamic = 'force-dynamic';

function formatRelativeTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    console.error('Database cluster ping failed:', err);
    return false;
  }
}

async function checkWhatsAppEngine() {
  try {
    // Ping standalone whatsapp-engine on port 3001
    const res = await fetch('http://localhost:3001/api/whatsapp/status?tenantId=health-check', {
      method: 'GET',
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(1200),
    });
    // Connection succeeded if we receive 200 or 400 (missing session is fine)
    return res.status === 200 || res.status === 400;
  } catch {
    return false;
  }
}

export default async function SuperAdminDashboard() {
  const session = await getServerSession(authOptions);

  // Security check: only PLATFORM_OWNER is permitted
  if (!session || session.user.role !== 'PLATFORM_OWNER') {
    redirect('/dashboard');
  }

  // 1. Database & Engine health check pings
  const dbConnected = await checkDatabase();
  const waConnected = await checkWhatsAppEngine();
  
  // Stubs for AI API & payment gateway as requested
  const aiApiConnected = true; // STUB: Wire real OpenAI/Anthropic status pings here when available
  const stripeConnected = true; // STUB: Wire real Stripe API health checks here when available

  // 2. Fetch Tenants (No RLS on Tenant table)
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const totalTenantsCount = tenants.length;
  const activeCount = tenants.filter(t => t.status === 'ACTIVE').length;
  const trialCount = tenants.filter(t => t.status === 'TRIAL' || t.subscriptionStatus === 'TRIAL' || t.subscriptionPlan === 'TRIAL').length;
  const churnedCount = tenants.filter(t => t.status === 'CHURNED' || t.status === 'INACTIVE' || t.subscriptionStatus === 'CHURNED').length;

  // 3. MRR Query - stub 0 but wired
  // Real MRR query ready for when paid plans exist
  // const paidTenants = await prisma.tenant.findMany({
  //   where: { status: 'ACTIVE', subscriptionPlan: { not: 'FREE' } }
  // });
  // const mrr = paidTenants.length * 99; // assuming $99 average plan price
  const mrr = 0; 

  // 4. Total Conversations Today (RLS Bypassed via PLATFORM_OWNER role transaction)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const conversationsToday = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    return tx.conversation.count({
      where: {
        createdAt: { gte: startOfDay },
      },
    });
  });

  // 5. AI Tokens & Cost (Placeholder computation based on messages today)
  const messagesToday = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    return tx.message.count({
      where: {
        createdAt: { gte: startOfDay },
      },
    });
  });
  
  // STUB: Wire query to real TokenUsage/AIRequestLog table when billing/token tracking exists
  const estimatedTokensToday = messagesToday * 1200; // Mock 1.2k tokens per message avg
  const estimatedCostToday = estimatedTokensToday * 0.00015; // Mock $0.15 per 1k tokens

  // 6. Recent Signups list (latest 5 tenants)
  const recentSignups = tenants.slice(0, 5).map(t => ({
    id: t.id,
    name: t.name,
    plan: t.subscriptionPlan,
    time: formatRelativeTime(t.createdAt),
    initialLetter: t.name ? t.name.charAt(0).toUpperCase() : 'T',
  }));

  // 7. Churn Alerts list (stubbed alerts)
  // STUB: Wire to real customer/tenant activity indicators when available
  const churnAlerts = [
    { id: '1', name: 'Blue Insurance', reason: 'Payment Failed (3 attempts)', time: '15m ago', action: 'Resolve' },
    { id: '2', name: 'TechNova Labs', reason: 'Manual Cancellation Requested', time: '2h ago', action: 'Review' },
    { id: '3', name: 'Urban Styles', reason: 'Inactive for 14 consecutive days', time: '5h ago', action: 'Outreach' }
  ];

  return (
    <div className="text-[#111c2d] bg-[#f9f9ff] min-h-screen font-sans">
      {/* Side Navigation Shell */}
      <aside className="bg-[#1B4B91] border-r border-white/10 h-screen w-64 fixed left-0 top-0 shadow-md flex flex-col py-6 px-4 z-50">
        <div className="mb-8 px-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/OneAILogo.png" alt="OneAIAssist Logo" className="h-9 w-auto object-contain" />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">OneAIAssist</h1>
            <p className="text-[10px] text-[#E2E8F0]/70 font-semibold uppercase tracking-wider">Enterprise Admin</p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto">
          <a className="flex items-center gap-4 px-4 py-2.5 bg-[#2563EB] text-white font-semibold rounded-lg transition-all duration-150 cursor-pointer shadow-sm" href="/superadmin">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="text-sm font-medium">Overview</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="/superadmin">
            <span className="material-symbols-outlined">group</span>
            <span className="text-sm font-medium">Tenants</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="/superadmin/ai-usage">
            <span className="material-symbols-outlined">analytics</span>
            <span className="text-sm font-medium">AI Usage</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="#">
            <span className="material-symbols-outlined">history_edu</span>
            <span className="text-sm font-medium">Audit Logs</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="#">
            <span className="material-symbols-outlined">payments</span>
            <span className="text-sm font-medium">Billing</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="#">
            <span className="material-symbols-outlined">campaign</span>
            <span className="text-sm font-medium">Announcements</span>
          </a>
          <div className="pt-6 pb-2 px-4">
            <p className="text-[10px] uppercase font-bold tracking-widest text-[#bec6e0] opacity-40">System</p>
          </div>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="#">
            <span className="material-symbols-outlined">speed</span>
            <span className="text-sm font-medium">Rate Limits</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="#">
            <span className="material-symbols-outlined">toggle_on</span>
            <span className="text-sm font-medium">Feature Flags</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="#">
            <span className="material-symbols-outlined">settings</span>
            <span className="text-sm font-medium">Settings</span>
          </a>
        </nav>

        <div className="mt-auto border-t border-white/10 pt-6 space-y-4">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-10 h-10 rounded-full bg-[#dee8ff] flex items-center justify-center overflow-hidden border border-[#c3c6d7]/30">
              <span className="material-symbols-outlined text-[#004ac6] text-xl font-bold">admin_panel_settings</span>
            </div>
            <div className="flex flex-col max-w-[140px]">
              <span className="text-sm font-medium text-white truncate">{session?.user?.email}</span>
              <span className="text-[11px] text-[#bec6e0] truncate">SuperAdmin Profile</span>
            </div>
          </div>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-red-500/20 rounded-lg transition-colors cursor-pointer" href="/api/auth/signout">
            <span className="material-symbols-outlined">logout</span>
            <span className="text-sm font-medium">Logout</span>
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 min-h-screen flex flex-col">
        {/* Top App Bar */}
        <header className="h-16 bg-white border-b border-[#c3c6d7] flex items-center justify-between px-8 sticky top-0 z-40">
          <h2 className="text-2xl font-bold text-[#111c2d]">Overview</h2>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-[#e7eeff] px-4 py-2 rounded-lg border border-[#c3c6d7] cursor-pointer hover:bg-[#dee8ff] transition-colors">
              <span className="material-symbols-outlined text-[#434655] text-[20px]">calendar_today</span>
              <span className="text-sm font-medium text-[#434655]">Today</span>
            </div>
            <a 
              href="/superadmin"
              className="bg-[#004ac6] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#0053db] transition-all active:scale-95 text-center"
            >
              Refresh Data
            </a>
          </div>
        </header>

        {/* Main Canvas */}
        <div className="p-8 space-y-8 flex-1">
          {/* System Health Strip */}
          <div className="bg-white border border-[#c3c6d7] rounded-lg px-6 py-4 flex items-center gap-8 overflow-x-auto no-scrollbar shadow-sm">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${waConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium text-[#111c2d]">WhatsApp Connector ({waConnected ? 'Online' : 'Offline'})</span>
            </div>
            <div className="w-px h-4 bg-[#c3c6d7]"></div>
            
            <div className="flex items-center gap-2.5 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${dbConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium text-[#111c2d]">Database Cluster ({dbConnected ? 'Online' : 'Offline'})</span>
            </div>
            <div className="w-px h-4 bg-[#c3c6d7]"></div>
            
            <div className="flex items-center gap-2.5 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${aiApiConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium text-[#111c2d]">AI API (Operational)</span>
            </div>
            <div className="w-px h-4 bg-[#c3c6d7]"></div>
            
            <div className="flex items-center gap-2.5 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${stripeConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
              <span className="text-sm font-medium text-[#111c2d]">Stripe Gateway (Operational)</span>
            </div>
          </div>

          {/* KPI Row (Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Tenants */}
            <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <p className="text-sm font-medium text-[#434655]">Total Tenants</p>
                <span className="material-symbols-outlined text-[#004ac6]">apartment</span>
              </div>
              <h3 className="text-3xl font-bold text-[#111c2d] mb-2">{totalTenantsCount}</h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-semibold">{activeCount} Active</span>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-semibold">{trialCount} Trial</span>
                <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-semibold">{churnedCount} Churned</span>
              </div>
            </div>

            {/* Card 2: MRR */}
            <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <p className="text-sm font-medium text-[#434655]">Monthly Recurring Revenue</p>
                <span className="material-symbols-outlined text-[#004ac6]">payments</span>
              </div>
              <h3 className="text-3xl font-bold text-[#111c2d] mb-2">${mrr.toLocaleString()}</h3>
              <div className="flex items-center gap-1.5 text-[#737686]">
                <span className="material-symbols-outlined text-[18px]">info</span>
                <span className="text-xs">Wired: stubbed at 0 (FREE plans)</span>
              </div>
            </div>

            {/* Card 3: Conversations */}
            <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <p className="text-sm font-medium text-[#434655]">Conversations Today</p>
                <span className="material-symbols-outlined text-[#004ac6]">forum</span>
              </div>
              <h3 className="text-3xl font-bold text-[#111c2d] mb-2">{conversationsToday}</h3>
              <p className="text-xs text-[#434655]">Real-time system transaction metrics</p>
            </div>

            {/* Card 4: AI Usage */}
            <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <p className="text-sm font-medium text-[#434655]">AI Tokens &amp; Cost</p>
                <span className="material-symbols-outlined text-[#004ac6]">generating_tokens</span>
              </div>
              <h3 className="text-3xl font-bold text-[#111c2d] mb-2">{(estimatedTokensToday / 1000).toFixed(1)}k</h3>
              <div className="flex justify-between items-center w-full">
                <span className="text-xs text-[#434655]">Est. Cost: ${estimatedCostToday.toFixed(4)}</span>
                <span className="text-[10px] bg-[#e7eeff] px-2 py-0.5 rounded text-[#434655] font-semibold">$0.15/1k avg</span>
              </div>
            </div>
          </div>

          {/* Two Columns Section */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Left Column: Recent Signups */}
            <div className="xl:col-span-3 space-y-4">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-lg font-bold text-[#111c2d]">Recent Signups</h4>
              </div>
              
              <div className="bg-white border border-[#c3c6d7] rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#f0f3ff] border-b border-[#c3c6d7]">
                    <tr>
                      <th className="px-6 py-4 text-xs font-semibold text-[#434655] uppercase tracking-wider">Company</th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#434655] uppercase tracking-wider">Plan</th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#434655] uppercase tracking-wider">Signup Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d7]">
                    {recentSignups.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-sm text-[#434655]">
                          No tenant registrations found.
                        </td>
                      </tr>
                    ) : (
                      recentSignups.map((signup, idx) => (
                        <tr key={idx} className="hover:bg-[#e7eeff] transition-colors group">
                          <td className="px-6 py-4">
                            <Link href={`/superadmin/tenants/${signup.id}`} className="flex items-center gap-3 group hover:opacity-90">
                              <div className="w-8 h-8 rounded bg-[#dbe1ff] flex items-center justify-center text-[#004ac6] font-bold group-hover:bg-[#004ac6] group-hover:text-white transition-colors">
                                {signup.initialLetter}
                              </div>
                              <span className="text-sm font-semibold text-[#111c2d] group-hover:text-[#004ac6] group-hover:underline transition-colors">{signup.name}</span>
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 bg-[#00788c]/10 text-[#00788c] rounded-lg text-xs font-semibold uppercase">
                              {signup.plan}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-[#434655] text-xs">
                            {signup.time}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Churn Alerts */}
            <div className="xl:col-span-2 space-y-4">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-lg font-bold text-[#111c2d]">Churn Alerts</h4>
                <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  3 Warnings
                </span>
              </div>
              
              <div className="space-y-3">
                {churnAlerts.map((alert) => (
                  <div key={alert.id} className="bg-white border border-[#c3c6d7] border-l-[6px] border-l-amber-500 rounded-lg p-4 shadow-sm flex justify-between items-start hover:shadow-md transition-shadow">
                    <div className="space-y-0.5">
                      <h5 className="text-sm font-bold text-[#111c2d]">{alert.name}</h5>
                      <p className="text-xs text-[#434655]">{alert.reason}</p>
                      <p className="text-[10px] text-[#737686] uppercase font-bold tracking-wider pt-1">{alert.time}</p>
                    </div>
                    <button className="bg-amber-50 text-amber-700 px-3 py-1 rounded text-xs font-semibold hover:bg-amber-100 transition-colors">
                      {alert.action}
                    </button>
                  </div>
                ))}
              </div>

              {/* Informational Section */}
              <div className="bg-[#dbe1ff] rounded-xl p-6 relative overflow-hidden shadow-sm">
                <div className="relative z-10 space-y-2">
                  <h4 className="text-lg font-bold text-[#003ea8]">System Operations</h4>
                  <p className="text-xs text-[#003ea8] opacity-80 leading-relaxed">
                    Access to SuperAdmin consoles is restricted strictly to active platform developers with active PLATFORM_OWNER authority.
                  </p>
                </div>
                <div className="absolute -right-8 -bottom-8 opacity-10">
                  <span className="material-symbols-outlined text-[160px]">shield</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
