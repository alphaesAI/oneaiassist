'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  Download,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Mail,
  CheckCircle2,
  Eye,
  MousePointerClick,
  AlertTriangle,
  UserX,
  Flag,
  XCircle,
  Users,
  Link as LinkIcon,
  BarChart3,
  FlaskConical,
  Trophy,
  Timer,
} from 'lucide-react';
import type {
  CampaignReportSummary,
  CampaignMetricKey,
  PaginatedReportContacts,
} from '@/lib/email/campaignReport';

interface CampaignReportModalProps {
  campaignId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CampaignReportModal({ campaignId, isOpen, onClose }: CampaignReportModalProps) {
  const [report, setReport] = useState<CampaignReportSummary | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [activeMetric, setActiveMetric] = useState<CampaignMetricKey>('opened');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [contactsData, setContactsData] = useState<PaginatedReportContacts | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Fetch campaign summary report
  const fetchReport = useCallback(async () => {
    if (!campaignId) return;
    setLoadingReport(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/broadcast/${campaignId}/report`);
      if (!res.ok) throw new Error('Failed to load campaign report');
      const data: CampaignReportSummary = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching report');
    } finally {
      setLoadingReport(false);
    }
  }, [campaignId]);

  // Fetch contacts for active metric
  const fetchMetricContacts = useCallback(
    async (metric: CampaignMetricKey, urlFilter: string | null, pageNum: number, search: string) => {
      if (!campaignId) return;
      setLoadingContacts(true);
      try {
        const query = new URLSearchParams({
          metric,
          page: String(pageNum),
          pageSize: '15',
        });
        if (urlFilter) query.set('url', urlFilter);
        if (search) query.set('search', search);

        const res = await fetch(`/api/dashboard/broadcast/${campaignId}/report/contacts?${query.toString()}`);
        if (!res.ok) throw new Error('Failed to load metric contacts');
        const data: PaginatedReportContacts = await res.json();
        setContactsData(data);
      } catch (err: unknown) {
        console.error('Error fetching metric contacts:', err);
      } finally {
        setLoadingContacts(false);
      }
    },
    [campaignId]
  );

  useEffect(() => {
    if (isOpen && campaignId) {
      fetchReport();
      setActiveMetric('opened');
      setActiveUrl(null);
      setPage(1);
      setSearchTerm('');
    } else {
      setReport(null);
      setContactsData(null);
    }
  }, [isOpen, campaignId, fetchReport]);

  useEffect(() => {
    if (isOpen && campaignId) {
      fetchMetricContacts(activeMetric, activeUrl, page, searchTerm);
    }
  }, [isOpen, campaignId, activeMetric, activeUrl, page, searchTerm, fetchMetricContacts]);

  if (!isOpen || !campaignId) return null;

  const m = report?.metrics;
  const r = report?.rates;

  const metricCards: Array<{
    key: CampaignMetricKey;
    label: string;
    count: number;
    subLabel: string;
    rateText?: string;
    icon: any;
    color: string;
    activeBorder: string;
  }> = [
    {
      key: 'recipients',
      label: 'Recipients',
      count: m?.recipients || 0,
      subLabel: 'Total enrolled',
      icon: Users,
      color: 'text-slate-700 bg-slate-50',
      activeBorder: 'border-slate-500 bg-slate-50/70',
    },
    {
      key: 'sent',
      label: 'Sent',
      count: m?.sent || 0,
      subLabel: `${r?.deliveryRate ?? 0}% accepted`,
      icon: Mail,
      color: 'text-blue-700 bg-blue-50',
      activeBorder: 'border-blue-600 bg-blue-50/60',
    },
    {
      key: 'delivered',
      label: 'Delivered',
      count: m?.delivered || 0,
      subLabel: m?.deliveredIsEstimated
        ? 'Estimate: sent minus bounces (no delivery confirmations yet)'
        : `${r?.deliveryRate ?? 0}% delivery rate`,
      rateText: `${r?.deliveryRate ?? 0}%`,
      icon: CheckCircle2,
      color: 'text-emerald-700 bg-emerald-50',
      activeBorder: 'border-emerald-600 bg-emerald-50/60',
    },
    {
      key: 'opened',
      label: 'Unique Opens',
      count: m?.opened || 0,
      subLabel: `${m?.totalOpens || 0} total opens`,
      rateText: `${r?.openRate ?? 0}%`,
      icon: Eye,
      color: 'text-indigo-700 bg-indigo-50',
      activeBorder: 'border-indigo-600 bg-indigo-50/60',
    },
    {
      key: 'clicked',
      label: 'Unique Clicks',
      count: m?.clicked || 0,
      subLabel: `${m?.totalClicks || 0} clicks (${r?.clickToOpenRate ?? 0}% CTOR)`,
      rateText: `${r?.clickRate ?? 0}%`,
      icon: MousePointerClick,
      color: 'text-violet-700 bg-violet-50',
      activeBorder: 'border-violet-600 bg-violet-50/60',
    },
    {
      key: 'bounced',
      label: 'Bounces',
      count: m?.bounced || 0,
      subLabel: `${m?.hardBounces || 0} hard / ${m?.softBounces || 0} soft`,
      rateText: `${r?.bounceRate ?? 0}%`,
      icon: AlertTriangle,
      color: 'text-amber-700 bg-amber-50',
      activeBorder: 'border-amber-600 bg-amber-50/60',
    },
    {
      key: 'unsubscribed',
      label: 'Unsubscribes',
      count: m?.unsubscribed || 0,
      subLabel: `${r?.unsubscribeRate ?? 0}% opt-out rate`,
      rateText: `${r?.unsubscribeRate ?? 0}%`,
      icon: UserX,
      color: 'text-slate-700 bg-slate-50',
      activeBorder: 'border-slate-600 bg-slate-50/60',
    },
    {
      key: 'complained',
      label: 'Complaints',
      count: m?.complained || 0,
      subLabel: `${r?.complaintRate ?? 0}% spam complaints`,
      rateText: `${r?.complaintRate ?? 0}%`,
      icon: Flag,
      color: 'text-red-700 bg-red-50',
      activeBorder: 'border-red-600 bg-red-50/60',
    },
    {
      key: 'failed',
      label: 'Failed / Skipped',
      count: m?.failed || 0,
      subLabel: `${m?.skippedSuppressed || 0} suppressed`,
      rateText: `${r?.failureRate ?? 0}%`,
      icon: XCircle,
      color: 'text-rose-700 bg-rose-50',
      activeBorder: 'border-rose-600 bg-rose-50/60',
    },
  ];

  const handleMetricClick = (key: CampaignMetricKey) => {
    setActiveMetric(key);
    setActiveUrl(null);
    setPage(1);
    setSearchTerm('');
  };

  const handleLinkClick = (url: string) => {
    setActiveMetric('clicked');
    setActiveUrl(url);
    setPage(1);
    setSearchTerm('');
  };

  const handleManualSelectWinner = async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/dashboard/broadcast/${campaignId}/ab-winner`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to evaluate A/B winner');
      await fetchReport();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error evaluating winner');
    }
  };

  const exportCsvUrl = `/api/dashboard/broadcast/${campaignId}/report/contacts?metric=${activeMetric}${
    activeUrl ? `&url=${encodeURIComponent(activeUrl)}` : ''
  }&format=csv`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1B4B91] text-white flex items-center justify-center shadow-sm">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {report?.campaign.name || 'Campaign Report'}
                </h2>
                {report?.campaign.status && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      report.campaign.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : report.campaign.status === 'SENDING'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {report.campaign.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Subject: <span className="text-slate-700 font-medium">{report?.campaign.subject || 'None'}</span> • Created{' '}
                {report?.campaign.createdAt ? new Date(report.campaign.createdAt).toLocaleDateString() : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchReport}
              disabled={loadingReport}
              title="Refresh Report"
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          {/* 0. A/B TEST COMPARISON PANEL */}
          {report?.abTest?.isAbTest && (
            <div className="bg-gradient-to-br from-purple-50/80 via-indigo-50/40 to-white border border-purple-200/90 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-600 text-white rounded-xl shadow-sm">
                    <FlaskConical className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      A/B Test Comparison
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        {report.abTest.splitPercent}% Test Split
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Evaluated by <strong>{report.abTest.metric === 'CLICKS' ? 'Click-Through Rate (CTR)' : 'Open Rate'}</strong> • {report.abTest.durationHours}h test window
                    </p>
                  </div>
                </div>

                {report.abTest.winnerSelected ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    Winner Selected: Variant {report.abTest.winnerSelected}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                      <Timer className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      Test In Progress
                    </span>
                    <button
                      type="button"
                      onClick={handleManualSelectWinner}
                      className="px-3 py-1 text-xs font-bold text-purple-700 bg-white border border-purple-300 rounded-lg hover:bg-purple-50 transition shadow-sm"
                    >
                      Pick Winner Now
                    </button>
                  </div>
                )}
              </div>

              {/* Side-by-Side Variant Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Variant A */}
                <div
                  className={`p-4 rounded-xl border bg-white relative transition ${
                    report.abTest.winnerSelected === 'A'
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">Variant A (Control)</span>
                    {report.abTest.winnerSelected === 'A' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Winner
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-900 line-clamp-1 mb-1">
                    Subject: {report.abTest.variantA.subject || '(None)'}
                  </p>
                  {report.abTest.variantA.senderName && (
                    <p className="text-[11px] text-slate-500 mb-2">Sender: {report.abTest.variantA.senderName}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Sent</span>
                      <span className="text-sm font-bold text-slate-800">{report.abTest.variantA.sent}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Open Rate</span>
                      <span className="text-sm font-bold text-indigo-600">{report.abTest.variantA.openRate}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Click Rate</span>
                      <span className="text-sm font-bold text-violet-600">{report.abTest.variantA.clickRate}%</span>
                    </div>
                  </div>
                </div>

                {/* Variant B */}
                <div
                  className={`p-4 rounded-xl border bg-white relative transition ${
                    report.abTest.winnerSelected === 'B'
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-900">Variant B (Challenger)</span>
                    {report.abTest.winnerSelected === 'B' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Winner
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-900 line-clamp-1 mb-1">
                    Subject: {report.abTest.variantB.subject || '(None)'}
                  </p>
                  {report.abTest.variantB.senderName && (
                    <p className="text-[11px] text-slate-500 mb-2">Sender: {report.abTest.variantB.senderName}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Sent</span>
                      <span className="text-sm font-bold text-slate-800">{report.abTest.variantB.sent}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Open Rate</span>
                      <span className="text-sm font-bold text-indigo-600">{report.abTest.variantB.openRate}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Click Rate</span>
                      <span className="text-sm font-bold text-violet-600">{report.abTest.variantB.clickRate}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remainder Rollout Information */}
              {report.abTest.remainder.total > 0 && (
                <div className="p-3 bg-white/90 border border-purple-100 rounded-xl text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-purple-950">Remainder Audience:</span>{' '}
                    {report.abTest.remainder.total} contacts held.
                    {report.abTest.winnerSelected
                      ? ` Sent winning Variant ${report.abTest.winnerSelected} to the remainder.`
                      : ' Will automatically receive the winning variant after test duration.'}
                  </div>
                  <div className="font-semibold text-purple-700">
                    {report.abTest.remainder.sent} of {report.abTest.remainder.total} remainder sent
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 1. METRICS & RATES GRID (Interactive Clickable Cards) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Performance Rates &amp; Metrics
              </h3>
              <span className="text-[11px] text-slate-400">Click any card to inspect contacts</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {metricCards.map((card) => {
                const Icon = card.icon;
                const isSelected = activeMetric === card.key && !activeUrl;
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => handleMetricClick(card.key)}
                    className={`text-left p-3.5 rounded-xl border transition relative overflow-hidden flex flex-col justify-between ${
                      isSelected
                        ? `${card.activeBorder} shadow-sm ring-2 ring-[#1B4B91]/20`
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">{card.label}</span>
                      <div className={`p-1 rounded-md ${card.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-slate-900">{card.count}</span>
                        {card.rateText && (
                          <span className="text-[11px] font-bold text-[#1B4B91]">
                            {card.rateText}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{card.subLabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. PER-LINK CLICK PERFORMANCE (If any links clicked) */}
          {report?.links && report.links.length > 0 && (
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-[#1B4B91]" />
                  <h4 className="text-xs font-bold text-slate-800">Per-Link Click Counts</h4>
                </div>
                <span className="text-[11px] text-slate-400">{report.links.length} distinct links clicked</span>
              </div>

              <div className="divide-y divide-slate-200/60 max-h-48 overflow-y-auto bg-white rounded-lg border border-slate-200/80">
                {report.links.map((link) => {
                  const isLinkSelected = activeMetric === 'clicked' && activeUrl === link.url;
                  return (
                    <div
                      key={link.url}
                      className={`p-3 flex items-center justify-between gap-3 text-xs transition ${
                        isLinkSelected ? 'bg-violet-50/80' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] text-slate-800 truncate" title={link.url}>
                          {link.url}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5">
                          <span>Total clicks: <strong className="text-slate-700">{link.totalClicks}</strong></span>
                          <span>Unique contacts: <strong className="text-slate-700">{link.uniqueContacts}</strong></span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLinkClick(link.url)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition whitespace-nowrap ${
                          isLinkSelected
                            ? 'bg-[#1B4B91] text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        View Clickers ({link.uniqueContacts})
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. CONTACT DRILLDOWN TABLE */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs space-y-0">
            {/* Table Action Bar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900 capitalize flex items-center gap-2">
                  <span>Contacts: {activeMetric}</span>
                  {activeUrl && (
                    <span className="text-[10px] font-normal text-slate-500 font-mono truncate max-w-xs">
                      (for: {activeUrl})
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Showing {contactsData?.totalContacts || 0} contacts for this metric
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search email or name..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1B4B91] w-48 sm:w-56"
                  />
                </div>

                <a
                  href={exportCsvUrl}
                  download
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Export CSV
                </a>
              </div>
            </div>

            {/* Table Content */}
            {loadingContacts ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading contact details...</div>
            ) : !contactsData || contactsData.contacts.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No contacts found for {activeMetric}
                {searchTerm ? ` matching "${searchTerm}"` : ''}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-2.5">Contact Email</th>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Count</th>
                      <th className="px-4 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contactsData.contacts.map((contact, idx) => (
                      <tr key={`${contact.email}-${idx}`} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{contact.email}</td>
                        <td className="px-4 py-2.5 text-slate-600">{contact.displayName || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              contact.status === 'SENT' || contact.status === 'DELIVERED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : contact.status === 'OPEN' || contact.status === 'OPENED'
                                ? 'bg-indigo-50 text-indigo-700'
                                : contact.status === 'CLICK' || contact.status === 'CLICKED'
                                ? 'bg-violet-50 text-violet-700'
                                : contact.status.includes('BOUNCE')
                                ? 'bg-amber-50 text-amber-700'
                                : contact.status.includes('UNSUB')
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {contact.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{contact.count || 1}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {contact.eventTimestamp
                            ? new Date(contact.eventTimestamp).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px] truncate max-w-xs" title={contact.details || ''}>
                          {contact.details || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {contactsData && contactsData.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/40 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Page {contactsData.page} of {contactsData.totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={contactsData.page <= 1}
                    className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(contactsData.totalPages, p + 1))}
                    disabled={contactsData.page >= contactsData.totalPages}
                    className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
