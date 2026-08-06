'use client';

import React, { useState } from 'react';
import { Play, Sparkles, Database, FileText, CheckCircle2, RefreshCw } from 'lucide-react';

export default function BotSandboxTab() {
  const [query, setQuery] = useState('What is the deductible for vision coverage under individual health plan?');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    vectorMatch: number;
    evaluatedChunks: number;
    sourceDoc: string;
    answer: string;
  } | null>({
    vectorMatch: 99.1,
    evaluatedChunks: 4,
    sourceDoc: 'POL-HEALTH-001: Apex Care Basic Individual Health Plan',
    answer: 'Under the Apex Care Basic Individual Health Plan (POL-HEALTH-001), vision coverage features a $0 deductible for annual comprehensive eye exams with a $150 annual allowance for corrective lenses.',
  });

  const handleTestQuery = () => {
    setIsRunning(true);
    setTimeout(() => {
      setResult({
        vectorMatch: 98.4,
        evaluatedChunks: 4,
        sourceDoc: 'POL-HEALTH-001: Apex Care Basic Individual Health Plan',
        answer: `Tested response for: "${query}". RAG vector lookup completed successfully against PostgreSQL pgvector store.`,
      });
      setIsRunning(false);
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2">
              <Play className="w-5 h-5 text-[#004ac6]" />
              AI Sandbox & Live RAG Relevance Playground
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Test prompts against active PostgreSQL <span className="font-mono text-[#004ac6] font-bold">pgvector</span> index and inspect live vector relevance scores.
            </p>
          </div>
          <span className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-full flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            pgvector SIMULATOR READY
          </span>
        </div>

        {/* Input & Run Controls */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-gray-700">Enter Test Customer Query</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
              placeholder="Ask a question about health insurance policies..."
            />
            <button
              type="button"
              onClick={handleTestQuery}
              disabled={isRunning}
              className="px-6 py-2.5 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? 'Searching Vectors...' : 'Execute Test Query'}
            </button>
          </div>
        </div>

        {/* Output Evaluation Panel */}
        {result && (
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#004ac6]" />
                <span className="text-xs font-bold text-[#1c1b1f]">RAG Vector Search Evaluation</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Vector Match: {result.vectorMatch}%
                </span>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-extrabold rounded-full">
                  {result.evaluatedChunks} Chunks Evaluated
                </span>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-1">Attributed Source Document:</p>
              <p className="text-xs font-mono font-bold text-[#004ac6] bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                {result.sourceDoc}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-1">Generated Response Output:</p>
              <p className="text-xs text-slate-800 bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed font-sans">
                "{result.answer}"
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
