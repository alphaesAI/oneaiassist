'use client';

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { ConnectChannelModal } from '@/components/marketing/ConnectChannelModal';
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TwitterIcon,
  YouTubeIcon,
} from '@/components/marketing/SocialIcons';
import { StatusBadge } from '@/components/marketing/StatusBadge';
import { api } from '@/lib/api-client';

interface Account {
  id: string;
  platform: string;
  accountName: string;
  status: string;
  expiresAt: string | null;
  connectedBy: string;
  canDisconnect: boolean;
}

interface Provider {
  id: string;
  configured: boolean;
  missing: string[];
}

const PLATFORM_CONFIG: Record<
  string,
  { name: string; color: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  INSTAGRAM: { name: 'Instagram', color: '#E1306C', icon: InstagramIcon },
  THREADS: { name: 'Threads', color: '#000000', icon: ThreadsIcon },
  TWITTER: { name: 'X (Twitter)', color: '#0F1419', icon: TwitterIcon },
  FACEBOOK: { name: 'Facebook', color: '#1877F2', icon: FacebookIcon },
  YOUTUBE: { name: 'YouTube', color: '#FF0000', icon: YouTubeIcon },
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const load = useCallback(() => {
    api<{ accounts: Account[]; providers: Provider[] }>('/api/accounts')
      .then((d) => {
        setAccounts(d.accounts);
        setProviders(d.providers);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setError(params.get('error')!);
    if (params.get('connected')) setNotice(`Connected ${params.get('connected')} account(s).`);
  }, [load]);

  async function disconnect(account: Account) {
    if (!window.confirm(`Disconnect ${account.accountName}? Past scheduled post history is preserved.`)) return;
    setError('');
    try {
      await api(`/api/accounts/${account.id}`, undefined, 'DELETE');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect');
    }
  }


  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 pt-2">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Channels</h1>
        <button
          type="button"
          onClick={() => setConnectModalOpen(true)}
          className="rounded-xl bg-[#22c55e] px-4 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#16a34a] hover:text-white"
        >
          Connect Channel
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-3.5 text-xs font-semibold text-rose-700 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 3. Main Channels Container */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-8 shadow-xs min-h-[380px] flex flex-col justify-center">
        {accounts.length === 0 ? (
          /* Empty State */
          <div className="py-12 text-center space-y-4">
            {/* Soft Gray Circle with Plus Icon */}
            <div
              onClick={() => setConnectModalOpen(true)}
              role="button"
              tabIndex={0}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer shadow-xs"
            >
              <Plus className="h-7 w-7" />
            </div>

            <div className="max-w-sm mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-900">Connect a channel to get started</h3>
              <p className="text-xs text-slate-500">
                Once connected, you&apos;ll see your channels listed here.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setConnectModalOpen(true)}
                className="rounded-xl bg-[#22c55e] px-5 py-2.5 text-xs font-bold text-slate-950 shadow-sm hover:bg-[#16a34a] hover:text-white transition"
              >
                Connect Channel
              </button>
            </div>
          </div>
        ) : (
          /* Connected Channels List */
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Connected Social Channels</h3>
              <span className="text-xs font-semibold text-slate-500">{accounts.length} active channels</span>
            </div>

            <div className="divide-y divide-slate-100">
              {accounts.map((acc) => {
                const cfg = PLATFORM_CONFIG[acc.platform] || {
                  name: acc.platform,
                  color: '#64748B',
                  icon: Radio,
                };
                const Icon = cfg.icon;

                return (
                  <div key={acc.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Squircle Brand App Icon */}
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-xs"
                        style={{ backgroundColor: cfg.color }}
                      >
                        <Icon size={22} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900 truncate">{acc.accountName}</p>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {acc.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{cfg.name} · connected by {acc.connectedBy}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConnectModalOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                        <span>Refresh</span>
                      </button>
                      {acc.canDisconnect && (
                      <button
                        type="button"
                        onClick={() => disconnect(acc)}
                        title="Disconnect channel"
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. Connect Channel Modal */}
      <ConnectChannelModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        onConnected={load}
      />
    </div>
  );
}
