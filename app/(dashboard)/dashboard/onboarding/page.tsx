import React from 'react';
import OnboardingChecklistWidget from '@/components/onboarding-checklist-widget';

export const metadata = {
  title: 'Onboarding Checklist - OneAIAssist',
  description: 'Complete the setup of your AI-driven WhatsApp support agency.',
};

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="text-left">
        <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f]">
          Agency Setup Checklist
        </h1>
        <p className="text-sm text-[#49454f] mt-1">
          Follow these 8 steps to fully activate your WhatsApp AI assistant, seed catalogs, and go live.
        </p>
      </div>

      {/* Main Checklist Card Container */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 sm:p-8 shadow-sm">
        <OnboardingChecklistWidget compact={false} />
      </div>
    </div>
  );
}
