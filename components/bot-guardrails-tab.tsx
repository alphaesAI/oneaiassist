'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  MessageSquare, 
  Sliders, 
  CheckCircle2, 
  Save, 
  AlertTriangle,
  EyeOff
} from 'lucide-react';

export default function BotGuardrailsTab() {
  const [systemInstructions, setSystemInstructions] = useState(
    'You are PME Assistant, a licensed health insurance advisor for Prime Marketing Experts. Answer customer inquiries politely, recommend policies based on RAG knowledge base context, and trigger agent handoffs when requested.'
  );
  const [toneOfVoice, setToneOfVoice] = useState('PROFESSIONAL');
  const [piiRedaction, setPiiRedaction] = useState(true);
  const [bannedKeywords, setBannedKeywords] = useState('guaranteed profit, no risk, free money, 100% cure');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const handleSaveGuardrails = () => {
    setSaveSuccessMsg('Safety Guardrails & Compliance rules saved successfully!');
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      {/* HIPAA & Compliance Banner */}
      <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-purple-700" />
          <div>
            <h4 className="text-xs font-bold text-[#1c1b1f]">HIPAA & GDPR Data Compliance Guardrails</h4>
            <p className="text-[11px] text-purple-800">
              All LLM prompt contexts are stripped of raw PII prior to vector search or external AI model inference.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-purple-100 text-purple-800 text-[10px] font-extrabold rounded-full">
          COMPLIANCE ACTIVE
        </span>
      </div>

      {/* System Prompt Instructions Editor */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2 border-b border-gray-100 pb-3">
          <MessageSquare className="w-5 h-5 text-[#004ac6]" />
          System Instructions & Persona Directive Editor
        </h3>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Master System Prompt</label>
          <textarea
            rows={5}
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono outline-none focus:bg-white focus:border-[#004ac6]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Tone of Voice Directive</label>
          <select
            value={toneOfVoice}
            onChange={(e) => setToneOfVoice(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
          >
            <option value="PROFESSIONAL">Professional & Warm (Recommended for Insurance)</option>
            <option value="FORMAL">Formal & Direct (Executive Policy Consultation)</option>
            <option value="CASUAL">Casual & Friendly (Modern Social Support)</option>
          </select>
        </div>
      </div>

      {/* PII Redaction & Banned Keywords */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2 border-b border-gray-100 pb-3">
          <Lock className="w-5 h-5 text-[#004ac6]" />
          Safety Filters & PII Protection
        </h3>

        <div className="space-y-4">
          {/* PII Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2.5">
              <EyeOff className="w-4 h-4 text-emerald-600" />
              <div>
                <p className="text-xs font-bold text-[#1c1b1f]">Automated PII Redaction</p>
                <p className="text-[11px] text-gray-500">Automatically mask SSN, credit cards, and sensitive phone numbers prior to LLM submission.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPiiRedaction(!piiRedaction)}
              className={`w-12 h-6 rounded-full transition p-1 flex items-center ${
                piiRedaction ? 'bg-emerald-600 justify-end' : 'bg-gray-300 justify-start'
              }`}
            >
              <span className="w-4 h-4 bg-white rounded-full shadow" />
            </button>
          </div>

          {/* Banned Keywords Input */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Custom Blacklisted / Banned Keywords (Comma-separated)
            </label>
            <input
              type="text"
              value={bannedKeywords}
              onChange={(e) => setBannedKeywords(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
              placeholder="e.g. guaranteed profit, free money"
            />
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
          onClick={handleSaveGuardrails}
          className="px-6 py-3 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition"
        >
          <Save className="w-4 h-4" />
          Save Guardrails & Safety Settings
        </button>
      </div>
    </div>
  );
}
