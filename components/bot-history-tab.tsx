'use client';

import React from 'react';
import { History, GitCommit, CheckCircle2, RotateCcw } from 'lucide-react';

export default function BotHistoryTab() {
  const versions = [
    { version: 'v1.4.0 (Current)', date: '2026-08-05 10:30 AM', author: 'admin@primemarketingexperts.com', changes: 'Unified LLM Configuration with Admin Settings Security Console', status: 'ACTIVE' },
    { version: 'v1.3.2', date: '2026-08-04 04:15 PM', author: 'admin@primemarketingexperts.com', changes: 'Updated Dental & Vision Shield Rider policy PDF vector embeddings in pgvector', status: 'ARCHIVED' },
    { version: 'v1.3.0', date: '2026-08-02 11:20 AM', author: 'admin@primemarketingexperts.com', changes: 'Added customer intake flowchart question nodes for WhatsApp qualification', status: 'ARCHIVED' },
    { version: 'v1.0.0', date: '2026-08-01 09:00 AM', author: 'SYSTEM', changes: 'Initial bot creation and system prompt setup for Prime Marketing Experts', status: 'ARCHIVED' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2">
              <History className="w-5 h-5 text-[#004ac6]" />
              Bot Configuration Version History & Audit Trail
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Track prompt edits, RAG document updates, and model parameter changes over time.
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            CURRENT VERSION: v1.4.0
          </span>
        </div>

        <div className="space-y-4 pt-2">
          {versions.map((ver, idx) => (
            <div key={ver.version} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 text-[#004ac6] rounded-lg mt-0.5">
                  <GitCommit className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#1c1b1f]">{ver.version}</span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      ver.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {ver.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 mt-1 font-medium">{ver.changes}</p>
                  <p className="text-[10px] text-gray-400 mt-1 font-mono">{ver.date} • by {ver.author}</p>
                </div>
              </div>

              {ver.status !== 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => alert(`Rollback to ${ver.version} simulated!`)}
                  className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-[#1c1b1f] text-xs font-bold rounded-lg transition flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#004ac6]" />
                  Rollback
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
