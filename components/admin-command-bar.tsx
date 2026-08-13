'use client';

import React from 'react';
import Link from 'next/link';
import { 
  UserPlus, 
  Send, 
  Bot, 
  PhoneCall, 
  UserCheck, 
  Sparkles,
  BarChart3
} from 'lucide-react';

interface AdminCommandBarProps {
  userRole?: string;
  tenantName?: string;
}

export default function AdminCommandBar({ userRole = 'ADMIN', tenantName }: AdminCommandBarProps) {
  return (
    <div className="bg-gradient-to-r from-[#1B4B91] via-[#163e78] to-[#004ac6] text-white rounded-2xl p-6 shadow-md border border-blue-900/40 relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        {/* Header Greeting */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-blue-400/20 text-blue-100 text-[10px] font-mono font-bold tracking-wider uppercase rounded-full border border-blue-300/20">
              {userRole} Command Center
            </span>
            <span className="text-xs text-blue-200/80 font-medium">
              {tenantName || 'Agency Control'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            Quick Actions & Operations
            <Sparkles className="w-4 h-4 text-amber-300" />
          </h2>
          <p className="text-xs text-blue-100/80 max-w-xl">
            Execute key agency operations instantly. Launch marketing campaigns, manage WhatsApp sockets, or assign leads.
          </p>
        </div>

        {/* 1-Click Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/dashboard/leads"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white text-[#1B4B91] hover:bg-blue-50 font-semibold text-xs rounded-xl shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4 text-[#004ac6]" />
            <span>+ New Lead</span>
          </Link>

          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-800/60 hover:bg-blue-800/90 text-white font-semibold text-xs rounded-xl border border-blue-400/30 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Send className="w-4 h-4 text-cyan-300" />
            <span>Campaigns</span>
          </Link>

          <Link
            href="/dashboard/marketing"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-800/60 hover:bg-blue-800/90 text-white font-semibold text-xs rounded-xl border border-blue-400/30 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <BarChart3 className="w-4 h-4 text-amber-300" />
            <span>Marketing Suite</span>
          </Link>

          <Link
            href="/dashboard/ai-bot"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-800/60 hover:bg-blue-800/90 text-white font-semibold text-xs rounded-xl border border-blue-400/30 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Bot className="w-4 h-4 text-emerald-300" />
            <span>AI & Bot</span>
          </Link>

          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-800/60 hover:bg-blue-800/90 text-white font-semibold text-xs rounded-xl border border-blue-400/30 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <PhoneCall className="w-4 h-4 text-teal-300" />
            <span>WhatsApp Channel</span>
          </Link>

          {userRole === 'ADMIN' && (
            <Link
              href="/dashboard/settings?tab=workspace&sub=team"
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-900/40 hover:bg-blue-900/70 text-blue-100 font-semibold text-xs rounded-xl border border-blue-400/20 transition-all"
            >
              <UserCheck className="w-4 h-4 text-blue-300" />
              <span>Invite Team</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
