'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTenantInfo } from '@/hooks/useTenantInfo';

type AnalyticsTab =
  | 'overview'
  | 'funnel'
  | 'revenue'
  | 'channels'
  | 'agents'
  | 'bot'
  | 'whatsapp';

interface EscalationLogItem {
  id: string;
  userQuestion: string;
  reason: string;
  triggeredAt: string;
}

interface AnalyticsData {
  range: string;
  overview: {
    totalLeads: number;
    leadsGrowthPct: number;
    totalConversations: number;
    conversationsGrowthPct: number;
    totalConversions: number;
    conversionsGrowthPct: number;
    totalRevenueDollars: number;
    revenueGrowthPct: number;
    botResolutionRatePct: number;
    avgConversationLengthMsgs: number;
    avgTimeToFirstAgentReplyMins: number;
  };
  funnel: Array<{
    stage: string;
    name: string;
    count: number;
    dropoffPct: number;
    avgDays: number;
  }>;
  revenue: {
    byProduct: Array<{
      id: string;
      name: string;
      insurerName: string;
      activePolicies: number;
      monthlyPremiumRange: string;
      totalRevenue: number;
    }>;
    bySource: Array<{
      source: string;
      count: number;
      revenue: number;
    }>;
    pipelineForecastDollars: number;
  };
  channelPerformance: {
    channels: Array<{
      channel: string;
      name: string;
      leadCount: number;
      conversionRatePct: number;
    }>;
    bestBroadcast: {
      name: string;
      totalAudience: number;
      sentCount: number;
      readCount: number;
      deliveryRatePct: number;
      readRatePct: number;
      conversions: number;
    };
  };
  agentPerformance: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    conversationsHandled: number;
    leadsConverted: number;
    conversionRatePct: number;
    avgResponseTimeMins: number;
  }>;
  botPerformance: {
    escalationRatePct: number;
    topEscalationQuestions: EscalationLogItem[];
  };
  whatsappHealth: {
    phoneNumber: string;
    qualityRating: string;
    qualityTier: string;
    deliveryRatePct: number;
    optOutRatePct: number;
    sessionWindowUsagePct: number;
    status: string;
  };
}

