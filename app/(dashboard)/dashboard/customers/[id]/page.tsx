'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
}

interface Policy {
  id: string;
  policyNumber: string;
  effectiveDate: string;
  expiryDate: string;
  status: string;
  policyCatalog: {
    name: string;
    sumInsured: number;
    premiumMin: number;
  };
}

interface Lead {
  id: string;
  status: string;
  source: string;
  intakeAnswers: any;
  intakeAge: number | null;
  intakeState: string | null;
  intakeHealthConditions: any;
  intakeBudgetMin: number | null;
  intakeBudgetMax: number | null;
  intakeFamilySize: number | null;
  assignedAgent?: {
    id: string;
    email: string;
  } | null;
}

interface Customer {
  id: string;
  displayName: string;
  primaryPhone: string;
  email: string | null;
  location: string | null;
  tags: string[];
  otpVerified: boolean;
  optedIn: boolean;
  optedInAt: string | null;
  createdAt: string;
  activePolicy?: Policy | null;
  policies: Policy[];
  leads: Lead[];
  notes: {
    id: string;
    content: string;
    createdAt: string;
    user: {
      email: string;
    };
  }[];
}

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  meta?: string;
  icon: string;
  iconColor: string;
}

export default function CustomerProfilePage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const customerId = params.id;

  // UI state
  const [activeTab, setActiveTab] = useState<'timeline' | 'intake' | 'policies' | 'notes'>('timeline');
  const [noteContent, setNoteContent] = useState('');
  const [whatsappContent, setWhatsappContent] = useState('');

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isWhatsappModalOpen, setIsWhatsappModalOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionSuccess, setDeletionSuccess] = useState(false);

  // Queries
  const { data: profileData, isLoading, error } = useQuery<{ customer: Customer; timeline: TimelineEvent[] }>({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/customers/${customerId}`);
      if (!res.ok) throw new Error('Failed to load customer profile');
      return res.json();
    },
  });

  const { data: agents = [] } = useQuery<User[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/leads/agents');
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Mutations
  const actionMutation = useMutation({
    mutationFn: async (payload: { action: string; value: any }) => {
      const res = await fetch(`/api/dashboard/customers/${customerId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Action failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      setIsWhatsappModalOpen(false);
      setWhatsappContent('');
      setSendError(null);
    },
    onError: (err: Error) => {
      setSendError(err.message);
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/dashboard/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      setNoteContent('');
      setIsNoteModalOpen(false);
    },
  });

  const deleteDataMutation = useMutation({
    mutationFn: async () => {
      setIsDeleting(true);
      const res = await fetch(`/api/dashboard/customers/${customerId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to purge data');
      return res.json();
    },
    onSuccess: () => {
      setIsDeleting(false);
      setDeletionSuccess(true);
    },
    onError: () => {
      setIsDeleting(false);
    }
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f9f9ff]">
        <div className="text-center space-y-2">
          <span className="material-symbols-outlined text-[32px] text-[#004ac6] animate-spin">sync</span>
          <p className="text-xs text-[#49454f] font-bold">Loading Customer 360° Profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f9f9ff] p-6 text-center">
        <div className="max-w-md space-y-4">
          <span className="material-symbols-outlined text-[48px] text-red-500">error</span>
          <h3 className="font-extrabold text-sm text-[#1c1b1f]">Failed to Load Profile</h3>
          <p className="text-xs text-[#49454f]">The customer profile could not be loaded or may not exist.</p>
          <Link href="/dashboard/customers" className="inline-block px-4 py-2 bg-[#004ac6] text-white rounded-xl text-xs font-bold">
            Back to Customers Directory
          </Link>
        </div>
      </div>
    );
  }

  if (deletionSuccess) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f9f9ff] p-6 text-center">
        <div className="max-w-md bg-white border border-[#c3c6d7] p-8 rounded-3xl shadow-xl space-y-4">
          <span className="material-symbols-outlined text-[64px] text-emerald-600">verified</span>
          <h3 className="font-extrabold text-lg text-[#1c1b1f]">PII Purged Successfully</h3>
          <p className="text-xs text-[#49454f]">
            The customer records have been fully anonymized in compliance with Data Deletion requests. PII attributes have been scrubbed.
          </p>
          <Link href="/dashboard/customers" className="inline-block px-5 py-2 bg-[#004ac6] text-white rounded-xl text-xs font-bold">
            Back to Customers Directory
          </Link>
        </div>
      </div>
    );
  }

  const { customer, timeline } = profileData;
  const notes = customer.notes || [];
  const initials = customer.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const activeLead = customer.leads[0] || null;

  // Countdown calculations
  const calculateCountdownDays = (expiryStr: string) => {
    const expiry = new Date(expiryStr);
    const diff = expiry.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f9f9ff] overflow-y-auto">
      {/* Sub header navigation bar */}
      <header className="sticky top-0 z-20 bg-white border-b border-[#c3c6d7] h-16 flex items-center justify-between px-8 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/customers" className="text-slate-400 hover:text-[#004ac6] transition-colors flex items-center">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <h2 className="text-[16px] font-extrabold tracking-tight text-[#1c1b1f]">
            Customer 360° Profile
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-extrabold">Active Status:</span>
          <span className={`px-3 py-1 rounded-full text-[9px] font-extrabold uppercase ${customer.optedIn ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
            {customer.optedIn ? 'WhatsApp Opted-In' : 'Consent Pending'}
          </span>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 p-8 max-w-[1250px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column - Profile and Tabs (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Header Customer Info Card */}
          <div className="bg-white rounded-2xl border border-[#c3c6d7] p-6 shadow-sm flex items-start gap-5">
            <div className="w-16 h-16 rounded-full bg-[#004ac6]/10 text-[#004ac6] flex items-center justify-center font-bold text-xl shrink-0 border border-[#004ac6]/10">
              {initials}
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <h3 className="text-lg font-bold text-[#1c1b1f]">{customer.displayName}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500 text-xs font-semibold mt-1">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">phone</span>
                    {customer.primaryPhone}
                  </span>
                  {customer.email && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">mail</span>
                      {customer.email}
                    </span>
                  )}
                  {customer.location && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">location_on</span>
                      {customer.location}
                    </span>
                  )}
                </div>
              </div>

              {/* Tags Row */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {customer.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 bg-[#e7eeff] border border-[#dbe1ff] rounded-full text-[9px] font-bold text-[#004ac6] uppercase tracking-wide"
                  >
                    {tag}
                  </span>
                ))}
                {activeLead && (
                  <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 rounded-full text-[9px] font-bold text-indigo-700 uppercase tracking-wide">
                    Lead: {activeLead.status}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic tabs list */}
          <div className="border-b border-[#c3c6d7] flex gap-6 text-xs font-bold text-[#49454f]">
            {(['timeline', 'intake', 'policies', 'notes'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 relative capitalize ${
                  activeTab === tab ? 'text-[#004ac6]' : 'hover:text-slate-900'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#004ac6] rounded-full animate-in fade-in duration-200" />
                )}
              </button>
            ))}
          </div>

          {/* Tabs Content */}
          <div className="min-h-[400px]">
            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
              <div className="space-y-6 pt-2 pl-4 relative border-l border-[#c3c6d7]/60 ml-3">
                {timeline.map((event) => (
                  <div key={event.id} className="relative pl-6 group">
                    {/* Event Type Icon Marker */}
                    <div className={`absolute -left-[15px] top-0.5 w-7 h-7 rounded-full flex items-center justify-center border shadow-sm shrink-0 border-white ${event.iconColor}`}>
                      <span className="material-symbols-outlined text-[14px] font-bold">{event.icon}</span>
                    </div>

                    {/* Content */}
                    <div className="space-y-1 bg-white p-4 border border-[#c3c6d7] rounded-2xl shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-xs text-[#1c1b1f]">{event.title}</h4>
                        <span className="text-[9px] text-[#737686] font-bold">
                          {new Date(event.timestamp).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-[#49454f] font-semibold leading-relaxed whitespace-pre-wrap">{event.description}</p>
                      {event.meta && (
                        <p className="text-[10px] text-slate-500 italic font-semibold">{event.meta}</p>
                      )}
                    </div>
                  </div>
                ))}

                {timeline.length === 0 && (
                  <div className="text-center p-8 text-slate-500 text-xs font-semibold">
                    No activity logs recorded.
                  </div>
                )}
              </div>
            )}

            {/* Intake Answers Tab */}
            {activeTab === 'intake' && (
              <div className="space-y-4 pt-2">
                {(!activeLead || (!activeLead.intakeAnswers && !activeLead.intakeAge && !activeLead.intakeState && !activeLead.intakeFamilySize)) ? (
                  <div className="bg-white border border-[#c3c6d7] p-6 rounded-2xl text-center text-xs text-slate-500 font-semibold">
                    No intake data registered for this customer.
                  </div>
                ) : (
                  <>
                    {activeLead.intakeAnswers && Object.keys(activeLead.intakeAnswers).length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(activeLead.intakeAnswers as Record<string, any>).map(([q, a]) => (
                          <div key={q} className="bg-white border border-[#c3c6d7] p-4 rounded-2xl shadow-sm space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Question</span>
                            <p className="text-xs font-bold text-[#1c1b1f]">{q}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block pt-2">Answer</span>
                            <p className="text-xs font-semibold text-[#004ac6]">{String(a)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Additional metadata metrics */}
                {activeLead && (
                  <div className="bg-slate-50 border border-[#c3c6d7] p-4 rounded-xl space-y-2 text-xs">
                    <span className="font-bold text-[#1c1b1f] uppercase text-[9px] tracking-wider block">Intake Parameters</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-slate-400 text-[9px] block">Age</span>
                        <span className="font-bold text-[#1c1b1f]">{activeLead.intakeAge || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] block">State</span>
                        <span className="font-bold text-[#1c1b1f]">{activeLead.intakeState || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] block">Family Size</span>
                        <span className="font-bold text-[#1c1b1f]">{activeLead.intakeFamilySize || '—'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Policies Tab */}
            {activeTab === 'policies' && (
              <div className="space-y-4 pt-2">
                {customer.policies.map((pol) => (
                  <div key={pol.id} className="bg-white border border-[#c3c6d7] p-5 rounded-2xl shadow-sm flex justify-between items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#004ac6] text-[18px]">verified_user</span>
                        <h4 className="font-bold text-xs text-[#1c1b1f]">{pol.policyCatalog.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${pol.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800'}`}>
                          {pol.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-semibold text-slate-500">
                        <div>Policy Number: <span className="text-[#1c1b1f] font-bold">{pol.policyNumber}</span></div>
                        <div>Sum Insured: <span className="text-[#1c1b1f] font-bold">${(pol.policyCatalog.sumInsured / 100).toLocaleString()}</span></div>
                        <div>Effective: <span className="text-[#1c1b1f]">{new Date(pol.effectiveDate).toLocaleDateString()}</span></div>
                        <div>Expiry: <span className="text-[#1c1b1f]">{new Date(pol.expiryDate).toLocaleDateString()}</span></div>
                      </div>
                    </div>
                    <button
                      onClick={() => showNotification('success', 'Document download simulation started...')}
                      className="px-3 py-1.5 border border-[#c3c6d7] hover:bg-slate-50 text-[10px] font-bold rounded-lg flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[12px]">download</span>
                      Download PDF
                    </button>
                  </div>
                ))}

                {customer.policies.length === 0 && (
                  <div className="bg-white border border-[#c3c6d7] p-6 rounded-2xl text-center text-xs text-slate-500 font-semibold">
                    No active or historical policies recorded.
                  </div>
                )}
              </div>
            )}

            {/* Notes Tab */}
            {activeTab === 'notes' && (
              <div className="space-y-4 pt-2">
                {/* Notes Input composer */}
                <div className="bg-white border border-[#c3c6d7] p-4 rounded-2xl shadow-sm space-y-2">
                  <textarea
                    rows={3}
                    placeholder="Write a custom agent note..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-[#c3c6d7] rounded-xl px-3 py-2 focus:outline-none focus:border-[#004ac6] font-semibold"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => createNoteMutation.mutate(noteContent)}
                      disabled={createNoteMutation.isPending || !noteContent.trim()}
                      className="px-4 py-1.5 bg-[#004ac6] hover:bg-[#003ca0] text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                    >
                      {createNoteMutation.isPending ? 'Saving...' : 'Add Note'}
                    </button>
                  </div>
                </div>

                {/* Notes Feed */}
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-white border border-[#c3c6d7] p-4 rounded-2xl shadow-sm space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-[#004ac6]">{note.user?.email ?? 'Deleted user'}</span>
                        <span className="text-[#737686]">
                          {new Date(note.createdAt).toLocaleDateString()} at {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-[#1c1b1f] font-semibold whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))}

                  {notes.length === 0 && (
                    <div className="text-center p-8 text-slate-400 text-xs font-semibold">
                      No agent notes recorded.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Policies Card, Actions & Data Privacy (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Active Policies Card */}
          {customer.activePolicy ? (
            <div className="bg-white rounded-2xl border border-[#c3c6d7] p-5 shadow-sm space-y-4">
              <h4 className="font-extrabold text-[10px] text-[#49454f] uppercase tracking-wide border-b border-slate-100 pb-1.5">
                Active Policy
              </h4>
              <div className="space-y-3">
                <div>
                  <p className="font-extrabold text-xs text-[#1c1b1f]">{customer.activePolicy.policyCatalog.name}</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Policy #: {customer.activePolicy.policyNumber}</p>
                </div>

                {/* Renewal Date Countdown */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-500">Days to Renewal</span>
                    <span className="text-[#004ac6]">{calculateCountdownDays(customer.activePolicy.expiryDate)} days remaining</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${calculateCountdownDays(customer.activePolicy.expiryDate) < 30 ? 'bg-rose-500' : 'bg-[#004ac6]'}`} 
                      style={{ width: `${Math.min(100, (calculateCountdownDays(customer.activePolicy.expiryDate) / 365) * 100)}%` }} 
                    />
                  </div>
                </div>

                <div className="flex justify-between text-xs font-semibold text-[#1c1b1f] pt-1">
                  <span>Premium:</span>
                  <span className="font-bold">${(customer.activePolicy.policyCatalog.premiumMin / 100).toFixed(2)}/yr</span>
                </div>

                <button 
                  onClick={() => showNotification('success', 'Document download simulation started...')}
                  className="w-full text-center text-xs font-bold text-[#004ac6] hover:underline flex items-center justify-center gap-1 pt-1"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Download Document
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#c3c6d7] p-5 shadow-sm text-center text-slate-400 text-xs font-semibold">
              No active policy currently registered.
            </div>
          )}

          {/* Quick Actions Panel */}
          <div className="bg-white rounded-2xl border border-[#c3c6d7] p-5 shadow-sm space-y-4">
            <h4 className="font-extrabold text-[10px] text-[#49454f] uppercase tracking-wide border-b border-slate-100 pb-1.5">
              Quick Actions
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              
              <button
                onClick={() => setIsNoteModalOpen(true)}
                className="w-full px-4 py-2 border border-[#c3c6d7] hover:bg-slate-50 text-xs font-bold text-[#1c1b1f] rounded-xl flex items-center gap-2.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] text-slate-500">add_comment</span>
                Add Note
              </button>

              <button
                onClick={() => setIsWhatsappModalOpen(true)}
                className="w-full px-4 py-2 border border-[#c3c6d7] hover:bg-slate-50 text-xs font-bold text-[#1c1b1f] rounded-xl flex items-center gap-2.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] text-slate-500">chat</span>
                Send WhatsApp Message
              </button>

              {/* Move Stage dropdown menu */}
              {activeLead && (
                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <span className="text-[9px] font-bold text-[#737686] uppercase tracking-wide">Move Stage</span>
                  <select
                    value={activeLead.status}
                    onChange={(e) => actionMutation.mutate({ action: 'move_stage', value: e.target.value })}
                    disabled={actionMutation.isPending}
                    className="w-full bg-slate-50 border border-[#c3c6d7] rounded-xl px-3 py-2 text-xs font-bold text-[#1c1b1f] focus:outline-none"
                  >
                    <option value="NEW">New Lead</option>
                    <option value="INTAKE_IN_PROGRESS">Intake In Progress</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="NEGOTIATION">Negotiation</option>
                    <option value="CONVERTED">Won/Converted</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
              )}

              {/* Assign Agent dropdown menu */}
              {activeLead && (
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-[#737686] uppercase tracking-wide">Assign Agent</span>
                  <select
                    value={activeLead.assignedAgent?.id || ''}
                    onChange={(e) => actionMutation.mutate({ action: 'assign_agent', value: e.target.value })}
                    disabled={actionMutation.isPending}
                    className="w-full bg-slate-50 border border-[#c3c6d7] rounded-xl px-3 py-2 text-xs font-bold text-[#1c1b1f] focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => showNotification('success', 'Task created: Follow-up call logged')}
                className="w-full px-4 py-2 border border-[#c3c6d7] hover:bg-slate-50 text-xs font-bold text-[#1c1b1f] rounded-xl flex items-center gap-2.5 transition-colors pt-2.5 border-t border-slate-100"
              >
                <span className="material-symbols-outlined text-[16px] text-slate-500">task_alt</span>
                Create Task
              </button>
            </div>
          </div>

          {/* Data & Privacy Compliance block */}
          <div className="bg-white rounded-2xl border border-[#c3c6d7] p-5 shadow-sm space-y-3">
            <h4 className="font-extrabold text-[10px] text-[#49454f] uppercase tracking-wide border-b border-slate-100 pb-1.5">
              Data & Privacy
            </h4>
            <div className="space-y-3 text-[11px] font-semibold text-[#49454f]">
              <div className="flex justify-between">
                <span>Consent Given:</span>
                <span className="font-bold text-[#1c1b1f]">
                  {customer.optedInAt ? new Date(customer.optedInAt).toLocaleDateString() : 'Pending'}
                </span>
              </div>
              <p className="text-[10px] text-[#737686] leading-relaxed">
                Subject rights: You can remove all customer details and scrubbing dynamic variables by triggering compliance purging.
              </p>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to request data deletion? This will scrub customer PII data.')) {
                    deleteDataMutation.mutate();
                  }
                }}
                disabled={isDeleting}
                className="text-[10px] font-extrabold text-red-600 hover:text-red-700 active:scale-95 transition-all text-left flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
                {isDeleting ? 'Deleting...' : 'Request Data Deletion'}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* QUICK ACTIONS MODALS */}
      {/* 1. Add Note Dialog */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#c3c6d7] rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#1c1b1f]">Add Agent Note</span>
              <button onClick={() => setIsNoteModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <textarea
              rows={4}
              placeholder="Type your notes..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-[#c3c6d7] rounded-xl p-3 focus:outline-none focus:border-[#004ac6]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsNoteModalOpen(false)}
                className="px-4 py-2 border border-[#c3c6d7] rounded-xl text-xs font-bold text-[#49454f]"
              >
                Cancel
              </button>
              <button
                onClick={() => createNoteMutation.mutate(noteContent)}
                disabled={createNoteMutation.isPending || !noteContent.trim()}
                className="px-5 py-2 bg-[#004ac6] text-white rounded-xl text-xs font-bold shadow-md"
              >
                {createNoteMutation.isPending ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Send Message Dialog */}
      {isWhatsappModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#c3c6d7] rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#1c1b1f]">Send WhatsApp Message</span>
              <button onClick={() => { setIsWhatsappModalOpen(false); setSendError(null); }} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="text-[10px] text-slate-500 font-semibold">
              Sending to: <span className="font-bold text-[#1c1b1f]">{customer.displayName}</span> (+{customer.primaryPhone})
            </div>
            <textarea
              rows={4}
              placeholder="Type your outbound message..."
              value={whatsappContent}
              onChange={(e) => setWhatsappContent(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-[#c3c6d7] rounded-xl p-3 focus:outline-none focus:border-[#004ac6]"
            />
            {sendError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                <span className="material-symbols-outlined text-rose-600 text-[16px] shrink-0 mt-0.5">warning</span>
                <p className="text-[10px] font-semibold text-rose-700">{sendError}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setIsWhatsappModalOpen(false); setSendError(null); }}
                className="px-4 py-2 border border-[#c3c6d7] rounded-xl text-xs font-bold text-[#49454f]"
              >
                Cancel
              </button>
              <button
                onClick={() => { setSendError(null); actionMutation.mutate({ action: 'send_message', value: whatsappContent }); }}
                disabled={actionMutation.isPending || !whatsappContent.trim()}
                className="px-5 py-2 bg-[#004ac6] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">send</span>
                {actionMutation.isPending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Notification alerts helper
function showNotification(type: 'success' | 'error', message: string) {
  const alertEl = document.createElement('div');
  alertEl.className = `fixed top-4 right-6 px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-2 border font-bold text-xs ${
    type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800' : 'bg-rose-50 border-rose-250 text-rose-800'
  }`;
  alertEl.innerHTML = `<span class="material-symbols-outlined text-[18px]">${type === 'success' ? 'check_circle' : 'warning'}</span> ${message}`;
  document.body.appendChild(alertEl);
  setTimeout(() => alertEl.remove(), 4000);
}
