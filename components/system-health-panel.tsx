'use client';

import React from 'react';
import Link from 'next/link';
import { Phone, Cpu, Database, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react';

interface SystemHealthPanelProps {
  waStatus?: 'CONNECTED' | 'QR_PENDING' | 'DISCONNECTED';
  waEngine?: string;
  waQuality?: string;
  aiKeyConfigured?: boolean;
  dbHealthy?: boolean;
  msgUsage?: number;
  msgLimit?: number;
}

export default function SystemHealthPanel({
  waStatus = 'CONNECTED',
  waEngine = 'Baileys Direct Socket',
  waQuality = 'High Quality',
  aiKeyConfigured = true,
  dbHealthy = true,
  msgUsage = 342,
  msgLimit = 1000,
}: SystemHealthPanelProps) {
  const usagePct = Math.min(Math.round((msgUsage / msgLimit) * 100), 100);

  return (
    <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h3 className="text-sm font-bold text-[#1c1b1f] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#004ac6]" />
          Infrastructure & Channel Health
        </h3>
        <Link
          href="/dashboard/settings"
          className="text-xs font-semibold text-[#004ac6] hover:underline flex items-center gap-0.5"
        >
          Manage Settings
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Item 1: WhatsApp Channel */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Phone className="w-3 h-3 text-teal-600" />
              WhatsApp Channel
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              {waStatus}
            </span>
          </div>
          <p className="text-xs font-bold text-[#1c1b1f] truncate">{waEngine}</p>
          <p className="text-[10px] text-gray-500 font-medium">{waQuality}</p>
        </div>

        {/* Item 2: AI Engine / RAG */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Cpu className="w-3 h-3 text-blue-600" />
              AI Copilot & RAG
            </span>
            {aiKeyConfigured ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-blue-600" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                Trial Cap
              </span>
            )}
          </div>
          <p className="text-xs font-bold text-[#1c1b1f]">Gemini 2.5 Flash / RAG</p>
          <p className="text-[10px] text-gray-500 font-medium">Vector Knowledge Base Loaded</p>
        </div>

        {/* Item 3: Database & Quota */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Database className="w-3 h-3 text-purple-600" />
              Database & Quota
            </span>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
              {usagePct}% Used
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#1c1b1f]">
              <span>API Quota</span>
              <span>{msgUsage.toLocaleString()} / {msgLimit.toLocaleString()} msgs</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#004ac6] h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
