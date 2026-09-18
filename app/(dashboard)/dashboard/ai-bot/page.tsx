'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

import BotIdentityTab from '@/components/bot-identity-tab';
import BotKnowledgeRagTab from '@/components/bot-knowledge-rag-tab';
import BotGuardrailsTab from '@/components/bot-guardrails-tab';
import BotEscalationTab from '@/components/bot-escalation-tab';
import BotCatalogTab from '@/components/bot-catalog-tab';
import BotSandboxTab from '@/components/bot-sandbox-tab';
import BotHistoryTab from '@/components/bot-history-tab';

import { 
  Bot, 
  Workflow, 
  BookOpen, 
  Headphones, 
  ShieldCheck, 
  Package, 
  Play, 
  History,
  Sparkles,
  Plus,
  Trash2,
  Sliders,
  CheckCircle2
} from 'lucide-react';

type TabType =
  | 'identity'
  | 'intake'
  | 'knowledge'
  | 'escalation'
  | 'guardrails'
  | 'catalog'
  | 'sandbox'
  | 'history';

interface Question {
  id: string;
  title: string;
  text: string;
  type: 'text' | 'multiple-choice' | 'number' | 'date' | 'email';
  required: boolean;
  options: string[];
}

export default function AiBotPage() {
  const [activeTab, setActiveTab] = useState<TabType>('identity');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as TabType;
      if (
        tabParam &&
        [
          'identity',
          'intake',
          'knowledge',
          'escalation',
          'guardrails',
          'catalog',
          'sandbox',
          'history',
        ].includes(tabParam)
      ) {
        setActiveTab(tabParam);
      }
    }
  }, []);

  interface DynamicQuestionItem {
    id: string;
    stepOrder: number;
    fieldKey: string;
    questionPrompt: string;
    validationType: 'NUMBER' | 'US_STATE' | 'CURRENCY' | 'ENUM' | 'PHONE' | 'EMAIL' | 'DATE' | 'TEXT';
    isMandatory: boolean;
    isSkippable: boolean;
    options?: any;
    isActive: boolean;
  }

  const [dynamicQuestions, setDynamicQuestions] = useState<DynamicQuestionItem[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [showSimulator, setShowSimulator] = useState(false);
  const [isSavingIntake, setIsSavingIntake] = useState(false);
  const [intakeSavedSuccess, setIntakeSavedSuccess] = useState(false);

  useEffect(() => {
    async function loadDynamicQuestions() {
      try {
        const res = await fetch('/api/admin/intake-questions');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.questions) && data.questions.length > 0) {
            setDynamicQuestions(data.questions);
            setSelectedQuestionId(data.questions[0].id);
          }
        }
      } catch (err) {
        console.warn('Failed to load dynamic intake questions:', err);
      }
    }
    loadDynamicQuestions();
  }, []);

  const saveIntakeFlow = async () => {
    setIsSavingIntake(true);
    try {
      const selected = dynamicQuestions.find((q) => q.id === selectedQuestionId);
      if (selected) {
        await fetch('/api/admin/intake-questions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selected),
        });
      }
      setIntakeSavedSuccess(true);
      setTimeout(() => setIntakeSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save dynamic intake question:', err);
    } finally {
      setIsSavingIntake(false);
    }
  };

  const selectedDynamicQ =
    dynamicQuestions.find((q) => q.id === selectedQuestionId) || dynamicQuestions[0] || {
      id: '',
      stepOrder: 1,
      fieldKey: 'age',
      questionPrompt: '',
      validationType: 'NUMBER',
      isMandatory: true,
      isSkippable: false,
      isActive: true,
      options: null,
    };

  const updateSelectedDynamicQ = (field: keyof DynamicQuestionItem, value: any) => {
    setDynamicQuestions((prev) =>
      prev.map((q) => (q.id === selectedQuestionId ? { ...q, [field]: value } : q))
    );
  };

  const addQuestionNode = async () => {
    try {
      const newStep = dynamicQuestions.length + 1;
      const res = await fetch('/api/admin/intake-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldKey: `custom_field_${newStep}`,
          questionPrompt: `Please enter your details for step ${newStep}:`,
          validationType: 'TEXT',
          stepOrder: newStep,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          setDynamicQuestions([...dynamicQuestions, data.question]);
          setSelectedQuestionId(data.question.id);
        }
      }
    } catch (err) {
      console.error('Failed to add dynamic question:', err);
    }
  };

  const deleteQuestionNode = async (id: string) => {
    if (dynamicQuestions.length <= 1) return;
    try {
      await fetch(`/api/admin/intake-questions?id=${id}`, { method: 'DELETE' });
      const filtered = dynamicQuestions.filter((q) => q.id !== id);
      setDynamicQuestions(filtered);
      if (selectedQuestionId === id) {
        setSelectedQuestionId(filtered[0]?.id || '');
      }
    } catch (err) {
      console.error('Failed to delete question:', err);
    }
  };

  const navTabs = [
    { id: 'identity' as const, label: 'Identity & Model Tuning', icon: Bot },
    { id: 'intake' as const, label: 'Intake Flow Builder', icon: Workflow },
    { id: 'knowledge' as const, label: 'RAG Knowledge Base', icon: BookOpen },
    { id: 'escalation' as const, label: 'Human Handoff Rules', icon: Headphones },
    { id: 'guardrails' as const, label: 'Safety & Compliance', icon: ShieldCheck },
    { id: 'catalog' as const, label: 'Product Catalog', icon: Package },
    { id: 'sandbox' as const, label: 'RAG AI Sandbox', icon: Play },
    { id: 'history' as const, label: 'Version Audit Trail', icon: History },
  ];

  return (
    <div className="space-y-8 text-left font-sans text-[#1c1b1f]">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#c3c6d7] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#004ac6]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f]">
              AI & Bot Studio
            </h1>
          </div>
          <p className="text-xs text-[#49454f] mt-1">
            Configure agent persona, hyperparameter tuning, interactive WhatsApp intake flows, and human handover rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSimulator(!showSimulator)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2"
          >
            <Play className="w-4 h-4 text-emerald-400" />
            {showSimulator ? 'Close Simulator' : 'WhatsApp Chat Simulator'}
          </button>
        </div>
      </div>

      {/* 8-Tab Secondary Navigation */}
      <div className="flex items-center gap-1 border-b border-[#c3c6d7] overflow-x-auto pb-px scrollbar-none">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                isActive
                  ? 'border-[#004ac6] text-[#004ac6] bg-blue-50/50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#004ac6]' : 'text-gray-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents with Smooth Crossfades */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          {activeTab === 'identity' && <BotIdentityTab />}
          {activeTab === 'knowledge' && <BotKnowledgeRagTab />}
          {activeTab === 'escalation' && <BotEscalationTab />}
          {activeTab === 'guardrails' && <BotGuardrailsTab />}
          {activeTab === 'catalog' && <BotCatalogTab />}
          {activeTab === 'sandbox' && <BotSandboxTab />}
          {activeTab === 'history' && <BotHistoryTab />}

          {/* Tab 2: Intake Flowchart Builder Canvas */}
          {activeTab === 'intake' && (
            <div className="space-y-6">
          <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2">
                <Workflow className="w-5 h-5 text-[#004ac6]" />
                Interactive Visual Intake Flowchart Canvas
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Drag, order, and configure intake question nodes used to qualify inbound leads on WhatsApp.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {intakeSavedSuccess && (
                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl animate-fade-in">
                  ✓ Flow Saved Successfully!
                </span>
              )}
              <button
                type="button"
                onClick={saveIntakeFlow}
                disabled={isSavingIntake}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isSavingIntake ? 'Saving...' : 'Save Intake Flowchart'}
              </button>
              <button
                type="button"
                onClick={addQuestionNode}
                className="px-4 py-2 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                Add Flow Node
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Flowchart Nodes List (2 cols) */}
            <div className="lg:col-span-2 space-y-4">
              {dynamicQuestions.map((q, idx) => {
                const isSelected = q.id === selectedQuestionId;
                return (
                  <div
                    key={q.id || idx}
                    onClick={() => setSelectedQuestionId(q.id)}
                    className={`p-5 rounded-2xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/40 border-[#004ac6] ring-1 ring-[#004ac6]/30 shadow-md'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-[#004ac6] text-white text-xs font-bold rounded-full flex items-center justify-center">
                          {q.stepOrder || idx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-[#1c1b1f]">{q.fieldKey}</h4>
                        {q.isMandatory && (
                          <span className="text-[10px] text-rose-500 font-bold">*Required</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold uppercase rounded-full">
                          {q.validationType}
                        </span>
                        {dynamicQuestions.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteQuestionNode(q.id);
                            }}
                            className="p-1 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 bg-white p-3 rounded-xl border border-slate-200">
                      "{q.questionPrompt}"
                    </p>

                    {q.options && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(Array.isArray(q.options) ? q.options : [String(q.options)]).map((opt: string) => (
                          <span key={opt} className="px-2.5 py-1 bg-white border border-blue-200 text-[#004ac6] text-[10px] font-bold rounded-lg">
                            • {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Node Property Editor Sidebar (1 col) */}
            <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-5 h-fit">
              <h4 className="text-sm font-bold text-[#1B4B91] flex items-center gap-2 border-b border-gray-100 pb-3">
                <Sliders className="w-4 h-4 text-[#004ac6]" />
                Intake Step Editor ({selectedDynamicQ.fieldKey})
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Field Key (Unique DB Identifier)</label>
                  <input
                    type="text"
                    value={selectedDynamicQ.fieldKey}
                    onChange={(e) => updateSelectedDynamicQ('fieldKey', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Question Prompt (WhatsApp Copy)</label>
                  <textarea
                    rows={3}
                    value={selectedDynamicQ.questionPrompt}
                    onChange={(e) => updateSelectedDynamicQ('questionPrompt', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Validation Type</label>
                  <select
                    value={selectedDynamicQ.validationType}
                    onChange={(e) => updateSelectedDynamicQ('validationType', e.target.value as any)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
                  >
                    <option value="NUMBER">Number (Age, Family Size)</option>
                    <option value="US_STATE">US State (50 States & Postal Codes)</option>
                    <option value="CURRENCY">Currency (Monthly Budget, Dollar Ceiling)</option>
                    <option value="ENUM">Enum / Multiple Choice Options</option>
                    <option value="PHONE">Phone Number</option>
                    <option value="EMAIL">Email Address</option>
                    <option value="DATE">Date Picker</option>
                    <option value="TEXT">Free Text</option>
                  </select>
                </div>

                {selectedDynamicQ.validationType === 'ENUM' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Options (comma separated)</label>
                    <input
                      type="text"
                      value={
                        Array.isArray(selectedDynamicQ.options)
                          ? selectedDynamicQ.options.join(', ')
                          : String(selectedDynamicQ.options || '')
                      }
                      onChange={(e) =>
                        updateSelectedDynamicQ(
                          'options',
                          e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                        )
                      }
                      placeholder="e.g. None, Diabetes, Hypertension, Other"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
        </motion.div>
      </AnimatePresence>

      {/* WhatsApp Customer Simulator Drawer */}
      {showSimulator && (
        <div className="fixed bottom-6 right-6 z-50 w-96 bg-white border border-gray-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[520px]">
          <div className="p-4 bg-[#075E54] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center font-bold text-xs">
                AI
              </div>
              <div>
                <p className="text-xs font-bold">PME Health Insurance Assistant</p>
                <p className="text-[10px] text-emerald-200">Online • WhatsApp Verified</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowSimulator(false)} className="text-white hover:text-gray-200">
              ✕
            </button>
          </div>

          <div className="p-4 bg-[#ECE5DD] flex-1 overflow-y-auto space-y-3 text-xs">
            <div className="bg-white p-3 rounded-xl max-w-[85%] shadow-sm text-gray-800">
              <p>Welcome to Prime Marketing Experts! Are you looking to buy or sell health insurance?</p>
            </div>
            <div className="bg-[#DCF8C6] p-3 rounded-xl max-w-[85%] ml-auto shadow-sm text-gray-800 font-medium">
              <p>Looking for individual coverage</p>
            </div>
            <div className="bg-white p-3 rounded-xl max-w-[85%] shadow-sm text-gray-800">
              <p>Great! Based on RAG policy POL-HEALTH-001, our Apex Care Basic Individual plan starts at $50/mo with $0 preventive checkups. Would you like a quote?</p>
            </div>
          </div>

          <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
            <input
              type="text"
              placeholder="Type message to test bot..."
              className="flex-1 px-3 py-2 bg-gray-100 rounded-xl text-xs outline-none"
            />
            <button type="button" className="px-3 py-2 bg-[#075E54] text-white text-xs font-bold rounded-xl">
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
