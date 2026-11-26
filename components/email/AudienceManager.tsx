'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Upload, SlidersHorizontal, Filter, Plus, Trash2, RefreshCw, Users } from 'lucide-react';

type Section = 'lists' | 'import' | 'fields' | 'segments';

interface ContactList {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
}

interface ContactRow {
  id: string;
  name: string;
  email: string;
}

interface ImportJob {
  id: string;
  fileName: string;
  listId?: string | null;
  consentSource?: string | null;
  status: string;
  totalRows: number;
  importedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  lastError?: string | null;
  createdAt: string;
}

interface CustomField {
  id: string;
  key: string;
  label: string;
  fieldType: string;
}

interface SegmentRow {
  id: string;
  name: string;
  description?: string | null;
  rules: { condition: 'AND' | 'OR'; rules: any[] };
  _count?: { campaigns: number };
}

type RuleField = 'tag' | 'list' | 'consent' | 'custom_field' | 'activity';

interface RuleDraft {
  uid: string;
  field: RuleField;
  operator: string;
  value: string;
  key: string;
  activityType: 'OPENED_LAST_N_DAYS' | 'CLICKED_CAMPAIGN' | 'NEVER_OPENED' | 'NEVER_BOUNCED';
  days: number;
  campaignId: string;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs font-medium outline-none focus:border-[#1B4B91]';
const btnPrimary =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B4B91] hover:bg-[#163d76] text-white text-xs font-semibold transition disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition disabled:opacity-50';
const card = 'bg-white rounded-xl border border-slate-200 p-4 space-y-3';

const newRule = (): RuleDraft => ({
  uid: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  field: 'tag',
  operator: 'equals',
  value: '',
  key: '',
  activityType: 'OPENED_LAST_N_DAYS',
  days: 30,
  campaignId: '',
});

const DEFAULT_OPERATOR: Record<RuleField, string> = {
  tag: 'equals',
  list: 'in',
  consent: 'equals',
  custom_field: 'equals',
  activity: '',
};

async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

/** Turns one builder row into the rule shape the segmentation service compiles. */
function ruleToJson(r: RuleDraft): Record<string, unknown> | null {
  if (r.field === 'tag') {
    return r.value.trim() ? { field: 'tag', operator: r.operator, value: r.value.trim() } : null;
  }
  if (r.field === 'list') {
    return r.value ? { field: 'list', operator: r.operator, value: r.value } : null;
  }
  if (r.field === 'consent') {
    return r.value ? { field: 'consent', operator: r.operator, value: r.value } : null;
  }
  if (r.field === 'custom_field') {
    if (!r.key) return null;
    const needsValue = r.operator !== 'exists' && r.operator !== 'not_exists';
    if (needsValue && !r.value.trim()) return null;
    return { field: 'custom_field', key: r.key, operator: r.operator, ...(needsValue ? { value: r.value.trim() } : {}) };
  }
  if (r.activityType === 'OPENED_LAST_N_DAYS') {
    return r.days > 0 ? { field: 'activity', activityType: r.activityType, days: Number(r.days) } : null;
  }
  if (r.activityType === 'CLICKED_CAMPAIGN') {
    return r.campaignId ? { field: 'activity', activityType: r.activityType, campaignId: r.campaignId } : null;
  }
  return { field: 'activity', activityType: r.activityType };
}

/** Loads a saved rule back into a builder row. Returns null for shapes this builder cannot edit (nested groups). */
function jsonToRule(raw: any): RuleDraft | null {
  if (!raw || typeof raw !== 'object' || 'condition' in raw || typeof raw.field !== 'string') return null;
  const base = newRule();
  const single = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));
  switch (raw.field) {
    case 'tag':
    case 'list':
    case 'consent':
      if (Array.isArray(raw.value) && raw.value.length > 1) return null;
      return { ...base, field: raw.field, operator: raw.operator || DEFAULT_OPERATOR[raw.field as RuleField], value: single(raw.value) };
    case 'custom_field':
      return { ...base, field: 'custom_field', key: raw.key || '', operator: raw.operator || 'equals', value: single(raw.value) };
    case 'activity':
      return {
        ...base,
        field: 'activity',
        operator: '',
        activityType: raw.activityType || 'OPENED_LAST_N_DAYS',
        days: Number(raw.days) || 30,
        campaignId: raw.campaignId || '',
      };
    default:
      return null;
  }
}

