'use client';

import React, { useState, useEffect } from 'react';
import { useTenantInfo } from '@/hooks/useTenantInfo';
import { 
  SlidersHorizontal,
  Users,
  Sparkles,
  Code2,
  CreditCard,
  ShieldCheck
} from 'lucide-react';

import SettingsWorkspaceTab from '@/components/settings-workspace-tab';
import SettingsAiTab from '@/components/settings-ai-tab';
import SettingsDeveloperTab from '@/components/settings-developer-tab';
import SettingsAccountTab from '@/components/settings-account-tab';
import SettingsComplianceTab from '@/components/settings-compliance-tab';

type SettingsTab = 'workspace' | 'ai' | 'developer' | 'account' | 'compliance';

export default function SettingsPage() {
  const { data: info } = useTenantInfo();
  const tenantId = info?.tenantId;

  const [activeTab, setActiveTab] = useState<SettingsTab>('workspace');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as SettingsTab;
      if (tabParam && ['workspace', 'ai', 'developer', 'account', 'compliance'].includes(tabParam)) {
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
          Manage agency channels, team members, custom branding, AI parameters, developer keys, billing, and system compliance logs.
        </p>
      </div>

      {/* 5-Tab Clustered Secondary Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('workspace')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'workspace'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Workspace</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'ai'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI Configuration</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('developer')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'developer'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>Developer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'account'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Account & Billing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('compliance')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'compliance'
              ? 'border-[#004ac6] text-[#004ac6]'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Compliance & Logs</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="pt-2">
        {activeTab === 'workspace' && <SettingsWorkspaceTab tenantId={tenantId} />}
        {activeTab === 'ai' && <SettingsAiTab />}
        {activeTab === 'developer' && <SettingsDeveloperTab />}
        {activeTab === 'account' && <SettingsAccountTab />}
        {activeTab === 'compliance' && <SettingsComplianceTab />}
      </div>
    </div>
  );
}
