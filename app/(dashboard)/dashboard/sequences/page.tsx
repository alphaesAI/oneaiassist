'use client';

import { useState, useEffect } from 'react';
import { 
  Zap, 
  Plus, 
  Play, 
  Pause, 
  Clock, 
  Send, 
  CheckCircle2, 
  Users, 
  Layers, 
  ArrowRight,
  Sparkles,
  RefreshCw,
  Tag
} from 'lucide-react';

interface SequenceStep {
  id: string;
  type: 'DELAY' | 'SEND_TEMPLATE' | 'WAIT_REPLY' | 'ASSIGN_TAG';
  delayDays?: number;
  templateName?: string;
  tagName?: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT';
  stepsCount: number;
  enrolledCount: number;
  completedCount: number;
  createdAt: string;
  steps: SequenceStep[];
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [newSeqDesc, setNewSeqDesc] = useState('');
  const [newSeqTrigger, setNewSeqTrigger] = useState('Lead Created');
  const [submitting, setSubmitting] = useState(false);
  const [selectedSeq, setSelectedSeq] = useState<Sequence | null>(null);

  const fetchSequences = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sequences');
      const data = await res.json();
      if (data.sequences) {
        setSequences(data.sequences);
      }
    } catch (err) {
      console.error('Failed to fetch sequences:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSequences();
  }, []);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      // Optimistic update
      setSequences((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: nextStatus } : s))
      );
      await fetch('/api/sequences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
    } catch (err) {
      console.error('Failed to toggle status:', err);
      fetchSequences();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeqName.trim()) return;
    try {
      setSubmitting(true);
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSeqName,
          description: newSeqDesc,
          trigger: newSeqTrigger,
        }),
      });
      const data = await res.json();
      if (data.sequence) {
        setSequences((prev) => [data.sequence, ...prev]);
        setIsModalOpen(false);
        setNewSeqName('');
        setNewSeqDesc('');
      }
    } catch (err) {
      console.error('Failed to create sequence:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const totalEnrolled = sequences.reduce((acc, s) => acc + s.enrolledCount, 0);
  const totalCompleted = sequences.reduce((acc, s) => acc + s.completedCount, 0);
  const activeCount = sequences.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-emerald-500" />
            WhatsApp Drip Sequences
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Automate multi-step lead nurture workflows, follow-ups, and policy welcome campaigns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSequences}
            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition shadow-lg shadow-emerald-500/20"
          >
            <Plus className="h-4 w-4" />
            Create Sequence
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Workflows</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{activeCount} / {sequences.length}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
            <Zap className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Leads Enrolled</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{totalEnrolled.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completions</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{totalCompleted.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-purple-500/10 rounded-lg text-purple-500">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Engine Status</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1 flex items-center gap-1.5 text-base">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Operational
            </p>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-lg text-amber-500">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Sequence List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-500" />
            Configured Automation Sequences
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing {sequences.length} sequence{sequences.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-emerald-500" />
            <p className="text-sm">Loading drip sequences...</p>
          </div>
        ) : sequences.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <Zap className="h-10 w-10 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-base font-medium text-slate-900 dark:text-white">No active drip sequences</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Create your first automated WhatsApp sequence to engage incoming insurance leads instantly.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" />
              Create First Sequence
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {sequences.map((seq) => (
              <div
                key={seq.id}
                className="p-5 hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {seq.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        seq.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {seq.status === 'ACTIVE' ? <Play className="h-3 w-3 fill-current" /> : <Pause className="h-3 w-3 fill-current" />}
                      {seq.status}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      Trigger: {seq.trigger}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {seq.description}
                  </p>

                  {/* Flow preview steps */}
                  <div className="flex items-center gap-2 pt-1 overflow-x-auto text-xs text-slate-500 dark:text-slate-400">
                    {seq.steps.map((step, idx) => (
                      <div key={step.id || idx} className="flex items-center gap-2 shrink-0">
                        {idx > 0 && <ArrowRight className="h-3 w-3 text-slate-400" />}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300">
                          {step.type === 'SEND_TEMPLATE' && <Send className="h-3 w-3 text-emerald-500" />}
                          {step.type === 'DELAY' && <Clock className="h-3 w-3 text-amber-500" />}
                          {step.type === 'ASSIGN_TAG' && <Tag className="h-3 w-3 text-blue-500" />}
                          {step.type === 'SEND_TEMPLATE' ? step.templateName : step.type === 'DELAY' ? `${step.delayDays}d Delay` : step.tagName || step.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Enrolled / Done</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {seq.enrolledCount} / {seq.completedCount}
                    </p>
                  </div>

                  <button
                    onClick={() => toggleStatus(seq.id, seq.status)}
                    className={`p-2 rounded-lg border transition ${
                      seq.status === 'ACTIVE'
                        ? 'border-amber-200 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                        : 'border-emerald-200 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                    }`}
                    title={seq.status === 'ACTIVE' ? 'Pause Sequence' : 'Activate Sequence'}
                  >
                    {seq.status === 'ACTIVE' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for creating a new sequence */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-emerald-500" />
                Create Drip Sequence
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Sequence Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Medicare Lead Nurture"
                  value={newSeqName}
                  onChange={(e) => setNewSeqName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Briefly describe the target audience and cadence..."
                  value={newSeqDesc}
                  onChange={(e) => setNewSeqDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Trigger Event
                </label>
                <select
                  value={newSeqTrigger}
                  onChange={(e) => setNewSeqTrigger(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Lead Created">Lead Created</option>
                  <option value="Quote Issued">Quote Issued</option>
                  <option value="Form Submitted">Form Submitted</option>
                  <option value="Checkout Completed">Checkout Completed</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Save & Launch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
