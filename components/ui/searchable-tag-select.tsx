'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag, ChevronDown, Check, X, Loader2 } from 'lucide-react';

interface TagItem {
  name: string;
  count: number;
}

interface SearchableTagSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const DEFAULT_SUGGESTIONS = ['VIP', 'Lead', 'Renewal Due', 'Policyholder', 'Priority', 'New Intake'];

export function SearchableTagSelect({ value, onChange, disabled }: SearchableTagSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: dbTags = [], isLoading } = useQuery<TagItem[]>({
    queryKey: ['customer-tags'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/customers/tags');
      if (!res.ok) throw new Error('Failed to load customer tags');
      return res.json();
    },
  });

  // Sync external value changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Merge DB tags with fallback defaults if DB tags are few
  const allTagMap = new Map<string, number>();
  for (const t of dbTags) {
    allTagMap.set(t.name, t.count);
  }
  for (const s of DEFAULT_SUGGESTIONS) {
    if (!allTagMap.has(s)) {
      allTagMap.set(s, 0);
    }
  }

  const allTagsList: TagItem[] = Array.from(allTagMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  const filteredTags = allTagsList.filter((t) =>
    t.name.toLowerCase().includes(inputValue.trim().toLowerCase())
  );

  const isExactMatch = allTagsList.some(
    (t) => t.name.toLowerCase() === inputValue.trim().toLowerCase()
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);
    onChange(text);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelectTag = (tagName: string) => {
    setInputValue(tagName);
    onChange(tagName);
    setIsOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative w-full">
        {/* Left Tag Icon */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#737686]">
          <Tag className={`w-3.5 h-3.5 ${inputValue ? 'text-[#004ac6]' : 'text-[#737686]'}`} />
        </div>

        {/* Direct Input Field */}
        <input
          ref={inputRef}
          id="tag-value-input"
          type="text"
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="Type or select a tag (e.g. VIP, Lead)..."
          className={`w-full bg-slate-50 border border-[#c3c6d7] rounded-xl pl-9 pr-16 py-2 text-xs font-semibold text-[#1c1b1f] focus:outline-none focus:bg-white focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/10 transition-all ${
            disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''
          }`}
        />

        {/* Right Action Icons */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {inputValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition-colors"
              title="Clear tag"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-[#737686] hover:text-[#004ac6] rounded-md transition-colors"
            title="Toggle tag list"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-[#004ac6]' : ''
              }`}
            />
          </button>
        </div>

        {/* Dropdown Menu */}
        {isOpen && !disabled && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#c3c6d7] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] font-bold text-[#737686]">
              <span>AVAILABLE TAGS</span>
              {isLoading && (
                <span className="flex items-center gap-1 text-[#004ac6]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                </span>
              )}
            </div>

            <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5">
              {filteredTags.length > 0 ? (
                filteredTags.map((tag) => {
                  const isSelected = inputValue.trim().toLowerCase() === tag.name.toLowerCase();
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => handleSelectTag(tag.name)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-[#004ac6]/10 text-[#004ac6] font-bold'
                          : 'text-[#1c1b1f] hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Tag className={`w-3 h-3 shrink-0 ${isSelected ? 'text-[#004ac6]' : 'text-slate-400'}`} />
                        <span className="truncate">{tag.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            tag.count > 0
                              ? 'bg-blue-50 text-[#004ac6]'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {tag.count} {tag.count === 1 ? 'contact' : 'contacts'}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#004ac6]" />}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-3 px-3 text-center text-xs text-[#737686]">
                  No matching tags found
                </div>
              )}

              {/* Custom Tag Option when typing something new */}
              {inputValue.trim() && !isExactMatch && (
                <div className="pt-1 mt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSelectTag(inputValue.trim())}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg text-left text-[#004ac6] hover:bg-[#004ac6]/5 font-semibold transition-colors"
                  >
                    <Tag className="w-3 h-3 text-[#004ac6]" />
                    <span>Apply custom tag: <strong className="underline">"{inputValue.trim()}"</strong></span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Select Suggestion Badges */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-[10px] font-semibold text-[#737686]">Quick select:</span>
        {allTagsList.slice(0, 5).map((tag) => (
          <button
            key={tag.name}
            type="button"
            onClick={() => handleSelectTag(tag.name)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
              inputValue.trim().toLowerCase() === tag.name.toLowerCase()
                ? 'bg-[#004ac6] text-white border-[#004ac6] font-bold shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:border-[#004ac6] hover:text-[#004ac6] font-medium'
            }`}
          >
            {tag.name} {tag.count > 0 && <span className="opacity-80">({tag.count})</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
