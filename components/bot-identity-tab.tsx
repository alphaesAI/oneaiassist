'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Bot, 
  Sparkles, 
  Sliders, 
  Key, 
  Save, 
  CheckCircle2, 
  Info,
  Flame
} from 'lucide-react';

interface PersonaData {
  botName: string;
  greetingMessage: string;
  temperature: number;
  maxTokens: number;
  systemInstructions: string;
}

export default function BotIdentityTab() {
  const queryClient = useQueryClient();

  const [botName, setBotName] = useState('PME Assistant');
  const [greetingMessage, setGreetingMessage] = useState(
    'Welcome to Prime Marketing Experts! Are you looking to buy or sell health insurance?'
  );
  const [temperature, setTemperature] = useState<number>(0.3);
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const { data: personaData } = useQuery<PersonaData>({
    queryKey: ['bot-persona'],
    queryFn: async () => {
      const res = await fetch('/api/bot/persona');
      if (!res.ok) throw new Error('Failed to fetch persona');
      return res.json();
    },
  });

  useEffect(() => {
    if (personaData) {
      if (personaData.botName) setBotName(personaData.botName);
      if (personaData.greetingMessage) setGreetingMessage(personaData.greetingMessage);
      if (typeof personaData.temperature === 'number') setTemperature(personaData.temperature);
      if (typeof personaData.maxTokens === 'number') setMaxTokens(personaData.maxTokens);
    }
  }, [personaData]);

  // Save Persona Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/bot/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName,
          greetingMessage,
          temperature,
          maxTokens,
        }),
      });
      if (!res.ok) throw new Error('Failed to save persona');
      return res.json();
    },
    onSuccess: () => {
      setSaveSuccessMsg('Persona Hyperparameters saved successfully!');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['bot-persona'] });
    },
  });

  const getTempLabel = (val: number) => {
    if (val <= 0.2) return 'Strict Factual Compliance (Ideal for Health Policies)';
    if (val <= 0.6) return 'Balanced Advisor (Recommended for Sales Intake)';
    return 'Creative Sales Rep (Brainstorming Coverage Options)';
  };

  return (
    <div className="space-y-6">
      {/* Read-Only Model Credentials & Admin Settings Link */}
      <div className="p-5 bg-[#004ac6]/5 border border-[#004ac6]/20 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[#004ac6]" />
            <span className="text-xs font-bold text-[#1c1b1f]">Encrypted AI Provider Credentials</span>
          </div>
          <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            ACTIVE IN ADMIN SETTINGS
          </span>
        </div>
        <p className="text-[11px] text-[#49454f]">
          Google Gemini 2.5 Flash API Keys, webhook HMAC secrets, and billing quotas are centrally encrypted and managed in Admin Settings.
        </p>
        <div className="pt-1">
          <Link
            href="/dashboard/settings?tab=developer"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#004ac6] hover:underline"
          >
            Manage Credentials in Admin Settings &rarr;
          </Link>
        </div>
      </div>

      {/* Bot Identity Details */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2 border-b border-gray-100 pb-3">
          <Bot className="w-5 h-5 text-[#004ac6]" />
          Agent Persona & Display Info
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Bot Display Name</label>
            <input
              type="text"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
              placeholder="e.g. PME Assistant"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Initial Greeting Copy (Bot Intro)</label>
            <textarea
              rows={3}
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
            />
          </div>
        </div>
      </div>

      {/* Model Creativity & Hyperparameter Tuning */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2 border-b border-gray-100 pb-3">
          <Sliders className="w-5 h-5 text-[#004ac6]" />
          Model Hyperparameter Tuning & Creativity Controls
        </h3>

        <div className="space-y-6">
          {/* Temperature Slider */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1c1b1f] flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                Creativity Temperature ({temperature.toFixed(2)})
              </span>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                {getTempLabel(temperature)}
              </span>
            </div>

            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
            />

            <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
              <span>0.0 (Strict Factual)</span>
              <span>0.5 (Balanced)</span>
              <span>1.0 (Creative Advisor)</span>
            </div>
          </div>

          {/* Max Output Tokens Slider */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1c1b1f] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Max Output Tokens Limit ({maxTokens} tokens)
              </span>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full">
                Response Length Bound
              </span>
            </div>

            <input
              type="range"
              min="256"
              max="2048"
              step="128"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#004ac6]"
            />

            <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
              <span>256 (Concise Reply)</span>
              <span>1024 (Standard)</span>
              <span>2048 (Detailed Policy Spec)</span>
            </div>
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
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-6 py-3 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Saving Hyperparameters...' : 'Save Persona & Hyperparameters'}
        </button>
      </div>
    </div>
  );
}
