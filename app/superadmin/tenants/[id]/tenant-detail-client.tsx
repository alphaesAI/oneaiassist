'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  createdAt: Date;
}

interface WhatsAppInfo {
  phoneNumber: string | null;
  status: string;
  lastConnectedAt: Date | null;
}

interface AuditLogItem {
  id: string;
  action: string;
  userEmail: string;
  createdAt: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
}

interface AnnouncementItem {
  id: string;
  message: string;
  createdAt: Date;
}

interface TenantDetailClientProps {
  tenant: TenantDetail;
  stats: {
    messageCount: number;
    leadCount: number;
    conversations: number;
    whatsAppNumber: WhatsAppInfo | null;
    auditLogs: AuditLogItem[];
    announcements: AnnouncementItem[];
  };
}

// Plan Limits mapping
const PLAN_LIMITS: Record<string, { messages: number; leads: number; tokens: number; storage: number }> = {
  FREE: { messages: 500, leads: 20, tokens: 50000, storage: 100 },
  STARTUP: { messages: 2000, leads: 100, tokens: 500000, storage: 500 },
  GROWTH: { messages: 5000, leads: 200, tokens: 2000000, storage: 1000 },
  ENTERPRISE: { messages: 50000, leads: 2000, tokens: 20000000, storage: 10000 },
};