export default function AudienceManager() {
  const [section, setSection] = useState<Section>('lists');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [lists, setLists] = useState<ContactList[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

  const say = (type: 'success' | 'error', text: string) => setNotice({ type, text });

  const loadLists = useCallback(async () => {
    const res = await fetch('/api/contacts/lists');
    const data = await readJson(res);
    if (res.ok) setLists(Array.isArray(data.lists) ? data.lists : []);
  }, []);
  const loadFields = useCallback(async () => {
    const res = await fetch('/api/contacts/custom-fields');
    const data = await readJson(res);
    if (res.ok) setFields(Array.isArray(data.fields) ? data.fields : []);
  }, []);
  const loadSegments = useCallback(async () => {
    const res = await fetch('/api/segments');
    const data = await readJson(res);
    if (res.ok) setSegments(Array.isArray(data.segments) ? data.segments : []);
  }, []);
  const loadJobs = useCallback(async () => {
    const res = await fetch('/api/contacts/import-csv');
    const data = await readJson(res);
    if (res.ok) setJobs(Array.isArray(data.jobs) ? data.jobs : []);
  }, []);

  useEffect(() => {
    loadLists().catch(() => {});
    loadFields().catch(() => {});
    loadSegments().catch(() => {});
    loadJobs().catch(() => {});
  }, [loadLists, loadFields, loadSegments, loadJobs]);

  // An import is processed by the background worker; refresh while one is still running.
  const hasRunningJob = jobs.some((j) => j.status === 'PENDING' || j.status === 'PROCESSING');
  useEffect(() => {
    if (!hasRunningJob) return;
    const timer = setInterval(() => {
      loadJobs().catch(() => {});
      loadLists().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [hasRunningJob, loadJobs, loadLists]);

  /* ----------------------------------------------------------------------------------
   * Lists
   * -------------------------------------------------------------------------------- */
  const [listName, setListName] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/contacts/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: listName, description: listDesc }),
      });
      const data = await readJson(res);
      if (!res.ok) return say('error', data.error || 'Could not create the list.');
      setListName('');
      setListDesc('');
      say('success', 'List created.');
      await loadLists();
    } finally {
      setBusy(false);
    }
  };

  const deleteList = async (list: ContactList) => {
    if (!window.confirm(`Delete the list "${list.name}"? The contacts themselves are kept.`)) return;
    const res = await fetch(`/api/contacts/lists/${list.id}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) return say('error', data.error || 'Could not delete the list.');
    if (openListId === list.id) setOpenListId(null);
    say('success', 'List deleted.');
    await loadLists();
  };

  const openAddContacts = async (listId: string) => {
    setOpenListId(openListId === listId ? null : listId);
    setPicked(new Set());
    setContactSearch('');
    if (contacts.length === 0) {
      const res = await fetch('/api/dashboard/customers');
      const data = await readJson(res);
      const rows: any[] = Array.isArray(data) ? data : Array.isArray(data?.customers) ? data.customers : [];
      setContacts(
        rows
          .map((c) => ({ id: String(c.id), name: String(c.displayName || c.name || ''), email: String(c.email || '') }))
          .filter((c) => c.id)
      );
    }
  };

  const visibleContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const rows = q ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : contacts;
    return rows.slice(0, 200);
  }, [contacts, contactSearch]);

  const addPicked = async (listId: string) => {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/lists/${listId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: Array.from(picked) }),
      });
      const data = await readJson(res);
      if (!res.ok) return say('error', data.error || 'Could not add contacts.');
      say('success', `${data.added ?? 0} contact(s) added to the list.`);
      setPicked(new Set());
      await loadLists();
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------------------------------------------------------------
   * CSV import
   * -------------------------------------------------------------------------------- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [importListId, setImportListId] = useState('');
  const [consentSource, setConsentSource] = useState('');
  const [consentProof, setConsentProof] = useState('');

  const startImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return say('error', 'Choose a CSV file first.');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (importListId) form.append('listId', importListId);
      if (consentSource.trim()) form.append('consentSource', consentSource.trim());
      if (consentProof.trim()) form.append('consentProof', consentProof.trim());
      const res = await fetch('/api/contacts/import-csv', { method: 'POST', body: form });
      const data = await readJson(res);
      if (!res.ok) return say('error', data.error || 'The import could not be started.');
      say('success', `Import queued: ${data.totalRows ?? 0} row(s). It is processed in the background.`);
      if (fileRef.current) fileRef.current.value = '';
      setConsentProof('');
      await loadJobs();
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------------------------------------------------------------
   * Custom fields
   * -------------------------------------------------------------------------------- */
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState('TEXT');

  const createField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/contacts/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: fieldLabel, fieldType }),
      });
      const data = await readJson(res);
      if (!res.ok) return say('error', data.error || 'Could not create the field.');
      setFieldLabel('');
      say('success', 'Custom field created.');
      await loadFields();
    } finally {
      setBusy(false);
    }
  };

  const deleteField = async (field: CustomField) => {
    if (!window.confirm(`Delete the custom field "${field.label}"?`)) return;
    const res = await fetch(`/api/contacts/custom-fields?id=${encodeURIComponent(field.id)}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) return say('error', data.error || 'Could not delete the field.');
    say('success', 'Custom field deleted.');
    await loadFields();
  };

  /* ----------------------------------------------------------------------------------
   * Segments
   * -------------------------------------------------------------------------------- */
  const [segName, setSegName] = useState('');
  const [segDesc, setSegDesc] = useState('');
  const [segCondition, setSegCondition] = useState<'AND' | 'OR'>('AND');
  const [segRules, setSegRules] = useState<RuleDraft[]>([newRule()]);
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (section !== 'segments' || campaigns.length > 0) return;
    fetch('/api/dashboard/broadcast?channel=EMAIL')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const rows: any[] = Array.isArray(data) ? data : Array.isArray(data?.campaigns) ? data.campaigns : [];
        setCampaigns(rows.map((c) => ({ id: String(c.id), name: String(c.name || '') })));
      })
      .catch(() => {});
  }, [section, campaigns.length]);

  const updateRule = (uid: string, patch: Partial<RuleDraft>) =>
    setSegRules((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const resetSegmentForm = () => {
    setSegName('');
    setSegDesc('');
    setSegCondition('AND');
    setSegRules([newRule()]);
    setEditingSegId(null);
  };

  const editSegment = (seg: SegmentRow) => {
    const drafts = (seg.rules?.rules || []).map(jsonToRule);
    if (drafts.some((d) => d === null)) {
      return say('error', 'This segment uses nested rule groups or multi-value rules, which this builder cannot edit yet.');
    }
    setEditingSegId(seg.id);
    setSegName(seg.name);
    setSegDesc(seg.description || '');
    setSegCondition(seg.rules?.condition === 'OR' ? 'OR' : 'AND');
    setSegRules(drafts.length > 0 ? (drafts as RuleDraft[]) : [newRule()]);
  };

  const saveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segName.trim()) return say('error', 'Give the segment a name.');
    const compiled = segRules.map(ruleToJson);
    if (compiled.some((r) => r === null)) return say('error', 'Fill in every rule, or remove the empty ones.');
    setBusy(true);
    try {
      const payload = { name: segName, description: segDesc, rules: { condition: segCondition, rules: compiled } };
      const res = await fetch(editingSegId ? `/api/segments/${editingSegId}` : '/api/segments', {
        method: editingSegId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!res.ok) return say('error', data.error || 'Could not save the segment.');
      say('success', editingSegId ? 'Segment updated.' : 'Segment created.');
      resetSegmentForm();
      setCounts({});
      await loadSegments();
    } finally {
      setBusy(false);
    }
  };

  const deleteSegment = async (seg: SegmentRow) => {
    if (!window.confirm(`Delete the segment "${seg.name}"?`)) return;
    const res = await fetch(`/api/segments/${seg.id}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) return say('error', data.error || 'Could not delete the segment.');
    if (editingSegId === seg.id) resetSegmentForm();
    say('success', 'Segment deleted.');
    await loadSegments();
  };

  const countSegment = async (seg: SegmentRow) => {
    setCounts((prev) => ({ ...prev, [seg.id]: '…' }));
    const res = await fetch(`/api/segments/${seg.id}/count?channel=EMAIL`);
    const data = await readJson(res);
    setCounts((prev) => ({
      ...prev,
      [seg.id]: res.ok ? `${Number(data.audienceCount ?? 0).toLocaleString()} can be emailed` : 'Could not count',
    }));
  };

  /* ---------------------------------------------------------------------------------- */

  const sections: Array<{ id: Section; label: string; icon: typeof ListChecks }> = [
    { id: 'lists', label: 'Lists', icon: ListChecks },
    { id: 'import', label: 'Import contacts', icon: Upload },
    { id: 'fields', label: 'Custom fields', icon: SlidersHorizontal },
    { id: 'segments', label: 'Segments', icon: Filter },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSection(s.id);
                setNotice(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                active ? 'bg-[#1B4B91] text-white border-[#1B4B91]' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`px-3 py-2 rounded-lg border text-xs font-semibold ${
            notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* ------------------------------- Lists ------------------------------- */}
      {section === 'lists' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form onSubmit={createList} className={card}>
            <h3 className="text-sm font-bold text-slate-900">New list</h3>
            <div>
              <label htmlFor="list-name" className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
              <input id="list-name" className={inputCls} value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. Newsletter subscribers" required />
            </div>
            <div>
              <label htmlFor="list-desc" className="block text-xs font-semibold text-slate-700 mb-1">Description (optional)</label>
              <input id="list-desc" className={inputCls} value={listDesc} onChange={(e) => setListDesc(e.target.value)} />
            </div>
            <button type="submit" className={btnPrimary} disabled={busy}>
              <Plus className="h-3.5 w-3.5" /> Create list
            </button>
          </form>

          <div className={`${card} lg:col-span-2`}>
            <h3 className="text-sm font-bold text-slate-900">Your lists</h3>
            {lists.length === 0 ? (
              <p className="text-xs text-slate-500">No lists yet. Create one, then add contacts or import a CSV into it.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lists.map((list) => (
                  <li key={list.id} className="py-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{list.name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Users className="h-3 w-3" /> {list.memberCount.toLocaleString()} contact(s)
                          {list.description ? ` · ${list.description}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" className={btnGhost} onClick={() => openAddContacts(list.id)}>
                          {openListId === list.id ? 'Close' : 'Add contacts'}
                        </button>
                        <button type="button" className={btnGhost} onClick={() => deleteList(list)} aria-label={`Delete list ${list.name}`}>
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </button>
                      </div>
                    </div>

                    {openListId === list.id && (
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        <input
                          className={inputCls}
                          placeholder="Search contacts by name or email"
                          aria-label="Search contacts"
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                        />
                        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                          {visibleContacts.length === 0 ? (
                            <p className="p-3 text-xs text-slate-500">No contacts found.</p>
                          ) : (
                            visibleContacts.map((c) => (
                              <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  checked={picked.has(c.id)}
                                  onChange={(e) =>
                                    setPicked((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(c.id);
                                      else next.delete(c.id);
                                      return next;
                                    })
                                  }
                                />
                                <span className="font-semibold text-slate-800">{c.name || '(no name)'}</span>
                                <span className="text-slate-500 truncate">{c.email || 'no email'}</span>
                              </label>
                            ))
                          )}
                        </div>
                        <button type="button" className={btnPrimary} disabled={busy || picked.size === 0} onClick={() => addPicked(list.id)}>
                          Add {picked.size} selected
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------- Import ------------------------------- */}
      {section === 'import' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form onSubmit={startImport} className={card}>
            <h3 className="text-sm font-bold text-slate-900">Import a CSV file</h3>
            <p className="text-xs text-slate-500">
              The first row must be the column names. An <strong>email</strong> column is needed; name, phone and tags are optional.
              A contact that already exists (same email) is updated, not duplicated.
            </p>
            <div>
              <label htmlFor="import-file" className="block text-xs font-semibold text-slate-700 mb-1">CSV file</label>
              <input id="import-file" ref={fileRef} type="file" accept=".csv,text/csv" className="block w-full text-xs" required />
            </div>
            <div>
              <label htmlFor="import-list" className="block text-xs font-semibold text-slate-700 mb-1">Add to list (optional)</label>
              <select id="import-list" className={inputCls} value={importListId} onChange={(e) => setImportListId(e.target.value)}>
                <option value="">No list</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="import-consent" className="block text-xs font-semibold text-slate-700 mb-1">How did these people agree to receive email?</label>
              <input
                id="import-consent"
                className={inputCls}
                value={consentSource}
                onChange={(e) => setConsentSource(e.target.value)}
                placeholder="e.g. Website signup form, March 2026"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                If you leave this empty, new contacts are saved as <strong>Pending</strong> and will not receive marketing email.
              </p>
            </div>
            <div>
              <label htmlFor="import-proof" className="block text-xs font-semibold text-slate-700 mb-1">Proof or reference (optional)</label>
              <input id="import-proof" className={inputCls} value={consentProof} onChange={(e) => setConsentProof(e.target.value)} placeholder="e.g. form URL or export file name" />
            </div>
            <button type="submit" className={btnPrimary} disabled={busy}>
              <Upload className="h-3.5 w-3.5" /> Start import
            </button>
          </form>

          <div className={`${card} lg:col-span-2`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Recent imports</h3>
              <button type="button" className={btnGhost} onClick={() => loadJobs()}>
                <RefreshCw className={`h-3.5 w-3.5 ${hasRunningJob ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-xs text-slate-500">No imports yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3 font-semibold">File</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 pr-3 font-semibold">Rows</th>
                      <th className="py-2 pr-3 font-semibold">New</th>
                      <th className="py-2 pr-3 font-semibold">Updated</th>
                      <th className="py-2 pr-3 font-semibold">Skipped</th>
                      <th className="py-2 font-semibold">Consent source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td className="py-2 pr-3 font-semibold text-slate-800">{job.fileName}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold ${
                              job.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : job.status === 'FAILED'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {job.status}
                          </span>
                          {job.lastError && <p className="text-red-600 mt-1">{job.lastError}</p>}
                        </td>
                        <td className="py-2 pr-3">{job.totalRows}</td>
                        <td className="py-2 pr-3">{job.importedCount ?? 0}</td>
                        <td className="py-2 pr-3">{job.updatedCount ?? 0}</td>
                        <td className="py-2 pr-3">{job.skippedCount ?? 0}</td>
                        <td className="py-2 text-slate-600">{job.consentSource || 'None (saved as Pending)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasRunningJob && (
              <p className="text-[11px] text-slate-500">
                Imports are processed by the background worker. If one stays in PENDING, check that the worker is running.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------- Custom fields ------------------------------- */}
      {section === 'fields' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form onSubmit={createField} className={card}>
            <h3 className="text-sm font-bold text-slate-900">New custom field</h3>
            <div>
              <label htmlFor="field-label" className="block text-xs font-semibold text-slate-700 mb-1">Label</label>
              <input id="field-label" className={inputCls} value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} placeholder="e.g. Renewal month" required />
            </div>
            <div>
              <label htmlFor="field-type" className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
              <select id="field-type" className={inputCls} value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
                <option value="TEXT">Text</option>
                <option value="NUMBER">Number</option>
                <option value="DATE">Date</option>
                <option value="BOOLEAN">Yes / No</option>
              </select>
            </div>
            <button type="submit" className={btnPrimary} disabled={busy}>
              <Plus className="h-3.5 w-3.5" /> Create field
            </button>
          </form>

          <div className={`${card} lg:col-span-2`}>
            <h3 className="text-sm font-bold text-slate-900">Your custom fields</h3>
            {fields.length === 0 ? (
              <p className="text-xs text-slate-500">
                No custom fields yet. A CSV column whose name matches a field key is saved into that field during import.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {fields.map((f) => (
                  <li key={f.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{f.label}</p>
                      <p className="text-xs text-slate-500">
                        Key: <code className="font-mono">{f.key}</code> · {f.fieldType}
                      </p>
                    </div>
                    <button type="button" className={btnGhost} onClick={() => deleteField(f)} aria-label={`Delete field ${f.label}`}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------- Segments ------------------------------- */}
      {section === 'segments' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <form onSubmit={saveSegment} className={`${card} lg:col-span-3`}>
            <h3 className="text-sm font-bold text-slate-900">{editingSegId ? 'Edit segment' : 'New segment'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="seg-name" className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                <input id="seg-name" className={inputCls} value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="e.g. Engaged VIP customers" required />
              </div>
              <div>
                <label htmlFor="seg-desc" className="block text-xs font-semibold text-slate-700 mb-1">Description (optional)</label>
                <input id="seg-desc" className={inputCls} value={segDesc} onChange={(e) => setSegDesc(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span>Contacts must match</span>
              <select aria-label="Match all or any rule" className="px-2 py-1 rounded-lg border border-slate-300 bg-white" value={segCondition} onChange={(e) => setSegCondition(e.target.value as 'AND' | 'OR')}>
                <option value="AND">all</option>
                <option value="OR">any</option>
              </select>
              <span>of these rules:</span>
            </div>

            <div className="space-y-2">
              {segRules.map((r, index) => (
                <div key={r.uid} className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <select
                    aria-label={`Rule ${index + 1} type`}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                    value={r.field}
                    onChange={(e) => {
                      const field = e.target.value as RuleField;
                      updateRule(r.uid, { field, operator: DEFAULT_OPERATOR[field], value: '', key: '' });
                    }}
                  >
                    <option value="tag">Tag</option>
                    <option value="list">List</option>
                    <option value="consent">Email consent</option>
                    <option value="custom_field">Custom field</option>
                    <option value="activity">Email activity</option>
                  </select>

                  {r.field === 'tag' && (
                    <>
                      <select aria-label={`Rule ${index + 1} condition`} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.operator} onChange={(e) => updateRule(r.uid, { operator: e.target.value })}>
                        <option value="equals">has tag</option>
                        <option value="not_equals">does not have tag</option>
                      </select>
                      <input aria-label={`Rule ${index + 1} tag`} className="flex-1 min-w-[8rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" placeholder="Tag name" value={r.value} onChange={(e) => updateRule(r.uid, { value: e.target.value })} />
                    </>
                  )}

                  {r.field === 'list' && (
                    <>
                      <select aria-label={`Rule ${index + 1} condition`} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.operator} onChange={(e) => updateRule(r.uid, { operator: e.target.value })}>
                        <option value="in">is on list</option>
                        <option value="not_in">is not on list</option>
                      </select>
                      <select aria-label={`Rule ${index + 1} list`} className="flex-1 min-w-[8rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.value} onChange={(e) => updateRule(r.uid, { value: e.target.value })}>
                        <option value="">Choose a list…</option>
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </>
                  )}

                  {r.field === 'consent' && (
                    <>
                      <select aria-label={`Rule ${index + 1} condition`} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.operator} onChange={(e) => updateRule(r.uid, { operator: e.target.value })}>
                        <option value="equals">is</option>
                        <option value="not_equals">is not</option>
                      </select>
                      <select aria-label={`Rule ${index + 1} consent status`} className="flex-1 min-w-[8rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.value} onChange={(e) => updateRule(r.uid, { value: e.target.value })}>
                        <option value="">Choose a status…</option>
                        <option value="SUBSCRIBED">Subscribed</option>
                        <option value="PENDING">Pending</option>
                        <option value="UNSUBSCRIBED">Unsubscribed</option>
                        <option value="BOUNCED">Bounced</option>
                        <option value="COMPLAINED">Complained</option>
                      </select>
                    </>
                  )}

                  {r.field === 'custom_field' && (
                    <>
                      <select aria-label={`Rule ${index + 1} field`} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.key} onChange={(e) => updateRule(r.uid, { key: e.target.value })}>
                        <option value="">Choose a field…</option>
                        {fields.map((f) => (
                          <option key={f.id} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                      <select aria-label={`Rule ${index + 1} condition`} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.operator} onChange={(e) => updateRule(r.uid, { operator: e.target.value })}>
                        <option value="equals">equals</option>
                        <option value="not_equals">does not equal</option>
                        <option value="contains">contains</option>
                        <option value="gt">greater than</option>
                        <option value="lt">less than</option>
                        <option value="exists">has a value</option>
                        <option value="not_exists">is empty</option>
                      </select>
                      {r.operator !== 'exists' && r.operator !== 'not_exists' && (
                        <input aria-label={`Rule ${index + 1} value`} className="flex-1 min-w-[6rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" placeholder="Value" value={r.value} onChange={(e) => updateRule(r.uid, { value: e.target.value })} />
                      )}
                    </>
                  )}

                  {r.field === 'activity' && (
                    <>
                      <select aria-label={`Rule ${index + 1} activity`} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.activityType} onChange={(e) => updateRule(r.uid, { activityType: e.target.value as RuleDraft['activityType'] })}>
                        <option value="OPENED_LAST_N_DAYS">opened an email in the last</option>
                        <option value="CLICKED_CAMPAIGN">clicked a link in campaign</option>
                        <option value="NEVER_OPENED">has never opened an email</option>
                        <option value="NEVER_BOUNCED">has never bounced</option>
                      </select>
                      {r.activityType === 'OPENED_LAST_N_DAYS' && (
                        <>
                          <input type="number" min={1} aria-label={`Rule ${index + 1} days`} className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.days} onChange={(e) => updateRule(r.uid, { days: Number(e.target.value) })} />
                          <span className="text-xs text-slate-600">days</span>
                        </>
                      )}
                      {r.activityType === 'CLICKED_CAMPAIGN' && (
                        <select aria-label={`Rule ${index + 1} campaign`} className="flex-1 min-w-[8rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" value={r.campaignId} onChange={(e) => updateRule(r.uid, { campaignId: e.target.value })}>
                          <option value="">Choose a campaign…</option>
                          {campaigns.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    className="ml-auto px-2 py-1 rounded border border-red-200 text-red-600 text-xs font-bold disabled:opacity-40"
                    disabled={segRules.length === 1}
                    onClick={() => setSegRules((prev) => prev.filter((x) => x.uid !== r.uid))}
                    aria-label={`Remove rule ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnGhost} onClick={() => setSegRules((prev) => [...prev, newRule()])}>
                <Plus className="h-3.5 w-3.5" /> Add rule
              </button>
              <button type="submit" className={btnPrimary} disabled={busy}>
                {editingSegId ? 'Save changes' : 'Create segment'}
              </button>
              {editingSegId && (
                <button type="button" className={btnGhost} onClick={resetSegmentForm}>
                  Cancel
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Whatever the rules say, a campaign is only ever sent to contacts who are subscribed and not suppressed.
            </p>
          </form>

          <div className={`${card} lg:col-span-2`}>
            <h3 className="text-sm font-bold text-slate-900">Saved segments</h3>
            {segments.length === 0 ? (
              <p className="text-xs text-slate-500">No segments yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {segments.map((seg) => (
                  <li key={seg.id} className="py-3 space-y-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{seg.name}</p>
                      <p className="text-xs text-slate-500">
                        {(seg.rules?.rules?.length ?? 0)} rule(s), match {seg.rules?.condition === 'OR' ? 'any' : 'all'}
                        {seg._count ? ` · used by ${seg._count.campaigns} campaign(s)` : ''}
                      </p>
                      {counts[seg.id] && <p className="text-xs font-semibold text-[#1B4B91] mt-0.5">{counts[seg.id]}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={btnGhost} onClick={() => countSegment(seg)}>Count contacts</button>
                      <button type="button" className={btnGhost} onClick={() => editSegment(seg)}>Edit</button>
                      <button type="button" className={btnGhost} onClick={() => deleteSegment(seg)} aria-label={`Delete segment ${seg.name}`}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
