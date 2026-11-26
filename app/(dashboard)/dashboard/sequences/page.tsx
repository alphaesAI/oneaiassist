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
  Tag,
  Mail,
  GitBranch,
  Moon,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

interface SequenceStep {
  id: string;
  type: 'DELAY' | 'WAIT_DELAY' | 'SEND_TEMPLATE' | 'SEND_WHATSAPP' | 'SEND_EMAIL' | 'BRANCH_CONDITION' | 'ASSIGN_TAG' | 'ADD_TAG' | 'HANDOFF_TO_HUMAN';
  channel?: 'EMAIL' | 'WHATSAPP' | 'INSTAGRAM';
  delayDays?: number;
  delayHours?: number;
  templateId?: string;
  templateName?: string;
  subject?: string;
  tagName?: string;
  conditionType?: string;
  onTrueStepIndex?: number;
  onFalseStepIndex?: number;
}

interface Sequence {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerType?: string;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT';
  stepsCount: number;
  enrolledCount: number;
  completedCount: number;
  frequencyCapDays?: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  createdAt: string;
  steps: SequenceStep[];
}

type BuilderStepType = 'SEND_EMAIL' | 'SEND_WHATSAPP' | 'WAIT_DELAY' | 'ADD_TAG';

interface BuilderStep {
  id: string;
  type: BuilderStepType;
  templateId: string;
  subject: string;
  delayHours: number;
  tagName: string;
}

interface TemplateOption {
  id: string;
  name: string;
  channel: string;
  subject?: string | null;
}

interface ListOption {
  id: string;
  name: string;
}