export default function TenantDetailClient({ tenant: initialTenant, stats: initialStats }: TenantDetailClientProps) {
  const router = useRouter();
  
  // Page states
  const [tenant, setTenant] = useState<TenantDetail>(initialTenant);
  const [stats, setStats] = useState(initialStats);
  const [activeTab, setActiveTab] = useState<'overview' | 'whatsapp' | 'usage' | 'billing' | 'audit'>('overview');
  
  // Action inputs
  const [selectedPlan, setSelectedPlan] = useState(initialTenant.subscriptionPlan);
  const [announcementText, setAnnouncementText] = useState('');
  
  // Impersonate modal states
  const [isImpersonateOpen, setIsImpersonateOpen] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonateError, setImpersonateError] = useState('');
  
  // Loading & notification states
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Compute stats limits based on plan
  const planNameKey = (tenant.subscriptionPlan || 'FREE').toUpperCase();
  const limits = PLAN_LIMITS[planNameKey] || PLAN_LIMITS.FREE;

  const msgPercent = Math.min(Math.round((stats.messageCount / limits.messages) * 100), 100);
  const leadPercent = Math.min(Math.round((stats.leadCount / limits.leads) * 100), 100);
  
  // Mock AI Tokens and Storage for display (responsive to DB activity)
  const mockTokensUsed = stats.messageCount * 1250; // Mock 1.25k tokens per message
  const tokensPercent = Math.min(Math.round((mockTokensUsed / limits.tokens) * 100), 100);
  
  const mockStorageUsed = Math.min(120 + stats.leadCount * 2.5, 900); // MBs
  const storagePercent = Math.min(Math.round((mockStorageUsed / limits.storage) * 100), 100);

  // Handlers
  const handleToggleStatus = async () => {
    setLoading(true);
    const newStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        setTenant(prev => ({ ...prev, status: newStatus }));
        setNotification({ type: 'success', message: `Tenant account successfully ${newStatus === 'ACTIVE' ? 'reactivated' : 'suspended'}.` });
        
        // Append log to list
        const newLog: AuditLogItem = {
          id: `log_${Date.now()}`,
          action: newStatus === 'ACTIVE' ? 'REACTIVATE_TENANT' : 'SUSPEND_TENANT',
          userEmail: 'superadmin',
          createdAt: new Date(),
          metadata: { status: newStatus }
        };
        setStats(prev => ({ ...prev, auditLogs: [newLog, ...prev.auditLogs] }));
      } else {
        setNotification({ type: 'error', message: data.error || 'Failed to update tenant status.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Server error occurred.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlan = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json();
      if (res.ok) {
        setTenant(prev => ({ ...prev, subscriptionPlan: selectedPlan }));
        setNotification({ type: 'success', message: `Subscription plan tier overridden to ${selectedPlan}.` });
        
        // Append log to list
        const newLog: AuditLogItem = {
          id: `log_${Date.now()}`,
          action: 'OVERRIDE_PLAN',
          userEmail: 'superadmin',
          createdAt: new Date(),
          metadata: { newPlan: selectedPlan }
        };
        setStats(prev => ({ ...prev, auditLogs: [newLog, ...prev.auditLogs] }));
      } else {
        setNotification({ type: 'error', message: data.error || 'Failed to override subscription plan.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Server error occurred.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSendAnnouncement = async () => {
    if (!announcementText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.id}/announcement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: announcementText }),
      });
      const data = await res.json();
      if (res.ok) {
        setAnnouncementText('');
        setNotification({ type: 'success', message: 'System announcement delivered to tenant alert center.' });
        
        // Update local announcements and audit logs
        const newAnn: AnnouncementItem = {
          id: data.announcement.id,
          message: data.announcement.message,
          createdAt: new Date()
        };
        const newLog: AuditLogItem = {
          id: `log_${Date.now()}`,
          action: 'SEND_ANNOUNCEMENT',
          userEmail: 'superadmin',
          createdAt: new Date(),
          metadata: { message: newAnn.message }
        };
        setStats(prev => ({
          ...prev,
          announcements: [newAnn, ...prev.announcements].slice(0, 5),
          auditLogs: [newLog, ...prev.auditLogs]
        }));
      } else {
        setNotification({ type: 'error', message: data.error || 'Failed to submit announcement.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Server error occurred.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleProceedImpersonate = async () => {
    if (!impersonateReason.trim()) {
      setImpersonateError('You must enter a reason to proceed.');
      return;
    }
    setImpersonateError('');
    setLoading(true);
    try {
      const res = await fetch('/api/superadmin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          reason: impersonateReason
        })
      });
      const data = await res.json();
      if (res.ok) {
        setIsImpersonateOpen(false);
        // Force redirect to client dashboard
        router.push('/dashboard');
        router.refresh();
      } else {
        setImpersonateError(data.error || 'Impersonation failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected server error occurred.';
      setImpersonateError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-[#111c2d] bg-[#f9f9ff] min-h-screen font-sans">
      {/* Side Navigation Shell */}
      <aside className="bg-[#263143] h-screen w-64 fixed left-0 top-0 shadow-md flex flex-col py-6 px-4 z-30">
        <div className="mb-8 px-2">
          <h1 className="text-2xl font-bold text-[#dbe1ff] tracking-tight">OneAIAssist</h1>
          <p className="text-xs text-[#bec6e0] opacity-70 font-semibold uppercase tracking-wider mt-1">Enterprise Admin</p>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto">
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer" href="/superadmin">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="text-sm font-medium">Overview</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 bg-[#004ac6] text-white rounded-lg transition-all duration-150 cursor-pointer" href="/superadmin">
            <span className="material-symbols-outlined">group</span>
            <span className="text-sm font-medium">Tenants</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer" href="/superadmin/ai-usage">
            <span className="material-symbols-outlined">analytics</span>
            <span className="text-sm font-medium">AI Usage</span>
          </a>
          <a className="flex items-center gap-4 px-4 py-2.5 text-[#bec6e0] hover:text-white hover:bg-[#2563eb]/20 rounded-lg transition-colors cursor-pointer" href="#">
            <span className="material-symbols-outlined">history_edu</span>
            <span className="text-sm font-medium">Audit Logs</span>
          </a>
        </nav>
      </aside>

      {/* Main Canvas Area */}
      <main className="ml-64 min-h-screen flex flex-col relative">
        {/* Toast Notification */}
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

        {/* Top Header Navbar */}
        <header className="h-16 bg-white border-b border-[#c3c6d7] flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2 text-[#434655] text-sm font-medium">
              <a href="/superadmin" className="hover:text-[#004ac6]">Tenants</a>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
              <span className="text-[#111c2d] font-bold">{tenant.name}</span>
            </nav>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              tenant.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'ACTIVE' ? 'bg-emerald-600 animate-pulse' : 'bg-red-600'}`}></span>
              {tenant.status}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsImpersonateOpen(true)}
              className="px-4 py-2 bg-white border border-[#737686] text-[#111c2d] text-sm font-semibold rounded-lg flex items-center gap-2 hover:bg-[#f0f3ff] transition-colors"
            >
              <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
              Impersonate Tenant
            </button>
            <button 
              onClick={handleToggleStatus}
              disabled={loading}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors border ${
                tenant.status === 'ACTIVE'
                  ? 'bg-transparent border-red-500 text-red-500 hover:bg-red-50/50'
                  : 'bg-emerald-500 border-emerald-500 text-white hover:brightness-105'
              }`}
            >
              {tenant.status === 'ACTIVE' ? 'Suspend Account' : 'Reactivate Account'}
            </button>
          </div>
        </header>

        {/* Dynamic Inner Panel */}
        <div className="p-8 space-y-8 flex-1">
          
          {/* Tenant Profile Banner Card */}
          <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center gap-8">
            <div className="w-14 h-14 bg-[#004ac6]/10 rounded-xl flex items-center justify-center text-[#004ac6] shrink-0">
              <span className="material-symbols-outlined text-3xl font-bold">corporate_fare</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-4 flex-1">
              <div>
                <p className="text-[#434655] text-[10px] uppercase font-bold tracking-wider mb-1">Company Name</p>
                <p className="text-xl font-bold text-[#111c2d]">{tenant.name}</p>
              </div>
              <div>
                <p className="text-[#434655] text-[10px] uppercase font-bold tracking-wider mb-1">Industry &amp; Region</p>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#004ac6] text-[18px]">business_center</span>
                  <span className="text-sm font-medium">Insurance, USA</span>
                </div>
              </div>
              <div>
                <p className="text-[#434655] text-[10px] uppercase font-bold tracking-wider mb-1">Service Plan</p>
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-[#dbe1ff] text-[#003ea8] rounded-full text-xs font-semibold uppercase">
                  <span className="material-symbols-outlined text-sm font-bold">workspace_premium</span>
                  {tenant.subscriptionPlan}
                </span>
              </div>
              <div>
                <p className="text-[#434655] text-[10px] uppercase font-bold tracking-wider mb-1">Billing Status</p>
                <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold uppercase ${
                  tenant.subscriptionStatus === 'HEALTHY' || tenant.subscriptionStatus === 'ACTIVE' 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  <span className="material-symbols-outlined text-sm font-bold">check_circle</span>
                  {tenant.subscriptionStatus || 'Healthy'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Navigation Tabs */}
          <nav className="flex border-b border-[#c3c6d7] gap-8 overflow-x-auto">
            {(['overview', 'whatsapp', 'usage', 'billing', 'audit'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-1 border-b-2 font-semibold text-sm capitalize transition-all duration-150 ${
                  activeTab === tab
                    ? 'border-[#004ac6] text-[#004ac6] font-bold'
                    : 'border-transparent text-[#434655] hover:text-[#111c2d]'
                }`}
              >
                {tab === 'whatsapp' ? 'WhatsApp Numbers' : tab === 'audit' ? 'Audit Trail' : tab}
              </button>
            ))}
          </nav>

          {/* Dynamic Tab Pane Switcher */}
          <div className="animate-fade-in">
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Bento Statistics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                  {/* Messages Stat */}
                  <div className="bg-white border border-[#c3c6d7] rounded-xl p-5 shadow-sm flex flex-col justify-between h-44">
                    <div className="flex justify-between items-start">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <span className="material-symbols-outlined text-[20px]">chat</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#434655] uppercase">Plan Limit</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#434655]">Messages Exchanged</h4>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold">{stats.messageCount}</span>
                        <span className="text-xs text-[#737686]">/ {limits.messages} msg</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-[#e7eeff] rounded-full overflow-hidden">
                        <div className="h-full bg-[#004ac6] rounded-full transition-all duration-500" style={{ width: `${msgPercent}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-[#434655] font-semibold">
                        <span>{msgPercent}% used</span>
                        <span>{Math.max(limits.messages - stats.messageCount, 0)} left</span>
                      </div>
                    </div>
                  </div>

                  {/* Leads Stat */}
                  <div className="bg-white border border-[#c3c6d7] rounded-xl p-5 shadow-sm flex flex-col justify-between h-44">
                    <div className="flex justify-between items-start">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <span className="material-symbols-outlined text-[20px]">leaderboard</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#434655] uppercase">Plan Limit</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#434655]">Leads Captured</h4>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold">{stats.leadCount}</span>
                        <span className="text-xs text-[#737686]">/ {limits.leads} leads</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-[#e7eeff] rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${leadPercent}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-[#434655] font-semibold">
                        <span>{leadPercent}% used</span>
                        <span>{Math.max(limits.leads - stats.leadCount, 0)} left</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Tokens Stat */}
                  <div className="bg-white border border-[#c3c6d7] rounded-xl p-5 shadow-sm flex flex-col justify-between h-44">
                    <div className="flex justify-between items-start">
                      <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                        <span className="material-symbols-outlined text-[20px]">token</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#434655] uppercase">Plan Limit</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#434655]">AI Tokens Consumed</h4>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold">{(mockTokensUsed / 1000).toFixed(1)}k</span>
                        <span className="text-xs text-[#737686]">/ {(limits.tokens / 1000).toFixed(0)}k tkn</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-[#e7eeff] rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${tokensPercent}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-[#434655] font-semibold">
                        <span>{tokensPercent}% used</span>
                        <span>{(Math.max(limits.tokens - mockTokensUsed, 0) / 1000).toFixed(0)}k left</span>
                      </div>
                    </div>
                  </div>

                  {/* Storage Stat */}
                  <div className="bg-white border border-[#c3c6d7] rounded-xl p-5 shadow-sm flex flex-col justify-between h-44">
                    <div className="flex justify-between items-start">
                      <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                        <span className="material-symbols-outlined text-[20px]">database</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#434655] uppercase">Hard Limit</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#434655]">Storage Allocation</h4>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold">{mockStorageUsed.toFixed(0)}MB</span>
                        <span className="text-xs text-[#737686]">/ {limits.storage}MB</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-[#e7eeff] rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${storagePercent}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-[#434655] font-semibold">
                        <span>{storagePercent}% used</span>
                        <span>{Math.max(limits.storage - mockStorageUsed, 0).toFixed(0)}MB left</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Plan Override & Administrative Controls */}
                <div className="bg-[#e7eeff] rounded-xl p-8 border border-[#c3c6d7]">
                  <div className="max-w-4xl mx-auto flex flex-col gap-6">
                    <div>
                      <h3 className="text-lg font-bold text-[#111c2d]">Administrative Controls</h3>
                      <p className="text-xs text-[#434655] mt-1">Direct operations to override credentials, service limits, or broadcast announcement indicators.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Subscription Override */}
                      <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 flex flex-col justify-between shadow-sm">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#004ac6]/10 flex items-center justify-center text-[#004ac6]">
                              <span className="material-symbols-outlined">upgrade</span>
                            </div>
                            <h4 className="text-sm font-bold uppercase tracking-wider text-[#111c2d]">Override Plan Tier</h4>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-[#434655]">Service Level Tier</label>
                            <div className="relative">
                              <select 
                                value={selectedPlan}
                                onChange={(e) => setSelectedPlan(e.target.value)}
                                className="w-full appearance-none bg-white border border-[#c3c6d7] rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#004ac6] focus:outline-none pr-10"
                              >
                                <option value="FREE">Free</option>
                                <option value="STARTUP">Startup</option>
                                <option value="GROWTH">Growth</option>
                                <option value="ENTERPRISE">Enterprise</option>
                              </select>
                              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">expand_more</span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={handleUpdatePlan}
                          disabled={loading}
                          className="mt-6 w-full py-2.5 bg-[#004ac6] text-white text-sm font-semibold rounded-lg hover:brightness-105 active:scale-[0.98] transition-all"
                        >
                          Update Subscription
                        </button>
                      </div>

                      {/* Announcement Delivery */}
                      <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 flex flex-col justify-between shadow-sm">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#bec6e0]/30 flex items-center justify-center text-[#565e74]">
                              <span className="material-symbols-outlined">campaign</span>
                            </div>
                            <h4 className="text-sm font-bold uppercase tracking-wider text-[#111c2d]">Deliver Announcement</h4>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-[#434655]">Alert Message</label>
                            <textarea
                              value={announcementText}
                              onChange={(e) => setAnnouncementText(e.target.value)}
                              placeholder="Type an announcement to display in the tenant dashboard..."
                              rows={3}
                              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-[#004ac6] focus:outline-none resize-none"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={handleSendAnnouncement}
                          disabled={loading || !announcementText.trim()}
                          className="mt-4 w-full py-2.5 bg-white border border-[#737686] text-[#111c2d] text-sm font-bold rounded-lg hover:bg-[#f0f3ff] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-sm">send</span>
                          Send Announcement
                        </button>
                      </div>

                    </div>
                  </div>
                </div>

                {/* Delivered Announcements Feed */}
                {stats.announcements.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-[#111c2d] px-1">Active Alerts Sent</h4>
                    <div className="space-y-2">
                      {stats.announcements.map((ann) => (
                        <div key={ann.id} className="bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 flex justify-between items-center text-sm shadow-sm">
                          <div className="flex items-start gap-3">
                            <span className="material-symbols-outlined text-[#004ac6] mt-0.5 text-[20px]">info</span>
                            <p className="text-[#111c2d]">{ann.message}</p>
                          </div>
                          <span className="text-[10px] text-[#737686] font-semibold uppercase">{new Date(ann.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'whatsapp' && (
              <div className="bg-white border border-[#c3c6d7] rounded-xl p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-[#111c2d]">WhatsApp Integrations</h3>
                  <p className="text-xs text-[#434655] mt-1">Configured numbers and connection tokens managed by the standalone Baileys client engine.</p>
                </div>
                
                {stats.whatsAppNumber ? (
                  <div className="border border-[#c3c6d7] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#f0f3ff]/40">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <span className="material-symbols-outlined text-2xl font-bold">phone_iphone</span>
                      </div>
                      <div>
                        <h4 className="text-md font-bold text-[#111c2d]">{stats.whatsAppNumber.phoneNumber || 'Not scanned yet'}</h4>
                        <p className="text-xs text-[#737686] mt-0.5">
                          Last sync context: {stats.whatsAppNumber.lastConnectedAt ? new Date(stats.whatsAppNumber.lastConnectedAt).toLocaleString() : 'Never'}
                        </p>
                      </div>
                    </div>
                    
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                      stats.whatsAppNumber.status === 'CONNECTED' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stats.whatsAppNumber.status === 'CONNECTED' ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'}`}></span>
                      {stats.whatsAppNumber.status}
                    </span>
                  </div>
                ) : (
                  <div className="border border-[#c3c6d7] border-dashed rounded-xl p-8 text-center text-[#737686] bg-slate-50/50">
                    <span className="material-symbols-outlined text-4xl mb-2">sms_failed</span>
                    <p className="text-sm font-semibold">No active WhatsApp connections registered.</p>
                    <p className="text-xs text-[#737686] mt-0.5">The tenant hasn&apos;t initiated the QR scan onboarding process yet.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'usage' && (
              <div className="bg-white border border-[#c3c6d7] rounded-xl p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-[#111c2d]">Platform Usage Metrics</h3>
                  <p className="text-xs text-[#434655] mt-1">High-resolution statistics tracking daily resource consumption and quotas.</p>
                </div>
                
                <div className="border border-[#c3c6d7] rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#f0f3ff] border-b border-[#c3c6d7]">
                      <tr>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Metric Unit</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Current Level</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Assigned Quota</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#c3c6d7] text-sm text-[#111c2d]">
                      <tr>
                        <td className="px-6 py-4 font-semibold">Messages</td>
                        <td className="px-6 py-4">{stats.messageCount}</td>
                        <td className="px-6 py-4">{limits.messages}</td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-[#004ac6]">{msgPercent}%</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 font-semibold">Leads</td>
                        <td className="px-6 py-4">{stats.leadCount}</td>
                        <td className="px-6 py-4">{limits.leads}</td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-emerald-600">{leadPercent}%</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 font-semibold">AI Tokens</td>
                        <td className="px-6 py-4">{(mockTokensUsed / 1000).toFixed(0)}k</td>
                        <td className="px-6 py-4">{(limits.tokens / 1000).toFixed(0)}k</td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-purple-600">{tokensPercent}%</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 font-semibold">Storage</td>
                        <td className="px-6 py-4">{mockStorageUsed.toFixed(0)} MB</td>
                        <td className="px-6 py-4">{limits.storage} MB</td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-amber-600">{storagePercent}%</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="bg-white border border-[#c3c6d7] rounded-xl p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-[#111c2d]">Billing History &amp; Invoices</h3>
                  <p className="text-xs text-[#434655] mt-1">Payment records, plans, and automatic billing invoices synced from the platform processor.</p>
                </div>
                
                <div className="border border-[#c3c6d7] rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#f0f3ff] border-b border-[#c3c6d7]">
                      <tr>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Invoice ID</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Billing Plan</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Status</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Amount</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#c3c6d7] text-sm text-[#111c2d]">
                      <tr>
                        <td className="px-6 py-4 font-bold text-[#004ac6]">Inv-003</td>
                        <td className="px-6 py-4">{tenant.subscriptionPlan} Plan</td>
                        <td className="px-6 py-4">
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-semibold">PAID</span>
                        </td>
                        <td className="px-6 py-4">${tenant.subscriptionPlan === 'FREE' ? '0.00' : '99.00'}</td>
                        <td className="px-6 py-4">July 10, 2026</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 font-bold text-[#004ac6]">Inv-002</td>
                        <td className="px-6 py-4">{tenant.subscriptionPlan} Plan</td>
                        <td className="px-6 py-4">
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-semibold">PAID</span>
                        </td>
                        <td className="px-6 py-4">${tenant.subscriptionPlan === 'FREE' ? '0.00' : '99.00'}</td>
                        <td className="px-6 py-4">June 10, 2026</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 font-bold text-[#004ac6]">Inv-001</td>
                        <td className="px-6 py-4">{tenant.subscriptionPlan} Plan</td>
                        <td className="px-6 py-4">
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-semibold">PAID</span>
                        </td>
                        <td className="px-6 py-4">${tenant.subscriptionPlan === 'FREE' ? '0.00' : '99.00'}</td>
                        <td className="px-6 py-4">May 10, 2026</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="bg-white border border-[#c3c6d7] rounded-xl p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-[#111c2d]">Tenant Audit Trail</h3>
                  <p className="text-xs text-[#434655] mt-1">Real-time system events, administrative changes, and platform impersonations.</p>
                </div>
                
                <div className="border border-[#c3c6d7] rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#f0f3ff] border-b border-[#c3c6d7]">
                      <tr>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Timestamp</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Actor</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Action</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-[#434655] uppercase">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#c3c6d7] text-sm text-[#111c2d] font-medium">
                      {stats.auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-xs text-[#737686]">
                            No audit trails recorded for this account.
                          </td>
                        </tr>
                      ) : (
                        stats.auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-xs text-[#737686]">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-xs font-semibold">
                              {log.userEmail}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.action.includes('IMPERSONATE') 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : log.action.includes('PLAN') 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-slate-100 text-slate-800'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-[#434655]">
                              {log.metadata ? JSON.stringify(log.metadata) : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Impersonation Modal */}
        {isImpersonateOpen && (
          <div className="fixed inset-0 z-50 bg-[#111c2d]/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white border border-[#c3c6d7] rounded-xl w-full max-w-md p-6 space-y-6 shadow-2xl animate-slide-up">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-amber-600">
                  <span className="material-symbols-outlined text-3xl font-bold">warning</span>
                  <h3 className="text-lg font-bold text-[#111c2d]">Confirm Impersonation</h3>
                </div>
                <p className="text-xs text-[#434655] leading-relaxed">
                  You are generating a secure session to bypass tenant isolation and access the account of <span className="font-bold text-[#111c2d]">{tenant.name}</span>. This activity will be audited.
                </p>
              </div>

              {impersonateError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg font-medium">
                  {impersonateError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#434655]">Reason for Access <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  placeholder="e.g. Debugging conversation logs or RLS configs"
                  className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#004ac6] focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsImpersonateOpen(false);
                    setImpersonateReason('');
                    setImpersonateError('');
                  }}
                  className="px-4 py-2 border border-[#737686] text-[#111c2d] text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedImpersonate}
                  disabled={loading || !impersonateReason.trim()}
                  className="px-4 py-2 bg-[#004ac6] text-white text-sm font-semibold rounded-lg hover:brightness-105 active:scale-[0.98] transition-all flex items-center gap-1.5"
                >
                  Confirm &amp; Proceed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Accent */}
        <footer className="mt-auto py-8 text-center border-t border-[#c3c6d7] bg-[#f0f3ff]">
          <p className="text-[11px] font-semibold text-[#737686] opacity-60">
            © 2026 OneAIAssist Enterprise Console • Managed Security Infrastructure
          </p>
        </footer>
      </main>
    </div>
  );
}
