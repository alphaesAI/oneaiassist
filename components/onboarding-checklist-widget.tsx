'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface OnboardingStatus {
  accountCreated: boolean;
  whatsappConnected: boolean;
  botNameSet: boolean;
  intakeFlowBuilt: boolean;
  productAdded: boolean;
  agentInvited: boolean;
  testMessageSent: boolean;
  goneLive: boolean;
}

const STEP_KEYS = [
  'accountCreated',
  'whatsappConnected',
  'botNameSet',
  'intakeFlowBuilt',
  'productAdded',
  'agentInvited',
  'testMessageSent',
  'goneLive',
] as const;

const STEP_DETAILS = [
  {
    key: 'accountCreated',
    title: 'Account created',
    description: 'Welcome to OneAIAssist! Your workspace is active and initialized.',
    link: '/dashboard',
    manual: false,
  },
  {
    key: 'whatsappConnected',
    title: 'Connect WhatsApp number',
    description: 'Connect your WhatsApp Business number to the AI engine.',
    link: '/dashboard/settings',
    manual: false,
  },
  {
    key: 'botNameSet',
    title: 'Set up bot name & greeting',
    description: 'Give your AI assistant a custom name and welcoming introduction greeting.',
    link: '/dashboard/ai-bot',
    manual: false,
  },
  {
    key: 'intakeFlowBuilt',
    title: 'Build intake question flow',
    description: 'Configure bot questions for automatic lead intake and routing.',
    link: '/dashboard/ai-bot',
    manual: true,
  },
  {
    key: 'productAdded',
    title: 'Add your first product/policy',
    description: 'Insert items or documents into your agent catalog to activate RAG knowledge.',
    link: '/dashboard/knowledge-base',
    manual: false,
  },
  {
    key: 'agentInvited',
    title: 'Invite a team agent',
    description: 'Add support specialists or co-administrators to your team workspace.',
    link: '/dashboard/settings?tab=workspace&sub=team',
    manual: false,
  },
  {
    key: 'testMessageSent',
    title: 'Send a test message to yourself',
    description: 'Open the agent chat interface to dry-run policy qualification chats.',
    link: '/dashboard/inbox',
    manual: false,
  },
  {
    key: 'goneLive',
    title: 'Go Live!',
    description: 'Enable real client queries and launch the AI bot engine live.',
    link: '/dashboard',
    manual: true,
  },
] as const;