const newBuilderStep = (type: BuilderStepType = 'SEND_EMAIL'): BuilderStep => ({
  id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  type,
  templateId: '',
  subject: '',
  delayHours: 24,
  tagName: '',
});

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [newSeqDesc, setNewSeqDesc] = useState('');
  const [newSeqTrigger, setNewSeqTrigger] = useState('CONTACT_CREATED');
  const [builderSteps, setBuilderSteps] = useState<BuilderStep[]>([newBuilderStep('SEND_EMAIL')]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [lists, setLists] = useState<ListOption[]>([]);
  const [triggerTag, setTriggerTag] = useState('');
  const [triggerListId, setTriggerListId] = useState('');
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [newFrequencyCap, setNewFrequencyCap] = useState(1);
  const [newQuietStart, setNewQuietStart] = useState('21:00');
  const [newQuietEnd, setNewQuietEnd] = useState('08:00');
  const [submitting, setSubmitting] = useState(false);

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

  // The step builder needs the organization's real templates and lists to choose from.
  useEffect(() => {
    if (!isModalOpen) return;
    setFormError('');
    fetch('/api/dashboard/templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
    fetch('/api/contacts/lists')
      .then((r) => (r.ok ? r.json() : { lists: [] }))
      .then((data) => setLists(Array.isArray(data?.lists) ? data.lists : []))
      .catch(() => setLists([]));
  }, [isModalOpen]);

  const updateStep = (id: string, patch: Partial<BuilderStep>) =>
    setBuilderSteps((prev) => prev.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  const removeStep = (id: string) => setBuilderSteps((prev) => prev.filter((st) => st.id !== id));
  const moveStep = (index: number, direction: -1 | 1) =>
    setBuilderSteps((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const toggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setPageError('');
    try {
      const res = await fetch('/api/sequences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPageError(data.error || 'Could not change the journey status.');
        return;
      }
      setSequences((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: nextStatus } : s))
      );
    } catch (err) {
      console.error('Failed to toggle status:', err);
      setPageError('Could not change the journey status.');
      fetchSequences();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeqName.trim()) return;
    setFormError('');
    try {
      setSubmitting(true);

      // Steps are sent exactly as built: real template IDs, no sample content.
      const steps = builderSteps.map((st) => {
        const tpl = templates.find((t) => t.id === st.templateId);
        if (st.type === 'SEND_EMAIL') {
          return {
            id: st.id,
            type: st.type,
            channel: 'EMAIL',
            templateId: st.templateId,
            templateName: tpl?.name,
            subject: st.subject.trim() || tpl?.subject || undefined,
          };
        }
        if (st.type === 'SEND_WHATSAPP') {
          return { id: st.id, type: st.type, channel: 'WHATSAPP', templateId: st.templateId, templateName: tpl?.name };
        }
        if (st.type === 'WAIT_DELAY') {
          return { id: st.id, type: st.type, delayHours: Number(st.delayHours) };
        }
        return { id: st.id, type: st.type, tagName: st.tagName.trim() };
      });

      const triggerConfig: Record<string, string> = {};
      if (newSeqTrigger === 'TAG_ADDED' && triggerTag.trim()) triggerConfig.tag = triggerTag.trim();
      if (newSeqTrigger === 'LIST_JOINED' && triggerListId) triggerConfig.listId = triggerListId;

      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSeqName,
          description: newSeqDesc,
          trigger: newSeqTrigger,
          triggerConfig,
          steps,
          frequencyCapDays: newFrequencyCap,
          quietHoursStart: newQuietStart,
          quietHoursEnd: newQuietEnd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.sequence) {
        setFormError(data.error || 'Could not create the journey.');
        return;
      }
      setIsModalOpen(false);
      setNewSeqName('');
      setNewSeqDesc('');
      setTriggerTag('');
      setTriggerListId('');
      setBuilderSteps([newBuilderStep('SEND_EMAIL')]);
      fetchSequences();
    } catch (err) {
      console.error('Failed to create sequence:', err);
      setFormError('Could not create the journey.');
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
            <Zap className="h-6 w-6 text-indigo-600" />
            Cross-Channel Automation Journeys
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Build unified multi-touch workflows across <strong>WhatsApp + Email + Instagram</strong> with automated fallbacks, frequency capping, and quiet hours.
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#004ac6] hover:bg-[#003da6] text-white font-bold text-sm transition shadow-lg shadow-blue-500/10"
          >
            <Plus className="h-4 w-4" />
            Create Cross-Channel Journey
          </button>
        </div>
      </div>

      {pageError && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold" role="alert">
          {pageError}
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Journeys</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{activeCount} / {sequences.length}</p>
          </div>
          <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-600">
            <Zap className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contacts Enrolled</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{totalEnrolled.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-xl text-blue-600">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Step Completions</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{totalCompleted.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-purple-500/10 rounded-xl text-purple-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cross-Channel Fallbacks</p>
            <p className="text-sm font-extrabold text-emerald-600 mt-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              WhatsApp &harr; Email Active
            </p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-600">
            <GitBranch className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Sequence List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#004ac6]" />
            Active Cross-Channel Journeys
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing {sequences.length} journey{sequences.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#004ac6]" />
            <p className="text-sm">Loading cross-channel journeys...</p>
          </div>
        ) : sequences.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <Zap className="h-10 w-10 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-base font-medium text-slate-900 dark:text-white">No active journeys</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Create your first automated cross-channel journey to nurture incoming leads across WhatsApp, Email, and Instagram.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#004ac6] hover:bg-[#003da6] text-white text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" />
              Create First Journey
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {seq.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        seq.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {seq.status === 'ACTIVE' ? <Play className="h-2.5 w-2.5 fill-current" /> : <Pause className="h-2.5 w-2.5 fill-current" />}
                      {seq.status}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                      Trigger: {seq.trigger}
                    </span>
                    {seq.frequencyCapDays && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold border border-blue-200 flex items-center gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" /> Max 1 msg / {seq.frequencyCapDays}d
                      </span>
                    )}
                    {seq.quietHoursStart && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold border border-purple-200 flex items-center gap-1">
                        <Moon className="h-2.5 w-2.5" /> Quiet: {seq.quietHoursStart}-{seq.quietHoursEnd}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {seq.description}
                  </p>

                  {/* Cross-Channel Flow preview steps */}
                  <div className="flex items-center gap-2 pt-2 overflow-x-auto text-xs text-slate-500 dark:text-slate-400">
                    {seq.steps.map((step, idx) => (
                      <div key={step.id || idx} className="flex items-center gap-2 shrink-0">
                        {idx > 0 && <ArrowRight className="h-3 w-3 text-slate-400" />}
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-semibold text-xs ${
                          step.type === 'SEND_EMAIL'
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            : step.type === 'SEND_WHATSAPP' || step.type === 'SEND_TEMPLATE'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : step.type === 'BRANCH_CONDITION'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : step.type === 'WAIT_DELAY' || step.type === 'DELAY'
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-blue-50 border-blue-200 text-blue-700'
                        }`}>
                          {step.type === 'SEND_EMAIL' && <Mail className="h-3.5 w-3.5 text-indigo-600" />}
                          {(step.type === 'SEND_WHATSAPP' || step.type === 'SEND_TEMPLATE') && <Send className="h-3.5 w-3.5 text-emerald-600" />}
                          {step.type === 'BRANCH_CONDITION' && <GitBranch className="h-3.5 w-3.5 text-amber-600" />}
                          {(step.type === 'WAIT_DELAY' || step.type === 'DELAY') && <Clock className="h-3.5 w-3.5 text-slate-500" />}
                          {(step.type === 'ADD_TAG' || step.type === 'ASSIGN_TAG') && <Tag className="h-3.5 w-3.5 text-blue-600" />}
                          {step.type === 'HANDOFF_TO_HUMAN' && <UserCheck className="h-3.5 w-3.5 text-purple-600" />}

                          {step.type === 'SEND_EMAIL'
                            ? `Email: ${step.subject ? (step.subject.length > 20 ? step.subject.substring(0, 20) + '...' : step.subject) : 'Send Email'}`
                            : step.type === 'SEND_WHATSAPP' || step.type === 'SEND_TEMPLATE'
                            ? `WhatsApp: ${step.templateName || 'Template'}`
                            : step.type === 'BRANCH_CONDITION'
                            ? `Fallback: ${step.conditionType === 'WHATSAPP_UNREAD_24H' ? 'Unread in 24h' : 'Condition'}`
                            : step.type === 'WAIT_DELAY' || step.type === 'DELAY'
                            ? `${step.delayHours ? `${step.delayHours}h` : `${step.delayDays}d`} Delay`
                            : step.tagName || step.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Enrolled / Done</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {seq.enrolledCount} / {seq.completedCount}
                    </p>
                  </div>

                  <button
                    onClick={() => toggleStatus(seq.id, seq.status)}
                    className={`p-2 rounded-xl border transition ${
                      seq.status === 'ACTIVE'
                        ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                        : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                    }`}
                    title={seq.status === 'ACTIVE' ? 'Pause Journey' : 'Activate Journey'}
                  >
                    {seq.status === 'ACTIVE' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for creating a new cross-channel journey */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#004ac6]" />
                Create Cross-Channel Automation Journey
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Journey Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Health Quote Re-engagement (WhatsApp + Email Fallback)"
                  value={newSeqName}
                  onChange={(e) => setNewSeqName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold outline-none focus:border-[#004ac6]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain the intent and target audience..."
                  value={newSeqDesc}
                  onChange={(e) => setNewSeqDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold outline-none focus:border-[#004ac6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Trigger Event
                  </label>
                  <select
                    value={newSeqTrigger}
                    onChange={(e) => setNewSeqTrigger(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold outline-none focus:border-[#004ac6]"
                  >
                    <option value="CONTACT_CREATED">Contact / Lead Created</option>
                    <option value="TAG_ADDED">Tag Added to Contact</option>
                    <option value="FORM_SUBMITTED">Website Form Submitted</option>
                    <option value="LIST_JOINED">Contact Joined a List</option>
                    <option value="EMAIL_OPENED">Email Opened</option>
                    <option value="EMAIL_LINK_CLICKED">Email Link Clicked</option>
                    <option value="WHATSAPP_UNREAD_TIMEOUT">WhatsApp Unread Timeout</option>
                  </select>
                </div>

                <div>
                  {newSeqTrigger === 'TAG_ADDED' && (
                    <>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Which tag?</label>
                      <input
                        type="text"
                        placeholder="Leave empty for any tag"
                        value={triggerTag}
                        onChange={(e) => setTriggerTag(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold outline-none focus:border-[#004ac6]"
                      />
                    </>
                  )}
                  {newSeqTrigger === 'LIST_JOINED' && (
                    <>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Which list?</label>
                      <select
                        value={triggerListId}
                        onChange={(e) => setTriggerListId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold outline-none focus:border-[#004ac6]"
                      >
                        <option value="">Any list</option>
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </div>

              {/* Steps builder */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <p className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px]">
                  <Layers className="h-3.5 w-3.5 text-[#004ac6]" />
                  Steps (run in this order for each contact)
                </p>

                {builderSteps.map((st, index) => {
                  const channel = st.type === 'SEND_EMAIL' ? 'EMAIL' : st.type === 'SEND_WHATSAPP' ? 'WHATSAPP' : null;
                  const options = channel ? templates.filter((t) => t.channel === channel) : [];
                  return (
                    <div key={st.id} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 w-5">{index + 1}.</span>
                        <select
                          aria-label={`Step ${index + 1} type`}
                          value={st.type}
                          onChange={(e) => updateStep(st.id, { type: e.target.value as BuilderStepType, templateId: '' })}
                          className="flex-1 p-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                        >
                          <option value="SEND_EMAIL">Send email</option>
                          <option value="WAIT_DELAY">Wait</option>
                          <option value="ADD_TAG">Add tag</option>
                          <option value="SEND_WHATSAPP">Send WhatsApp</option>
                        </select>
                        <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="px-2 py-1 rounded border border-slate-300 font-bold disabled:opacity-40" aria-label={`Move step ${index + 1} up`}>↑</button>
                        <button type="button" onClick={() => moveStep(index, 1)} disabled={index === builderSteps.length - 1} className="px-2 py-1 rounded border border-slate-300 font-bold disabled:opacity-40" aria-label={`Move step ${index + 1} down`}>↓</button>
                        <button type="button" onClick={() => removeStep(st.id)} disabled={builderSteps.length === 1} className="px-2 py-1 rounded border border-red-200 text-red-600 font-bold disabled:opacity-40" aria-label={`Remove step ${index + 1}`}>✕</button>
                      </div>

                      {channel && (
                        <div className="grid grid-cols-2 gap-2 pl-7">
                          <select
                            aria-label={`Step ${index + 1} template`}
                            value={st.templateId}
                            onChange={(e) => updateStep(st.id, { templateId: e.target.value })}
                            className="p-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                          >
                            <option value="">Choose a template…</option>
                            {options.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          {st.type === 'SEND_EMAIL' ? (
                            <input
                              type="text"
                              aria-label={`Step ${index + 1} subject`}
                              placeholder="Subject (empty = template subject)"
                              value={st.subject}
                              onChange={(e) => updateStep(st.id, { subject: e.target.value })}
                              className="p-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                            />
                          ) : (
                            <span />
                          )}
                          {options.length === 0 && (
                            <p className="col-span-2 text-amber-700 font-semibold">
                              No {channel === 'EMAIL' ? 'email' : 'WhatsApp'} templates yet. Create one under Templates first.
                            </p>
                          )}
                        </div>
                      )}

                      {st.type === 'WAIT_DELAY' && (
                        <div className="flex items-center gap-2 pl-7">
                          <input
                            type="number"
                            min={1}
                            aria-label={`Step ${index + 1} wait hours`}
                            value={st.delayHours}
                            onChange={(e) => updateStep(st.id, { delayHours: Number(e.target.value) })}
                            className="w-24 p-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                          />
                          <span className="text-slate-600 font-semibold">hours</span>
                        </div>
                      )}

                      {st.type === 'ADD_TAG' && (
                        <div className="pl-7">
                          <input
                            type="text"
                            aria-label={`Step ${index + 1} tag name`}
                            placeholder="Tag name"
                            value={st.tagName}
                            onChange={(e) => updateStep(st.id, { tagName: e.target.value })}
                            className="w-full p-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setBuilderSteps((prev) => [...prev, newBuilderStep(prev[prev.length - 1]?.type === 'WAIT_DELAY' ? 'SEND_EMAIL' : 'WAIT_DELAY')])}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add step
                </button>
              </div>

              {formError && (
                <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 font-semibold" role="alert">
                  {formError}
                </div>
              )}

              {/* Safeguards: Frequency Capping & Quiet Hours */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                <p className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#004ac6]" />
                  Channel Protection Safeguards (Cross-Channel Frequency & Quiet Hours)
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <label className="block text-slate-500 font-semibold mb-0.5">Frequency Cap</label>
                    <select
                      value={newFrequencyCap}
                      onChange={(e) => setNewFrequencyCap(Number(e.target.value))}
                      className="w-full p-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                    >
                      <option value="1">Max 1 msg / 24h</option>
                      <option value="2">Max 1 msg / 48h</option>
                      <option value="3">Max 1 msg / 72h</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 font-semibold mb-0.5">Quiet Hours Start</label>
                    <input
                      type="text"
                      value={newQuietStart}
                      onChange={(e) => setNewQuietStart(e.target.value)}
                      placeholder="21:00"
                      className="w-full p-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-semibold mb-0.5">Quiet Hours End</label>
                    <input
                      type="text"
                      value={newQuietEnd}
                      onChange={(e) => setNewQuietEnd(e.target.value)}
                      placeholder="08:00"
                      className="w-full p-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#004ac6] hover:bg-[#003da6] text-white font-bold transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Launch Cross-Channel Journey
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
