'use client';

import React, { useState } from 'react';
import { 
  Headphones, 
  Smile, 
  RotateCcw, 
  Key, 
  Users, 
  Save, 
  CheckCircle2 
} from 'lucide-react';

export default function BotEscalationTab() {
  const [sentimentThreshold, setSentimentThreshold] = useState<number>(0.3);
  const [retryLimit, setRetryLimit] = useState<number>(2);
  const [keywordTriggers, setKeywordTriggers] = useState('human, agent, representative, supervisor, help');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const handleSaveEscalations = () => {
    setSaveSuccessMsg('Escalation & Human Handoff rules saved successfully!');
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Human Handoff Rules Container */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2 border-b border-gray-100 pb-3">
          <Headphones className="w-5 h-5 text-[#004ac6]" />
          Automated Human Handoff & Escalation Rules
        </h3>

        <div className="space-y-6">
          {/* Sentiment Threshold */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1c1b1f] flex items-center gap-1.5">
                <Smile className="w-4 h-4 text-rose-500" />
                Customer Sentiment Frustration Cutoff ({sentimentThreshold.toFixed(2)})
              </span>
              <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
                Auto Handoff on Low Sentiment
              </span>
            </div>

            <input
              type="range"
              min="0.1"
              max="0.5"
              step="0.05"
              value={sentimentThreshold}
              onChange={(e) => setSentimentThreshold(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
            />

            <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
              <span>0.1 (Extremely Frustrated)</span>
              <span>0.3 (Default Cutoff)</span>
              <span>0.5 (Slight Dissatisfaction)</span>
            </div>
          </div>

          {/* Retry Limit & Keywords */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-blue-600" />
                Consecutive Unanswered Question Limit
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={retryLimit}
                onChange={(e) => setRetryLimit(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-emerald-600" />
                Instant Keyword Triggers (Comma-separated)
              </label>
              <input
                type="text"
                value={keywordTriggers}
                onChange={(e) => setKeywordTriggers(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
              />
            </div>
          </div>

          {/* Team Routing */}
          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-[#004ac6]" />
              <div>
                <p className="text-xs font-bold text-[#1c1b1f]">Target Team Assignment</p>
                <p className="text-[11px] text-gray-500">Escalated chats are assigned via Round-Robin to active Sales Advisors.</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-white border border-gray-300 text-xs font-bold text-[#1c1b1f] rounded-lg">
              Sales Advisory Team (5 Reps)
            </span>
          </div>
        </div>
      </div>

      {/* Save Action Bar */}
      <div className="flex items-center justify-between pt-2">
        {saveSuccessMsg ? (
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {saveSuccessMsg}
          </div>
        ) : <div />}

        <button
          type="button"
          onClick={handleSaveEscalations}
          className="px-6 py-3 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition"
        >
          <Save className="w-4 h-4" />
          Save Escalation Rules
        </button>
      </div>
    </div>
  );
}
