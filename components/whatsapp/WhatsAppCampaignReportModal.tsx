'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { WhatsAppCampaignReport, WhatsAppMetricKey, WhatsAppReportContacts } from '@/lib/whatsapp/campaignReport';

interface Props {
  campaignId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const TILES: Array<{ key: WhatsAppMetricKey; label: string; hint: string }> = [
  { key: 'recipients', label: 'Recipients', hint: 'Contacts in this campaign' },
  { key: 'sent', label: 'Sent', hint: 'Accepted by Meta' },
  { key: 'delivered', label: 'Delivered', hint: 'Reached the phone' },
  { key: 'read', label: 'Read', hint: 'Opened by the contact' },
  { key: 'replied', label: 'Replied', hint: 'Answered the message' },
  { key: 'failed', label: 'Failed', hint: 'Could not be delivered' },
  { key: 'skipped', label: 'Skipped', hint: 'Not sent (no consent or no valid data)' },
  { key: 'optedOut', label: 'Opted out', hint: 'Replied STOP' },
  { key: 'pending', label: 'Waiting', hint: 'Not sent yet' },
];

const STATUS_LABEL: Record<string, string> = {
  SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read', FAILED: 'Failed', PENDING: 'Waiting', PROCESSING: 'Sending',
  SKIPPED_OPTED_OUT: 'Skipped: no consent', SKIPPED_INVALID: 'Skipped: invalid', SKIPPED_SUPPRESSED: 'Skipped', CANCELLED: 'Cancelled',
};

export function WhatsAppCampaignReportModal({ campaignId, isOpen, onClose }: Props) {
  const [report, setReport] = useState<WhatsAppCampaignReport | null>(null);
  const [contacts, setContacts] = useState<WhatsAppReportContacts | null>(null);
  const [metric, setMetric] = useState<WhatsAppMetricKey>('recipients');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = campaignId ? `/api/dashboard/broadcast/${campaignId}/whatsapp-report` : '';

  const loadReport = useCallback(async () => {
    if (!base) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the campaign report.');
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the campaign report.');
    } finally {
      setLoading(false);
    }
  }, [base]);

  const loadContacts = useCallback(async () => {
    if (!base) return;
    try {
      const qs = new URLSearchParams({ metric, page: String(page), pageSize: '25', ...(search.trim() ? { search: search.trim() } : {}) });
      const res = await fetch(`${base}?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the contact list.');
      setContacts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the contact list.');
    }
  }, [base, metric, page, search]);

  useEffect(() => {
    if (!isOpen) return;
    setReport(null);
    setContacts(null);
    setMetric('recipients');
    setSearch('');
    setPage(1);
    loadReport();
  }, [isOpen, campaignId, loadReport]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(loadContacts, 250);
    return () => clearTimeout(timer);
  }, [isOpen, loadContacts]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !campaignId) return null;

  const m = report?.metrics;
  const r = report?.rates;
  const csvHref = `${base}?${new URLSearchParams({ metric, format: 'csv', ...(search.trim() ? { search: search.trim() } : {}) })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="WhatsApp campaign report"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900">{report?.campaign.name || 'WhatsApp campaign report'}</h2>
            {report && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {report.campaign.templateName ? `Template: ${report.campaign.templateName} · ` : ''}Status: {report.campaign.status}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => { loadReport(); loadContacts(); }} title="Refresh" aria-label="Refresh" className="rounded p-1.5 text-slate-600 hover:bg-slate-100">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose} title="Close" aria-label="Close" className="rounded p-1.5 text-slate-600 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-800">{error}</div>}
          {report?.campaign.lastError && ['FAILED', 'PAUSED'].includes(report.campaign.status) && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">{report.campaign.lastError}</div>
          )}
          {!report && !error && <p className="py-8 text-center text-slate-500">Loading report</p>}

          {m && r && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {TILES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    title={t.hint}
                    onClick={() => { setMetric(t.key); setPage(1); }}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${metric === t.key ? 'border-[#004ac6] bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.label}</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{m[t.key].toLocaleString()}</div>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600">
                <span>Delivery rate <strong className="text-slate-900">{r.deliveryRate}%</strong> of sent</span>
                <span>Read rate <strong className="text-slate-900">{r.readRate}%</strong> of delivered</span>
                <span>Reply rate <strong className="text-slate-900">{r.replyRate}%</strong> of delivered</span>
                <span>Failure rate <strong className="text-slate-900">{r.failureRate}%</strong> of recipients</span>
              </div>
              <p className="text-[10px] text-slate-500">
                Read counts only contacts who have read receipts turned on in WhatsApp, so the real number can be higher.
              </p>

              {report.failureReasons.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-bold text-slate-800">Why messages failed</h3>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {report.failureReasons.map((f, i) => (
                      <li key={`${f.code}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 break-words text-slate-700">{f.example || 'No reason recorded'}</span>
                        <span className="shrink-0 font-bold tabular-nums text-slate-900">{f.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.skipReasons.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-bold text-slate-800">Why contacts were skipped</h3>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {report.skipReasons.map((s, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 break-words text-slate-700">{s.reason}</span>
                        <span className="shrink-0 font-bold tabular-nums text-slate-900">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold text-slate-800">
                    {TILES.find((t) => t.key === metric)?.label}: {contacts ? contacts.totalContacts.toLocaleString() : ''} contacts
                  </h3>
                  <div className="flex items-center gap-2">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        aria-label="Search contacts"
                        placeholder="Name or phone"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="w-44 rounded-lg border border-slate-300 py-1.5 pl-7 pr-2"
                      />
                    </label>
                    <a href={csvHref} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
                      <Download className="h-3.5 w-3.5" /> Export CSV
                    </a>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Contact</th>
                        <th className="px-3 py-2 font-semibold">Phone</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Time</th>
                        <th className="px-3 py-2 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contacts?.contacts.map((c) => (
                        <tr key={c.customerId}>
                          <td className="px-3 py-2 font-semibold text-slate-900">{c.displayName || 'Unnamed contact'}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-700">{c.phone ? `+${c.phone.replace(/^\++/, '')}` : ''}</td>
                          <td className="px-3 py-2 text-slate-700">{STATUS_LABEL[c.status] || c.status}</td>
                          <td className="px-3 py-2 text-slate-600" suppressHydrationWarning>{c.at ? new Date(c.at).toLocaleString() : ''}</td>
                          <td className="max-w-[16rem] break-words px-3 py-2 text-slate-600">{c.details || ''}</td>
                        </tr>
                      ))}
                      {contacts && contacts.contacts.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No contacts in this list.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {contacts && contacts.totalPages > 1 && (
                  <div className="mt-2 flex items-center justify-end gap-2 text-slate-600">
                    <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 p-1 disabled:opacity-40">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span>Page {contacts.page} of {contacts.totalPages}</span>
                    <button type="button" aria-label="Next page" disabled={page >= contacts.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-300 p-1 disabled:opacity-40">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