export default function AnalyticsDashboardPage() {
  const { data: tenantInfo } = useTenantInfo();
  const tenantId = tenantInfo?.tenantId;

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [dateRange, setDateRange] = useState<string>('30d');
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string>('');
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);

  // TanStack Query for dynamic data fetching
  const { data, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ['analyticsMetrics', tenantId, dateRange],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant context');
      const res = await fetch(`/api/analytics?range=${dateRange}`);
      if (!res.ok) throw new Error('Failed to load analytics metrics');
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 15000, // Refresh automatically every 15 seconds
  });

  // Scheduled Email Report Mutation
  const sendReportMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch('/api/analytics/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tab: activeTab, range: dateRange }),
      });
      if (!res.ok) throw new Error('Failed to send email report');
      return res.json();
    },
    onSuccess: (resData) => {
      setShareMsg(resData.message || 'Report sent successfully!');
      setShowEmailModal(false);
      setTimeout(() => setShareMsg(null), 4000);
    },
    onError: () => {
      setShareMsg('Failed to send report. Please try again.');
      setTimeout(() => setShareMsg(null), 4000);
    },
  });

  const handleExportCSV = () => {
    window.open(`/api/analytics/export?tab=${activeTab}&range=${dateRange}`, '_blank');
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleShareClick = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareMsg('Analytics dashboard link copied to clipboard!');
    setTimeout(() => setShareMsg(null), 3000);
  };

  const tabs: Array<{ id: AnalyticsTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'funnel', label: 'Lead Funnel' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'channels', label: 'Channel Performance' },
    { id: 'agents', label: 'Agent Performance' },
    { id: 'bot', label: 'Bot Performance' },
    { id: 'whatsapp', label: 'WhatsApp Health' },
  ];

  return (
    <div className="space-y-6 text-left max-w-[1600px] mx-auto font-sans pb-12">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#c3c6d7]">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f]">Analytics &amp; Reports</h1>
            <p className="text-xs text-[#49454f] mt-0.5">
              Live performance metrics, revenue forecasts, lead funnel conversion rates, and bot SLA analytics.
            </p>
          </div>
          {/* Date Range Selector */}
          <div className="flex items-center bg-white border border-[#c3c6d7] rounded-lg px-3 py-1.5 gap-2 cursor-pointer shadow-sm hover:border-[#004ac6] transition-all">
            <span className="material-symbols-outlined text-[18px] text-[#004ac6]">calendar_today</span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#1c1b1f] focus:outline-none cursor-pointer"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="this_month">This Month</option>
            </select>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {shareMsg && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-pulse">
              {shareMsg}
            </span>
          )}
          <button
            onClick={handleShareClick}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#c3c6d7] text-[#49454f] hover:bg-slate-50 text-xs font-semibold transition-colors bg-white shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">share</span>
            Share
          </button>

          <button
            onClick={() => setShowEmailModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#c3c6d7] text-[#004ac6] hover:bg-blue-50 text-xs font-semibold transition-colors bg-white shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">mail</span>
            Email Report
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#004ac6] hover:bg-[#003ca0] text-white text-xs font-semibold transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            PDF Print
          </button>
        </div>
      </div>

      {/* Secondary Navigation Tabs */}
      <div className="border-b border-[#c3c6d7] overflow-x-auto">
        <div className="flex gap-6 min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-1 text-sm font-semibold transition-colors relative whitespace-nowrap ${
                  isActive
                    ? 'text-[#004ac6] border-b-2 border-[#004ac6]'
                    : 'text-[#49454f] hover:text-[#1c1b1f]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-xl border border-slate-200" />
          ))}
        </div>
      ) : !data ? (
        <div className="p-8 text-center bg-white border border-[#c3c6d7] rounded-xl text-slate-500 text-sm">
          No metrics available. Click refresh or switch date range.
          <button onClick={() => refetch()} className="ml-2 text-[#004ac6] underline font-semibold">Retry</button>
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {/* Total Leads */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <p className="text-xs font-semibold text-[#49454f]">Total Leads</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      data.overview.leadsGrowthPct >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
                    }`}>
                      {data.overview.leadsGrowthPct >= 0 ? `+${data.overview.leadsGrowthPct}%` : `${data.overview.leadsGrowthPct}%`}
                    </span>
                  </div>
                  <div className="flex items-end justify-between">
                    <h3 className="text-3xl font-extrabold text-[#1c1b1f]">
                      {data.overview.totalLeads.toLocaleString()}
                    </h3>
                    <div className="w-20 h-8 flex items-end gap-[3px]">
                      <div className="w-1.5 bg-[#004ac6]/20 h-4 rounded-full" />
                      <div className="w-1.5 bg-[#004ac6]/40 h-6 rounded-full" />
                      <div className="w-1.5 bg-[#004ac6]/20 h-3 rounded-full" />
                      <div className="w-1.5 bg-[#004ac6]/60 h-8 rounded-full" />
                      <div className="w-1.5 bg-[#004ac6] h-10 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Total Conversations */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <p className="text-xs font-semibold text-[#49454f]">Total Conversations</p>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      +{data.overview.conversationsGrowthPct}%
                    </span>
                  </div>
                  <div className="flex items-end justify-between">
                    <h3 className="text-3xl font-extrabold text-[#1c1b1f]">
                      {data.overview.totalConversations.toLocaleString()}
                    </h3>
                    <div className="w-20 h-8 flex items-end gap-[3px]">
                      <div className="w-1.5 bg-cyan-600/20 h-6 rounded-full" />
                      <div className="w-1.5 bg-cyan-600/40 h-4 rounded-full" />
                      <div className="w-1.5 bg-cyan-600/60 h-8 rounded-full" />
                      <div className="w-1.5 bg-cyan-600 h-10 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Total Conversions */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <p className="text-xs font-semibold text-[#49454f]">Total Conversions (Won)</p>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      +{data.overview.conversionsGrowthPct}%
                    </span>
                  </div>
                  <div className="flex items-end justify-between">
                    <h3 className="text-3xl font-extrabold text-[#1c1b1f]">
                      {data.overview.totalConversions.toLocaleString()}
                    </h3>
                    <div className="w-20 h-8 flex items-end gap-[3px]">
                      <div className="w-1.5 bg-indigo-600/20 h-8 rounded-full" />
                      <div className="w-1.5 bg-indigo-600/40 h-5 rounded-full" />
                      <div className="w-1.5 bg-indigo-600 h-10 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Total Revenue */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <p className="text-xs font-semibold text-[#49454f]">Total Revenue</p>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      +{data.overview.revenueGrowthPct}%
                    </span>
                  </div>
                  <div className="flex items-end justify-between">
                    <h3 className="text-3xl font-extrabold text-[#1c1b1f]">
                      ${(data.overview.totalRevenueDollars / 1000).toFixed(1)}k
                    </h3>
                    <div className="w-20 h-8 flex items-end gap-[3px]">
                      <div className="w-1.5 bg-[#004ac6]/20 h-3 rounded-full" />
                      <div className="w-1.5 bg-[#004ac6]/40 h-6 rounded-full" />
                      <div className="w-1.5 bg-[#004ac6] h-10 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bot Resolution & Response Efficiency Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#49454f]">Bot Resolution Rate</p>
                    <h4 className="text-2xl font-bold text-[#004ac6] mt-1">{data.overview.botResolutionRatePct}%</h4>
                    <p className="text-[11px] text-[#49454f] mt-1">Resolved without agent handoff</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-[#004ac6]">
                    <span className="material-symbols-outlined text-[24px]">smart_toy</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#49454f]">Avg Conversation Length</p>
                    <h4 className="text-2xl font-bold text-[#1c1b1f] mt-1">{data.overview.avgConversationLengthMsgs} msgs</h4>
                    <p className="text-[11px] text-[#49454f] mt-1">Average messages per chat</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[#1c1b1f]">
                    <span className="material-symbols-outlined text-[24px]">forum</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#49454f]">Avg Agent First Reply</p>
                    <h4 className="text-2xl font-bold text-emerald-600 mt-1">{data.overview.avgTimeToFirstAgentReplyMins} mins</h4>
                    <p className="text-[11px] text-[#49454f] mt-1">Response SLA time</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <span className="material-symbols-outlined text-[24px]">timer</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LEAD FUNNEL */}
          {activeTab === 'funnel' && (
            <div className="bg-white p-8 rounded-xl border border-[#c3c6d7] shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#1c1b1f]">Lead Funnel Visualization</h3>
                <p className="text-xs text-[#49454f] mt-1">
                  Stage-by-stage customer pipeline progression from initial outreach to policy issuance.
                </p>
              </div>

              {/* Visual Funnel Flow */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 pt-4">
                {data.funnel.map((step, index) => (
                  <div key={step.stage} className="bg-slate-50 border border-[#c3c6d7] rounded-xl p-4 flex flex-col justify-between space-y-3 relative">
                    <div>
                      <span className="text-[10px] font-bold text-[#004ac6] uppercase tracking-wider block">
                        Step {index + 1}
                      </span>
                      <h4 className="text-sm font-bold text-[#1c1b1f] mt-1 truncate">{step.name}</h4>
                    </div>
                    <div className="py-2 border-y border-slate-200 text-center">
                      <span className="text-2xl font-extrabold text-[#004ac6]">{step.count}</span>
                      <span className="text-[11px] text-[#49454f] block">leads</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-[#49454f]">
                      <p className="flex justify-between">
                        <span>Drop-off:</span>
                        <strong className="text-red-600">{step.dropoffPct}%</strong>
                      </p>
                      <p className="flex justify-between">
                        <span>Avg Time:</span>
                        <strong className="text-[#1c1b1f]">{step.avgDays} days</strong>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: REVENUE */}
          {activeTab === 'revenue' && (
            <div className="space-y-6">
              {/* Pipeline Forecast Banner */}
              <div className="bg-gradient-to-r from-[#004ac6] to-blue-700 text-white p-6 rounded-xl shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-widest font-semibold text-blue-200 block">
                    Pipeline Forecast (Open Deals)
                  </span>
                  <h3 className="text-3xl font-extrabold mt-1">
                    ${data.revenue.pipelineForecastDollars.toLocaleString()}
                  </h3>
                  <p className="text-xs text-blue-100 mt-1">
                    Sum of estimated policy deal values currently in New, Qualified &amp; Negotiation stages.
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-[32px]">trending_up</span>
                </div>
              </div>

              {/* Revenue by Product & Revenue by Source */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Revenue by Product */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
                  <h4 className="text-base font-bold text-[#1c1b1f]">Revenue by Policy Plan</h4>
                  <div className="space-y-3">
                    {data.revenue.byProduct.map((item) => (
                      <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-[#1c1b1f]">{item.name}</p>
                          <p className="text-[#49454f]">{item.insurerName} • {item.monthlyPremiumRange}/mo</p>
                        </div>
                        <div className="text-right">
                          <p className="font-extrabold text-[#004ac6] text-sm">${item.totalRevenue.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-500">{item.activePolicies} active policies</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revenue by Source */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
                  <h4 className="text-base font-bold text-[#1c1b1f]">Revenue by Lead Source</h4>
                  <div className="space-y-3">
                    {data.revenue.bySource.map((src) => (
                      <div key={src.source} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-[#1c1b1f]">{src.source}</p>
                          <p className="text-[#49454f]">{src.count} converted sales</p>
                        </div>
                        <div className="text-right">
                          <p className="font-extrabold text-emerald-600 text-sm">${src.revenue.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CHANNEL PERFORMANCE */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Channel Volume Table */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
                  <h4 className="text-base font-bold text-[#1c1b1f]">Inbound Lead Volume by Channel</h4>
                  <div className="space-y-3">
                    {data.channelPerformance.channels.map((ch) => (
                      <div key={ch.channel} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#004ac6]">chat</span>
                          <span className="font-bold text-[#1c1b1f]">{ch.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <span><strong>{ch.leadCount}</strong> leads</span>
                          <span className="text-emerald-600 font-semibold">{ch.conversionRatePct}% conv</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Best Performing Broadcast */}
                <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#004ac6]">Top Campaign</span>
                  <h4 className="text-base font-bold text-[#1c1b1f]">{data.channelPerformance.bestBroadcast.name}</h4>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                      <span className="text-xs text-[#49454f] block">Delivery Rate</span>
                      <span className="text-xl font-bold text-[#004ac6]">{data.channelPerformance.bestBroadcast.deliveryRatePct}%</span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                      <span className="text-xs text-[#49454f] block">Read Rate</span>
                      <span className="text-xl font-bold text-emerald-600">{data.channelPerformance.bestBroadcast.readRatePct}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AGENT PERFORMANCE */}
          {activeTab === 'agents' && (
            <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
              <h4 className="text-base font-bold text-[#1c1b1f]">Agency Team Performance Leaderboard</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#c3c6d7] text-[#49454f] bg-slate-50">
                      <th className="py-3 px-4 font-semibold">Agent Name</th>
                      <th className="py-3 px-4 font-semibold">Role</th>
                      <th className="py-3 px-4 font-semibold text-center">Chats Handled</th>
                      <th className="py-3 px-4 font-semibold text-center">Leads Converted</th>
                      <th className="py-3 px-4 font-semibold text-center">Conversion %</th>
                      <th className="py-3 px-4 font-semibold text-right">Avg Response SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.agentPerformance.map((ag) => (
                      <tr key={ag.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-[#1c1b1f]">{ag.name} ({ag.email})</td>
                        <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-blue-100 text-[#004ac6] font-bold text-[10px] uppercase">{ag.role}</span></td>
                        <td className="py-3 px-4 text-center font-semibold">{ag.conversationsHandled}</td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-600">{ag.leadsConverted}</td>
                        <td className="py-3 px-4 text-center font-bold">{ag.conversionRatePct}%</td>
                        <td className="py-3 px-4 text-right text-slate-700">{ag.avgResponseTimeMins} mins</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: BOT PERFORMANCE */}
          {activeTab === 'bot' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-[#1c1b1f]">Bot Escalation Rate</h4>
                  <p className="text-xs text-[#49454f] mt-1">Percentage of automated chats escalated to human agents</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-extrabold text-amber-600">{data.botPerformance.escalationRatePct}%</span>
                </div>
              </div>

              {/* Escalation Log Table */}
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
                <h4 className="text-base font-bold text-[#1c1b1f]">Top Escalation-Triggering Inquiries</h4>
                <div className="space-y-3">
                  {data.botPerformance.topEscalationQuestions.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                      <p className="font-bold text-[#1c1b1f]">&quot;{log.userQuestion}&quot;</p>
                      <div className="flex items-center justify-between text-[#49454f]">
                        <span>Reason: <strong className="text-amber-700">{log.reason}</strong></span>
                        <span>{new Date(log.triggeredAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: WHATSAPP HEALTH */}
          {activeTab === 'whatsapp' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
                <h4 className="text-base font-bold text-[#1c1b1f]">WhatsApp Business Health Status</h4>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between py-2 border-b border-slate-200">
                    <span className="text-[#49454f]">Phone Number:</span>
                    <strong className="text-[#1c1b1f]">{data.whatsappHealth.phoneNumber}</strong>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200">
                    <span className="text-[#49454f]">Quality Rating:</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">{data.whatsappHealth.qualityRating}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200">
                    <span className="text-[#49454f]">Messaging Tier:</span>
                    <strong className="text-[#1c1b1f]">{data.whatsappHealth.qualityTier}</strong>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200">
                    <span className="text-[#49454f]">Connection Status:</span>
                    <strong className="text-emerald-600 uppercase font-bold">{data.whatsappHealth.status}</strong>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-sm space-y-4">
                <h4 className="text-base font-bold text-[#1c1b1f]">Messaging Quality SLAs</h4>
                <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <span className="text-[#49454f] block">Delivery Rate</span>
                    <span className="text-2xl font-bold text-emerald-700">{data.whatsappHealth.deliveryRatePct}%</span>
                  </div>
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-[#49454f] block">24h Session Usage</span>
                    <span className="text-2xl font-bold text-[#004ac6]">{data.whatsappHealth.sessionWindowUsagePct}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Email Report Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-[#1c1b1f]">Send Scheduled Email Report</h3>
            <p className="text-xs text-[#49454f]">
              Enter recipient email address to send an executive PDF/CSV report for Prime Marketing Experts.
            </p>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="admin@primemarketingexperts.com"
              className="w-full bg-white border border-[#c3c6d7] rounded-xl px-4 py-2.5 text-xs text-[#1c1b1f] focus:outline-none focus:border-[#004ac6]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 rounded-lg border border-[#c3c6d7] text-xs font-semibold text-[#49454f] hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => sendReportMutation.mutate(emailInput || 'admin@primemarketingexperts.com')}
                disabled={sendReportMutation.isPending}
                className="px-4 py-2 rounded-lg bg-[#004ac6] hover:bg-[#003ca0] text-white text-xs font-semibold"
              >
                {sendReportMutation.isPending ? 'Sending...' : 'Send Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
