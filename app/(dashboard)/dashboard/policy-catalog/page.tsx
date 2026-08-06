'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PolicyCatalogItem {
  id: string;
  policyId: string;
  name: string;
  insurerName: string;
  states: string[];
  premiumMin: number;
  premiumMax: number;
  sumInsured: number;
  active: boolean;
  extractedSummary: string;
  pdfUrl: string;
}

interface ChunkItem {
  id: string;
  chunkText: string;
  pageNumber: number;
  pineconeVectorId: string;
}

export default function PolicyCatalogPage() {
  const queryClient = useQueryClient();

  // Queries
  const { data: policies = [], isLoading } = useQuery<PolicyCatalogItem[]>({
    queryKey: ['policyCatalog'],
    queryFn: async () => {
      const res = await fetch('/api/policy-catalog');
      if (!res.ok) throw new Error('Failed to load catalog');
      return res.json();
    },
  });

  // Modal / Form States
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState({
    id: '',
    policyId: '',
    name: '',
    insurerName: '',
    states: '',
    premiumMin: '',
    premiumMax: '',
    sumInsured: '',
    active: true,
  });

  // Chunk Audit Drawer State
  const [auditPolicyId, setAuditPolicyId] = useState<string | null>(null);
  const { data: auditChunks = [], isLoading: isLoadingChunks } = useQuery<ChunkItem[]>({
    queryKey: ['policyChunks', auditPolicyId],
    queryFn: async () => {
      if (!auditPolicyId) return [];
      // Fetch chunks by passing conversation/catalog filter or custom helper endpoint
      // We will write a small API endpoint /api/policy-catalog/chunks?id=... to support audit draws!
      const res = await fetch(`/api/policy-catalog/chunks?id=${auditPolicyId}`);
      if (!res.ok) throw new Error('Failed to load chunks');
      return res.json();
    },
    enabled: !!auditPolicyId,
  });

  // Upload state
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');

interface PolicyCatalogPayload {
  id?: string;
  policyId: string;
  name: string;
  insurerName: string;
  states: string;
  premiumMin: number;
  premiumMax: number;
  sumInsured: number;
  active: boolean;
}

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (values: PolicyCatalogPayload) => {
      const res = await fetch('/api/policy-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          states: values.states.split(',').map((s) => s.trim().toUpperCase()),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create policy');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policyCatalog'] });
      setIsEditing(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: PolicyCatalogPayload) => {
      const res = await fetch('/api/policy-catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          states: values.states.split(',').map((s) => s.trim().toUpperCase()),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update policy');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policyCatalog'] });
      setIsEditing(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setFormValues({
      id: '',
      policyId: '',
      name: '',
      insurerName: '',
      states: '',
      premiumMin: '',
      premiumMax: '',
      sumInsured: '',
      active: true,
    });
  };

  const handleEditClick = (p: PolicyCatalogItem) => {
    setFormValues({
      id: p.id,
      policyId: p.policyId,
      name: p.name,
      insurerName: p.insurerName,
      states: p.states.join(', '),
      premiumMin: (p.premiumMin / 100).toString(),
      premiumMax: (p.premiumMax / 100).toString(),
      sumInsured: (p.sumInsured / 100).toString(),
      active: p.active,
    });
    setIsEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: PolicyCatalogPayload = {
      id: formValues.id || undefined,
      policyId: formValues.policyId,
      name: formValues.name,
      insurerName: formValues.insurerName,
      states: formValues.states,
      premiumMin: Math.round(Number(formValues.premiumMin) * 100),
      premiumMax: Math.round(Number(formValues.premiumMax) * 100),
      sumInsured: Math.round(Number(formValues.sumInsured) * 100),
      active: formValues.active,
    };

    if (formValues.id) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleFileUpload = async (policyId: string, file: File) => {
    if (!file) return;

    setUploadingId(policyId);
    setUploadStatus('Uploading and parsing PDF...');
    const formData = new FormData();
    formData.append('id', policyId);
    formData.append('file', file);

    try {
      const res = await fetch('/api/policy-catalog/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadStatus(`Success! Generated summary and embedded ${data.chunkCount} chunks.`);
      queryClient.invalidateQueries({ queryKey: ['policyCatalog'] });
    } catch (err: unknown) {
      setUploadStatus(err instanceof Error ? err.message : 'Error uploading document.');
    } finally {
      setTimeout(() => {
        setUploadingId(null);
        setUploadStatus('');
      }, 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper header */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Policy Catalog & RAG</h2>
          <p className="text-slate-400 text-xs mt-1">
            Configure coverage offerings, upload benefit summaries, and verify isolated vector database index partitions.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsEditing(true);
          }}
          className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-teal-500/10"
        >
          Add Policy Product
        </button>
      </div>

      {/* Forms & Dialog Modals */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 space-y-4 text-left">
            <div>
              <h3 className="text-sm font-bold text-slate-200">
                {formValues.id ? 'Modify Catalog Product' : 'Add Policy Product'}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Inputs represent internal database parameters for budget catalog matching.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Policy Code</label>
                <input
                  type="text"
                  required
                  placeholder="bronze-tx-01"
                  value={formValues.policyId}
                  onChange={(e) => setFormValues({ ...formValues, policyId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-700 text-xs focus:outline-none focus:border-teal-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Policy Name</label>
                <input
                  type="text"
                  required
                  placeholder="Bronze Core Health"
                  value={formValues.name}
                  onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-700 text-xs focus:outline-none focus:border-teal-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Insurer Name</label>
                <input
                  type="text"
                  required
                  placeholder="Humana"
                  value={formValues.insurerName}
                  onChange={(e) => setFormValues({ ...formValues, insurerName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-700 text-xs focus:outline-none focus:border-teal-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">States (comma-separated)</label>
                <input
                  type="text"
                  required
                  placeholder="TX, CA, FL"
                  value={formValues.states}
                  onChange={(e) => setFormValues({ ...formValues, states: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-700 text-xs focus:outline-none focus:border-teal-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Min Premium ($)</label>
                <input
                  type="number"
                  required
                  placeholder="100"
                  value={formValues.premiumMin}
                  onChange={(e) => setFormValues({ ...formValues, premiumMin: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-700 text-xs focus:outline-none focus:border-teal-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Max Premium ($)</label>
                <input
                  type="number"
                  required
                  placeholder="250"
                  value={formValues.premiumMax}
                  onChange={(e) => setFormValues({ ...formValues, premiumMax: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-700 text-xs focus:outline-none focus:border-teal-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sum Insured ($)</label>
                <input
                  type="number"
                  required
                  placeholder="50000"
                  value={formValues.sumInsured}
                  onChange={(e) => setFormValues({ ...formValues, sumInsured: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-700 text-xs focus:outline-none focus:border-teal-500/50"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 py-2 border-y border-slate-850">
              <input
                type="checkbox"
                id="active-toggle"
                checked={formValues.active}
                onChange={(e) => setFormValues({ ...formValues, active: e.target.checked })}
                className="h-4 w-4 accent-teal-500"
              />
              <label htmlFor="active-toggle" className="text-xs text-slate-300 font-bold select-none cursor-pointer">
                Product is active for lead auto-recommendations
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="bg-slate-950 hover:bg-slate-850 text-slate-400 border border-slate-800 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                Save Product
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RAG Chunks Audit Drawer */}
      {auditPolicyId && (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-900 border-l border-slate-800 z-50 shadow-2xl p-6 flex flex-col justify-between">
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-slate-100">Pinecone RAG Audit Logs</h3>
                <p className="text-[10px] text-slate-500">
                  Detailed vector index chunks compiled in database partition for target.
                </p>
              </div>
              <button onClick={() => setAuditPolicyId(null)} className="text-slate-500 hover:text-slate-300 text-xs font-bold">
                Close
              </button>
            </div>

            {isLoadingChunks ? (
              <p className="text-xs text-slate-500">Loading audit records...</p>
            ) : auditChunks.length === 0 ? (
              <p className="text-xs text-slate-600">No document chunks indexed for this policy yet.</p>
            ) : (
              <div className="space-y-3">
                {auditChunks.map((chunk, idx) => (
                  <div key={chunk.id} className="bg-slate-950 border border-slate-850 p-3 rounded-xl space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-1.5">
                      <span className="text-[9px] font-bold text-teal-400 font-mono">
                        Chunk #{idx + 1} (Page {chunk.pageNumber})
                      </span>
                      <span className="text-[8px] text-slate-600 font-mono">
                        Vector ID: {chunk.pineconeVectorId.slice(0, 18)}...
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed break-words whitespace-pre-wrap">
                      {chunk.chunkText}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid displays */}
      {isLoading ? (
        <p className="text-xs text-slate-400">Loading catalog offerings...</p>
      ) : policies.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
          No policies configured. Use the &quot;Add Policy Product&quot; button above to start your catalog.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {policies.map((p) => (
            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                      {p.insurerName} • {p.policyId}
                    </span>
                    <h3 className="text-sm font-bold text-slate-200 mt-0.5">{p.name}</h3>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      p.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {p.active ? 'Active' : 'Deactivated'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  States: {p.states.join(', ')} | Premium: ${p.premiumMin / 100} - ${p.premiumMax / 100} | Limit: ${p.sumInsured / 100}
                </p>

                {p.extractedSummary ? (
                  <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl">
                    <span className="text-[9px] font-bold text-teal-400 uppercase tracking-wider block mb-1">
                      AI Extracted Summary
                    </span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{p.extractedSummary}</p>
                  </div>
                ) : (
                  <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl">
                    <p className="text-[10px] text-amber-500">
                      Warning: No policy document uploaded. Upload a PDF below to enable plain language recommendations and RAG searches.
                    </p>
                  </div>
                )}
              </div>

              {/* Upload & Audit Actions */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-850">
                <label className="bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 px-3 py-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer select-none">
                  {uploadingId === p.id ? 'Uploading...' : 'Upload Policy PDF'}
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    disabled={uploadingId !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(p.id, file);
                    }}
                  />
                </label>

                {p.extractedSummary && (
                  <button
                    onClick={() => setAuditPolicyId(p.id)}
                    className="text-teal-400 hover:text-teal-300 text-[10px] font-bold"
                  >
                    Audit RAG Chunks
                  </button>
                )}

                <button
                  onClick={() => handleEditClick(p)}
                  className="ml-auto text-slate-400 hover:text-slate-300 text-[10px] font-bold"
                >
                  Edit Settings
                </button>
              </div>

              {/* Live Upload Status Message */}
              {uploadingId === p.id && (
                <p className="text-[9px] font-bold text-teal-400 animate-pulse mt-1">
                  {uploadStatus}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
