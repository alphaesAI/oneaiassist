'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Sliders, 
  MessageSquareCode, 
  ShieldAlert, 
  Undo2 
} from 'lucide-react';

interface AIConfigData {
  id: string;
  temperature: number;
  maxTokens: number;
  toneOfVoice: string;
  piiRedaction: boolean;
  blacklistedKeywords: string;
  systemPrompt: string;
}

export default function SettingsAiTab() {
  const queryClient = useQueryClient();
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(256);
  const [toneOfVoice, setToneOfVoice] = useState('Professional & Helpful');
  const [piiRedaction, setPiiRedaction] = useState(true);
  const [blacklistedKeywords, setBlacklistedKeywords] = useState('spam, scam, wire transfer, cryptocurrency');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a licensed healthcare insurance assistant. Respond helpfully, clearly, and concisely.'
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 text-left">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Model Parameters & Tuning (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Settings Parameters */}
          <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-gray-100 pb-4">
              <h3 className="text-base font-bold text-[#1c1b1f] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#004ac6]" />
                Model Generation Parameters
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Adjust the creative temperature and output size limits for AI replies.</p>
            </div>

            {/* Temp Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#49454f] uppercase tracking-wider">Creativity Temperature</span>
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Precise & Factual (0.0)</span>
                <span>Balanced (0.5)</span>
                <span>Creative & Empathetic (1.0)</span>
              </div>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#49454f] uppercase tracking-wider">Max Output Tokens</span>
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold">{maxTokens} tokens</span>
              </div>
              <input
                type="range"
                min="64"
                max="1024"
                step="64"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Short Messages (64)</span>
                <span>Medium Paragraphs (256)</span>
                <span>Long Explanations (1024)</span>
              </div>
            </div>

            {/* Tone of Voice */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454f] uppercase tracking-wider block">Tone of Voice Style</label>
              <select
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl bg-white outline-none focus:ring-1 focus:ring-[#004ac6] focus:border-[#004ac6]"
              >
                <option value="Professional & Helpful">Professional & Helpful (Standard Business)</option>
                <option value="Empathetic & Care-focused">Empathetic & Care-focused (Healthcare/Advisory)</option>
                <option value="Persuasive & Sales-driven">Persuasive & Sales-driven (Lead Generation)</option>
                <option value="Friendly & Casual">Friendly & Casual (Informal Support)</option>
              </select>
            </div>
          </div>

          {/* System Prompt Customization */}
          <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-[#1c1b1f] flex items-center gap-2">
              <MessageSquareCode className="w-5 h-5 text-[#004ac6]" />
              Core AI Agent System Instructions
            </h3>
            <p className="text-xs text-gray-500">Define the core rules, behavioral guidelines, and system directives that shape the AI agent replies.</p>

            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-2xl text-xs font-medium outline-none focus:ring-1 focus:ring-[#004ac6] focus:border-[#004ac6] font-mono leading-relaxed"
            />
          </div>
        </div>

        {/* Safety & Compliance Sidecard (Right 1 col) */}
        <div className="space-y-6">
          <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4 text-left">
            <h3 className="text-base font-bold text-[#1c1b1f] flex items-center gap-2 border-b border-gray-100 pb-3">
              <ShieldAlert className="w-5 h-5 text-[#004ac6]" />
              Safety Guardrails
            </h3>

            {/* PII Redaction Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h4 className="text-xs font-bold text-[#1c1b1f]">PII Compliance Redaction</h4>
                <p className="text-[10px] text-gray-500">Auto-redact emails, phones, SSN and credit cards.</p>
              </div>
              <button
                type="button"
                onClick={() => setPiiRedaction(!piiRedaction)}
                className={`w-10 h-6 rounded-full p-1 transition-colors outline-none shrink-0 ${
                  piiRedaction ? 'bg-[#004ac6]' : 'bg-gray-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  piiRedaction ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Blacklisted Keywords */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454f] uppercase tracking-wider block">Blocked Keywords</label>
              <textarea
                rows={2}
                value={blacklistedKeywords}
                onChange={(e) => setBlacklistedKeywords(e.target.value)}
                placeholder="Comma separated terms..."
                className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[#004ac6] focus:border-[#004ac6]"
              />
              <p className="text-[9px] text-gray-400">Forces agent fallback to human when keywords are detected.</p>
            </div>
          </div>

          {/* Action Trigger Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col gap-3">
            {saveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>AI Configuration saved!</span>
              </div>
            )}
            <button
              type="submit"
              className="w-full py-2.5 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
            >
              Save AI Settings
            </button>
          </div>
        </div>
        
      </div>
    </form>
  );
}