export default function OnboardingChecklistWidget({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [stepsComplete, setStepsComplete] = useState(0);
  const [percent, setPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [togglingStep, setTogglingStep] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchProgress = async () => {
    try {
      const res = await fetch('/api/tenant/onboarding');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatus(data.status);
          setStepsComplete(data.stepsComplete);
          setPercent(data.progressPercent);
          setDismissed(!!data.onboardingDismissed);
        }
      }
    } catch (err) {
      console.error('Failed to load onboarding status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, []);

  const handleToggleManual = async (key: 'intakeFlowBuilt' | 'goneLive', currentVal: boolean) => {
    setTogglingStep(key);
    try {
      const res = await fetch('/api/tenant/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: key, completed: !currentVal }),
      });
      if (res.ok) {
        await fetchProgress();
      }
    } catch (err) {
      console.error('Error toggling manual onboarding step:', err);
    } finally {
      setTogglingStep(null);
    }
  };

  const handleDismiss = async () => {
    try {
      const res = await fetch('/api/tenant/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'onboardingDismissed', completed: true }),
      });
      if (res.ok) {
        setDismissed(true);
      }
    } catch (err) {
      console.error('Error dismissing onboarding:', err);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#c3c6d7] rounded-xl p-8 flex flex-col items-center justify-center min-h-[200px] animate-pulse">
        <div className="w-8 h-8 border-2 border-[#004ac6] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-[#737686] mt-3">Fetching setup onboarding timeline...</p>
      </div>
    );
  }

  if (dismissed || !status) return null;

  // Find index of first incomplete step to highlight as "Active"
  const activeIndex = STEP_KEYS.findIndex((key) => !status[key]);

  // Render Compact Version
  if (compact) {
    return (
      <div className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative">
        <div className="flex justify-between items-start mb-4 gap-2">
          <div>
            <h4 className="text-md font-bold text-[#1c1b1f]">Setup Onboarding Checklist</h4>
            <p className="text-xs text-[#49454f] mt-0.5">{stepsComplete} of 8 steps completed</p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none p-1 rounded-full hover:bg-slate-100 shrink-0"
            title="Dismiss Onboarding Checklist"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-6">
          <div className="h-full bg-[#004ac6] rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
        </div>

        {/* Dynamic Compact Rows (Show next 3 steps or active/pending ones) */}
        <div className="space-y-3.5">
          {STEP_DETAILS.map((step, idx) => {
            const isCompleted = status[step.key];
            const isActive = idx === activeIndex;

            // Only show completed, active, and the next pending step in compact layout
            if (!isCompleted && !isActive && idx > activeIndex + 1) return null;

            return (
              <div
                key={step.key}
                className={`flex items-start justify-between gap-3 text-xs p-2.5 rounded-lg border transition-all ${
                  isCompleted
                    ? 'bg-[#f9f9ff] border-[#c3c6d7]/40 opacity-60'
                    : isActive
                    ? 'bg-white border-l-4 border-l-[#004ac6] border-[#737686] shadow-sm font-semibold'
                    : 'bg-[#f9f9ff] border-[#c3c6d7]/40 opacity-80'
                }`}
              >
                <div className="flex gap-2.5 items-start">
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <span className="material-symbols-outlined text-emerald-500 text-[16px] font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    ) : (
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold ${
                        isActive ? 'border-[#004ac6] text-[#004ac6]' : 'border-slate-400 text-slate-500'
                      }`}>{idx + 1}</span>
                    )}
                  </div>
                  <span className={isCompleted ? 'line-through text-slate-400 font-normal' : 'text-[#1c1b1f]'}>
                    {step.title}
                  </span>
                </div>

                {!isCompleted && (
                  step.manual ? (
                    <button
                      onClick={() => handleToggleManual(step.key as 'intakeFlowBuilt' | 'goneLive', false)}
                      disabled={togglingStep === step.key}
                      className="px-2 py-0.5 bg-white border border-[#737686] hover:bg-slate-50 rounded text-[9px] font-bold transition-all"
                    >
                      Complete
                    </button>
                  ) : (
                    <Link href={step.link} className="px-2 py-0.5 bg-[#004ac6] text-white rounded text-[9px] font-bold hover:brightness-105 transition-all">
                      Start
                    </Link>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render Full View
  return (
    <div className="max-w-[620px] mx-auto py-8">
      {/* Header Section */}
      <section className="mb-10 text-center space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1c1b1f]">Let&apos;s get you set up</h1>
        <div className="space-y-2">
          <div className="flex justify-between items-end text-sm">
            <span className="text-xs font-bold text-[#49454f] uppercase tracking-wider">Workspace Onboarding Progress</span>
            <span className="font-bold text-[#1c1b1f]">{stepsComplete} of 8 steps complete</span>
          </div>
          <div className="w-full h-3 bg-[#e7eeff] rounded-full overflow-hidden">
            <div className="h-full bg-[#004ac6] rounded-full transition-all duration-700 ease-out" style={{ width: `${percent}%` }}></div>
          </div>
        </div>
      </section>

      {/* Checklist items list */}
      <div className="space-y-4">
        {STEP_DETAILS.map((step, idx) => {
          const isCompleted = status[step.key];
          const isActive = idx === activeIndex;

          return (
            <div
              key={step.key}
              className={`flex items-start justify-between p-5 border rounded-xl transition-all duration-200 ${
                isCompleted
                  ? 'bg-[#f9f9ff]/60 border-[#c3c6d7] opacity-60 scale-98'
                  : isActive
                  ? 'relative bg-white border-l-4 border-l-[#004ac6] border-y border-r border-[#737686] step-active-glow scale-[1.01] shadow-sm'
                  : 'bg-white border-[#c3c6d7] opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-start gap-4 mr-4">
                <div className="mt-1 shrink-0 flex items-center justify-center">
                  {isCompleted ? (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-600">
                      <span className="material-symbols-outlined text-[18px] font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    </div>
                  ) : (
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                      isActive ? 'border-[#004ac6] text-[#004ac6]' : 'border-slate-300 text-slate-400'
                    }`}>
                      {idx + 1}
                    </div>
                  )}
                </div>

                <div className="space-y-0.5 text-left">
                  <h3 className={`text-sm font-bold flex items-center gap-1.5 ${
                    isCompleted ? 'line-through text-slate-400 font-normal' : 'text-[#1c1b1f]'
                  }`}>
                    <span>{step.title}</span>
                    {step.key === 'goneLive' && (
                      <span className="text-sm">🚀</span>
                    )}
                  </h3>
                  <p className="text-xs text-[#49454f] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="shrink-0">
                {isCompleted ? (
                  step.manual ? (
                    <button
                      onClick={() => handleToggleManual(step.key as 'intakeFlowBuilt' | 'goneLive', true)}
                      disabled={togglingStep === step.key}
                      className="text-xs font-semibold text-[#004ac6] hover:underline px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Undo
                    </button>
                  ) : (
                    <Link href={step.link} className="text-xs font-semibold text-[#004ac6] hover:underline px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                      Edit
                    </Link>
                  )
                ) : (
                  step.manual ? (
                    <button
                      onClick={() => handleToggleManual(step.key as 'intakeFlowBuilt' | 'goneLive', false)}
                      disabled={togglingStep === step.key}
                      className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
                        isActive
                          ? 'bg-[#004ac6] text-white hover:brightness-105 shadow shadow-[#004ac6]/10'
                          : 'bg-white border border-[#737686] text-[#1c1b1f] hover:bg-slate-50'
                      }`}
                    >
                      {togglingStep === step.key ? 'Loading...' : 'Complete'}
                    </button>
                  ) : (
                    <Link
                      href={step.link}
                      className={`inline-block px-5 py-2 text-xs font-bold rounded-lg transition-all text-center ${
                        isActive
                          ? 'bg-[#004ac6] text-white hover:brightness-105 shadow shadow-[#004ac6]/10'
                          : 'bg-white border border-[#737686] text-[#1c1b1f] hover:bg-slate-50'
                      }`}
                    >
                      Start
                    </Link>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Support Footer */}
      <footer className="mt-12 pt-8 border-t border-[#c3c6d7]/60 text-center">
        <p className="text-xs text-[#49454f] mb-4">Need help setting up your assistant?</p>
        <div className="flex justify-center gap-8">
          <Link className="flex items-center gap-1.5 text-xs font-bold text-[#004ac6] hover:underline" href="/dashboard/ai-bot">
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            <span>Read Docs & Guide</span>
          </Link>
          <Link className="flex items-center gap-1.5 text-xs font-bold text-[#004ac6] hover:underline" href="/dashboard/inbox">
            <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
            <span>Chat with Support</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
