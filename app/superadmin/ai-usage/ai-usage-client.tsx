'use intelligence';
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface ChartPoint {
  date: string;
  input: number;
  output: number;
}

interface TenantUsage {
  id: string;
  name: string;
  plan: string;
  tokens: number;
  cost: number;
  planPercent: number;
  isAnomaly: boolean;
  todayTokens: number;
  trailingAvg: number;
}

interface CostAlert {
  id: string;
  name: string;
  reason: string;
  action: string;
}

interface TierLimit {
  maxTokens: number;
  hardStop: boolean;
}

interface LimitsMap {
  FREE: TierLimit;
  STARTUP: TierLimit;
  GROWTH: TierLimit;
  ENTERPRISE: TierLimit;
}

export default function AiUsageClient({ userEmail }: { userEmail: string }) {
  const [data, setData] = useState<{
    totalCostThisMonth: number;
    virtualRevenue: number;
    ratio: string;
    chartData: ChartPoint[];
    topTenants: TenantUsage[];
    costAlerts: CostAlert[];
  } | null>(null);

  const [limits, setLimits] = useState<LimitsMap>({
    FREE: { maxTokens: 100000, hardStop: true },
    STARTUP: { maxTokens: 1000000, hardStop: true },
    GROWTH: { maxTokens: 10000000, hardStop: true },
    ENTERPRISE: { maxTokens: 500000000, hardStop: true },
  });

  const [loading, setLoading] = useState(true);
  const [savingLimits, setSavingLimits] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = async () => {
    try {
      const [resData, resLimits] = await Promise.all([
        fetch('/api/superadmin/ai-usage/data'),
        fetch('/api/superadmin/ai-usage/limits')
      ]);

      if (resData.ok) {
        const d = await resData.json();
        setData(d);
      }
      if (resLimits.ok) {
        const l = await resLimits.json();
        if (l.success && l.limits) {
          setLimits(l.limits);
        }
      }
    } catch (err) {
      console.error('Failed to fetch AI usage dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveLimits = async () => {
    setSavingLimits(true);
    setNotification(null);
    try {
      const res = await fetch('/api/superadmin/ai-usage/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits }),
      });
      if (res.ok) {
        setNotification({ type: 'success', message: 'Daily tier token limits updated successfully!' });
      } else {
        const err = await res.json();
        setNotification({ type: 'error', message: err.error || 'Failed to update limits.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Server error occurred.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setSavingLimits(false);
    }
  };

  const handleRangeChange = (plan: 'FREE' | 'STARTUP' | 'GROWTH', val: number) => {
    setLimits(prev => ({
      ...prev,
      [plan]: { ...prev[plan], maxTokens: val }
    }));
  };

  const handleEnterpriseChange = (val: number) => {
    setLimits(prev => ({
      ...prev,
      ENTERPRISE: { ...prev.ENTERPRISE, maxTokens: val }
    }));
  };

  const handleHardStopChange = (plan: keyof LimitsMap, checked: boolean) => {
    setLimits(prev => ({
      ...prev,
      [plan]: { ...prev[plan], hardStop: checked }
    }));
  };

  // Process SVGs based on data
  let pathInput = 'M0,250 L800,250';
  let pathOutput = 'M0,270 L800,270';
  let maxChartVal = 1000;

  if (data && data.chartData && data.chartData.length > 0) {
    maxChartVal = Math.max(...data.chartData.map(d => Math.max(d.input, d.output)), 1000);
    pathInput = data.chartData.map((d, i) => {
      const x = (i / (data.chartData.length - 1)) * 800;
      const y = 280 - (d.input / maxChartVal) * 230;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    pathOutput = data.chartData.map((d, i) => {
      const x = (i / (data.chartData.length - 1)) * 800;
      const y = 280 - (d.output / maxChartVal) * 230;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  // Format Helper
  const formatTokens = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'k';
    return num.toString();
  };

  return (
    <div className="text-[#111c2d] bg-[#f9f9ff] min-h-screen font-sans">
      {/* Sidebar Navigation */}
      <aside className="bg-[#263143] h-screen w-64 fixed left-0 top-0 shadow-md flex flex-col py-6 px-4 z-50">
        <div className="mb-8 px-2">
          <h1 className="text-2xl font-bold text-[#dbe1ff] tracking-tight">OneAIAssist</h1>
          <p className="text-xs text-[#bec6e0] opacity-70 font-semibold uppercase tracking-wider mt-1">Enterprise Admin</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          <Link href="/superadmin" className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="text-sm font-medium">Overview</span>
          </Link>
          <Link href="/superadmin/ai-usage" className="flex items-center gap-4 px-4 py-2.5 bg-[#004ac6] text-white rounded-lg transition-all duration-150 cursor-pointer">
            <span className="material-symbols-outlined">monitoring</span>
            <span className="text-sm font-medium">AI Usage</span>
          </Link>
          <Link href="/superadmin" className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group">
            <span className="material-symbols-outlined">group</span>
            <span className="text-sm font-medium">Tenants</span>
          </Link>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer group" href="#">
            <span className="material-symbols-outlined">history_edu</span>
            <span className="text-sm font-medium">Audit Logs</span>
          </a>
        </nav>

        <div className="mt-auto border-t border-white/10 pt-6 space-y-4">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-10 h-10 rounded-full bg-[#dee8ff] flex items-center justify-center overflow-hidden border border-[#c3c6d7]/30">
              <span className="material-symbols-outlined text-[#004ac6] text-xl font-bold">admin_panel_settings</span>
            </div>
            <div className="flex flex-col max-w-[140px]">
              <span className="text-sm font-medium text-white truncate">{userEmail}</span>
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
      <main className="ml-64 min-h-screen flex flex-col relative">
        {/* Toast Alert */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg border animate-slide-up flex items-start gap-3 max-w-sm ${
            notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span className="material-symbols-outlined text-[20px]">
              {notification.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        )}

        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-[#c3c6d7] flex items-center justify-between px-8 sticky top-0 z-40">
          <h2 className="text-2xl font-bold text-[#111c2d]">AI Cost Tracking</h2>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-[#e7eeff] px-4 py-2 rounded-lg border border-[#c3c6d7] cursor-pointer hover:bg-[#dee8ff] transition-colors">
              <span className="material-symbols-outlined text-[#434655] text-[20px]">calendar_today</span>
              <span className="text-sm font-medium text-[#434655]">This Month</span>
            </div>
            <button
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              className="bg-[#004ac6] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#0053db] transition-all active:scale-95 text-center"
            >
              Refresh Stats
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
            <div className="w-12 h-12 border-4 border-[#004ac6] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-[#434655]">Loading statistics pipeline...</p>
          </div>
        ) : (
          <div className="p-8 space-y-8 flex-1">
            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Cost */}
              <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-[#434655] uppercase tracking-wider">Total Platform AI Cost</p>
                    <h3 className="text-3xl font-extrabold text-[#111c2d] mt-1">
                      ${data ? data.totalCostThisMonth.toFixed(4) : '0.0000'}
                    </h3>
                  </div>
                  <div className="w-12 h-12 bg-[#004ac6]/10 rounded-full flex items-center justify-center text-[#004ac6]">
                    <span className="material-symbols-outlined">payments</span>
                  </div>
                </div>
                <p className="text-xs text-[#737686]">Estimated real-time OpenAI + Anthropic API charges</p>
              </div>

              {/* Card 2: Ratio */}
              <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-[#434655] uppercase tracking-wider">Cost vs Revenue Ratio</p>
                    <h3 className="text-3xl font-extrabold text-[#111c2d] mt-1">
                      {data ? data.ratio : '0.0%'}
                    </h3>
                  </div>
                  <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-teal-600">
                    <span className="material-symbols-outlined">balance</span>
                  </div>
                </div>
                <p className="text-xs text-[#737686]">
                  Virtual Revenue: ${data ? data.virtualRevenue : 0} (Startup: $49/mo, Growth: $99/mo, Ent: $499/mo)
                </p>
              </div>
            </div>

            {/* Layout Canvas: Charts & Limits */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Canvas: Line Chart and Tenants List */}
              <div className="lg:col-span-8 space-y-8">
                {/* SVG Chart */}
                <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex justify-between items-center border-b border-[#c3c6d7] pb-4">
                    <h4 className="text-lg font-bold text-[#111c2d]">Token Consumption Over Time</h4>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#004ac6]"></span>
                        <span className="text-xs font-semibold text-[#434655]">Input Tokens</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#4cd7f6]"></span>
                        <span className="text-xs font-semibold text-[#434655]">Output Tokens</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative h-64 w-full">
                    <svg className="w-full h-full" viewBox="0 0 800 300" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      <line stroke="#f0f3ff" strokeWidth="1" x1="0" x2="800" y1="50" y2="50"></line>
                      <line stroke="#f0f3ff" strokeWidth="1" x1="0" x2="800" y1="125" y2="125"></line>
                      <line stroke="#f0f3ff" strokeWidth="1" x1="0" x2="800" y1="200" y2="200"></line>
                      <line stroke="#f0f3ff" strokeWidth="1" x1="0" x2="800" y1="275" y2="275"></line>
                      
                      {/* Input Tokens Path */}
                      <path d={pathInput} fill="none" stroke="#004ac6" strokeWidth="3" className="transition-all duration-500" />
                      {/* Output Tokens Path */}
                      <path d={pathOutput} fill="none" stroke="#4cd7f6" strokeWidth="3" className="transition-all duration-500" />
                    </svg>
                  </div>
                  <div className="flex justify-between text-[10px] text-[#737686] font-bold uppercase tracking-wider px-2">
                    <span>30 days ago</span>
                    <span>Today</span>
                  </div>
                </div>

                {/* Top Tenants Table */}
                <div className="bg-white border border-[#c3c6d7] rounded-xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-[#c3c6d7]">
                    <h4 className="text-lg font-bold text-[#111c2d]">Top 10 Most Expensive Tenants</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#f0f3ff] border-b border-[#c3c6d7]">
                        <tr>
                          <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase tracking-wider">Tenant</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase tracking-wider">Tokens Consumed</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase tracking-wider">Estimated Cost</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase tracking-wider">Today vs Limit</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c3c6d7] text-sm text-[#111c2d]">
                        {!data || data.topTenants.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-[#737686]">
                              No active usage log records found.
                            </td>
                          </tr>
                        ) : (
                          data.topTenants.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-6 py-4">
                                <Link href={`/superadmin/tenants/${t.id}`} className="flex items-center gap-3 hover:underline">
                                  <div className="w-8 h-8 rounded bg-[#dbe1ff] flex items-center justify-center text-[#004ac6] font-bold">
                                    {t.name ? t.name.charAt(0).toUpperCase() : 'T'}
                                  </div>
                                  <span className="font-semibold">{t.name}</span>
                                </Link>
                              </td>
                              <td className="px-6 py-4 font-medium">{formatTokens(t.tokens)}</td>
                              <td className="px-6 py-4 font-bold text-[#004ac6]">${t.cost.toFixed(4)}</td>
                              <td className="px-6 py-4">
                                <div className="space-y-1 max-w-[120px]">
                                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                    <div className={`h-full rounded-full ${t.isAnomaly ? 'bg-red-500' : 'bg-[#004ac6]'}`} style={{ width: `${t.planPercent}%` }}></div>
                                  </div>
                                  <p className="text-[10px] text-[#737686] font-semibold">{t.planPercent}% used today</p>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {t.isAnomaly ? (
                                  <div className="flex items-center gap-1.5 text-red-600 font-bold">
                                    <span className="material-symbols-outlined text-md">warning</span>
                                    <span className="text-xs uppercase tracking-wider">Anomaly</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-[#737686] uppercase tracking-wider font-semibold">Normal</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Side Panel: Rate Limits & Pending Alerts */}
              <div className="lg:col-span-4 space-y-8">
                {/* Rate limits Form */}
                <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#004ac6]">speed</span>
                    <h4 className="text-lg font-bold text-[#111c2d]">Per-Tenant Rate Limits</h4>
                  </div>
                  <p className="text-xs text-[#434655] leading-relaxed">
                    Set the maximum combined tokens (input + output) a tenant is allowed to consume daily based on their plan tier.
                  </p>

                  <div className="space-y-6">
                    {/* Free/Trial Tier */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <label className="font-bold text-[#111c2d]">Free Tier</label>
                        <span className="px-2 py-0.5 bg-[#e7eeff] text-[#004ac6] rounded text-xs font-semibold">
                          {formatTokens(limits.FREE.maxTokens)}/Day
                        </span>
                      </div>
                      <input
                        type="range"
                        min={10000}
                        max={1000000}
                        step={10000}
                        value={limits.FREE.maxTokens}
                        onChange={(e) => handleRangeChange('FREE', parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
                      />
                      <div className="flex justify-between text-[9px] text-[#737686] font-bold">
                        <span>10k</span>
                        <span>1M</span>
                      </div>
                    </div>

                    {/* Startup Tier */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <label className="font-bold text-[#111c2d]">Startup Tier</label>
                        <span className="px-2 py-0.5 bg-[#e7eeff] text-[#004ac6] rounded text-xs font-semibold">
                          {formatTokens(limits.STARTUP.maxTokens)}/Day
                        </span>
                      </div>
                      <input
                        type="range"
                        min={100000}
                        max={10000000}
                        step={100000}
                        value={limits.STARTUP.maxTokens}
                        onChange={(e) => handleRangeChange('STARTUP', parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
                      />
                      <div className="flex justify-between text-[9px] text-[#737686] font-bold">
                        <span>100k</span>
                        <span>10M</span>
                      </div>
                    </div>

                    {/* Growth Tier */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <label className="font-bold text-[#111c2d]">Growth Tier</label>
                        <span className="px-2 py-0.5 bg-[#e7eeff] text-[#004ac6] rounded text-xs font-semibold">
                          {formatTokens(limits.GROWTH.maxTokens)}/Day
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1000000}
                        max={100000000}
                        step={1000000}
                        value={limits.GROWTH.maxTokens}
                        onChange={(e) => handleRangeChange('GROWTH', parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
                      />
                      <div className="flex justify-between text-[9px] text-[#737686] font-bold">
                        <span>1M</span>
                        <span>100M</span>
                      </div>
                    </div>

                    {/* Enterprise Tier */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <label className="font-bold text-[#111c2d]">Enterprise Tier</label>
                        <input
                          type="number"
                          value={limits.ENTERPRISE.maxTokens}
                          onChange={(e) => handleEnterpriseChange(parseInt(e.target.value) || 0)}
                          className="w-32 text-right py-1 px-2.5 text-xs bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-[#004ac6] font-bold text-[#004ac6]"
                        />
                      </div>
                      <p className="text-[10px] text-[#737686] italic">Enterprise contract levels are configured manually.</p>
                    </div>

                    <hr className="border-[#c3c6d7]" />

                    {/* Hard Stop Rules */}
                    <div className="bg-[#f0f3ff] p-4 rounded-xl space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={limits.FREE.hardStop}
                          onChange={(e) => handleHardStopChange('FREE', e.target.checked)}
                          className="rounded text-[#004ac6] focus:ring-[#004ac6] h-4 w-4"
                        />
                        <span className="text-xs font-bold text-[#111c2d]">Hard Stop active (All plans)</span>
                      </div>
                      <p className="text-[11px] text-[#434655] leading-relaxed">
                        If enabled, API queries from tenants will fail immediately with 429 errors once their daily allocated token volume is exhausted.
                      </p>
                    </div>

                    <button
                      onClick={handleSaveLimits}
                      disabled={savingLimits}
                      className="w-full py-3 bg-[#004ac6] text-white rounded-lg text-sm font-bold hover:brightness-105 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      {savingLimits ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">save</span>
                          <span>Save Limits</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Anomaly Alerts Feed */}
                {data && data.costAlerts.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-4">
                    <h5 className="text-red-800 font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl">notifications_active</span>
                      <span>Cost Surge Alerts</span>
                    </h5>
                    
                    <div className="space-y-3">
                      {data.costAlerts.map((alert) => (
                        <div key={alert.id} className="bg-white p-3 rounded-lg border border-red-100 flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-colors">
                          <div className="space-y-0.5 max-w-[200px]">
                            <p className="text-sm font-bold text-[#111c2d] truncate">{alert.name}</p>
                            <p className="text-[10px] text-red-600 leading-tight">{alert.reason}</p>
                          </div>
                          <Link href={`/superadmin/tenants/${alert.id}`} className="material-symbols-outlined text-[#737686] hover:text-[#004ac6] transition-colors">
                            chevron_right
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
