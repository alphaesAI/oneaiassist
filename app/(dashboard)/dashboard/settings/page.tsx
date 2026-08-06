'use client';

import React, { useState, useEffect } from 'react';
import { useTenantInfo } from '@/hooks/useTenantInfo';
import { 
  Phone, 
  ShieldCheck, 
  Building2, 
  Activity, 
  SlidersHorizontal 
} from 'lucide-react';

import SettingsChannelsTab from '@/components/settings-channels-tab';
import SettingsSecurityTab from '@/components/settings-security-tab';
import SettingsBrandingTab from '@/components/settings-branding-tab';
import SettingsLogsTab from '@/components/settings-logs-tab';

type SettingsTab = 'channels' | 'security' | 'branding' | 'logs';

export default function SettingsPage() {
  const { data: info } = useTenantInfo();
  const tenantId = info?.tenantId;

  const [activeTab, setActiveTab] = useState<SettingsTab>('channels');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as SettingsTab;
      if (tabParam && ['channels', 'security', 'branding', 'logs'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }
  }, []);

  return (
    <div className="space-y-8 text-left font-sans text-[#1c1b1f]">
      {/* Header Banner */}
      <div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6 text-[#004ac6]" />
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f]">
            Enterprise Admin Settings Console
          </h1>
        </div>
        <p className="text-sm text-[#49454f] mt-1">
          Manage agency WhatsApp channels, encrypted AI provider keys, branding assets, business hours, and infrastructure health logs.
        </p>
      </div>

      {/* 4-Tab Secondary Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('channels')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'channels'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Phone className="w-4 h-4" />
          <span>WhatsApp & Channels</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'security'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Security & API Keys</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('branding')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'branding'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Company Profile & Branding</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'logs'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>System Health & Logs</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="pt-2">
        {activeTab === 'channels' && <SettingsChannelsTab tenantId={tenantId} />}
        {activeTab === 'security' && <SettingsSecurityTab />}
        {activeTab === 'branding' && <SettingsBrandingTab />}
        {activeTab === 'logs' && <SettingsLogsTab />}
      </div>
    </div>
  );
}
