'use client';

import {
  AlertCircle,
  Check,
  ChevronDown,
  Columns,
  Image as ImageIcon,
  Plus,
  Smile,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { uploadMediaFile } from '@/lib/marketing/upload-client';

export interface IdeaItem {
  id: string;
  title: string;
  body: string;
  status: string;
  tags: string[];
  mediaAssetId?: string | null;
  mediaAsset?: {
    id: string;
    filename: string;
    mimeType: string;
    storageKey: string;
  } | null;
  createdAt?: string;
}

const DEFAULT_GROUPS = [
  { id: 'UNASSIGNED', label: 'Unassigned' },
  { id: 'TO_DO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'DONE', label: 'Done' },
];

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys & Emotion',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😎', '🤩', '🤔', '👋', '🙌', '🤝', '👏', '🎉', '💬', '👀', '💯'],
  },
  {
    name: 'Creativity & Growth',
    emojis: ['🚀', '📈', '🔥', '✨', '💡', '🎯', '📊', '💼', '🏆', '🌟', '⚡', '🛠️', '⚙️', '💻', '📱', '📅', '📝', '✉️', '🔔', '📌', '🔖', '🔗', '⏳', '⭐', '✅'],
  },
];

interface IdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  idea?: IdeaItem | null;
  defaultStatus?: string;
  onSaved?: (idea: IdeaItem) => void;
  onDeleted?: (id: string) => void;
  onCreatePost?: (idea: { title: string; body: string; mediaAsset: IdeaItem['mediaAsset'] }) => void;
}

export function IdeaModal({
  isOpen,
  onClose,
  idea,
  defaultStatus = 'UNASSIGNED',
  onSaved,
  onDeleted,
  onCreatePost,
}: IdeaModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(defaultStatus);
  const [tags, setTags] = useState<string[]>([]);
  const [mediaAsset, setMediaAsset] = useState<IdeaItem['mediaAsset'] | null>(null);

  // Popovers
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // AI & Upload
  const [aiBusy, setAiBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (idea) {
        setTitle(idea.title);
        setBody(idea.body || '');
        setStatus(idea.status || 'UNASSIGNED');
        setTags(idea.tags || []);
        setMediaAsset(idea.mediaAsset || null);
      } else {
        setTitle('');
        setBody('');
        setStatus(defaultStatus);
        setTags([]);
        setMediaAsset(null);
      }
      setError('');
    }
  }, [isOpen, idea, defaultStatus]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function insertTextAtCursor(text: string) {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const updated = body.substring(0, start) + text + body.substring(end);
      setBody(updated);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + text.length;
          textareaRef.current.focus();
        }
      }, 10);
    } else {
      setBody((prev) => prev + text);
    }
  }

  async function uploadMedia(file: File) {
    setUploading(true);
    setError('');
    try {
      setMediaAsset(
        await uploadMediaFile<{ id: string; filename: string; mimeType: string; storageKey: string }>(file),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function generateWithAI() {
    setAiBusy(true);
    setError('');
    try {
      const prompt = title.trim() || 'Exciting marketing tips and industry insights';
      const data = await api<{ variations: { angle: string; caption: string }[] }>('/api/ai/copy', {
        brief: prompt,
        platform: 'FACEBOOK',
        count: 1,
      });
      if (data.variations.length > 0) {
        setBody(data.variations[0].caption);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Please give your idea a title');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (idea?.id) {
        // Update existing idea
        const res = await api<{ idea: IdeaItem }>(`/api/ideas/${idea.id}`, {
          title: title.trim(),
          body,
          status,
          tags,
          mediaAssetId: mediaAsset?.id ?? null,
        }, 'PATCH');
        if (onSaved) onSaved(res.idea);
      } else {
        // Create new idea
        const res = await api<{ idea: IdeaItem }>('/api/ideas', {
          title: title.trim(),
          body,
          status,
          tags,
          mediaAssetId: mediaAsset?.id ?? null,
        });
        if (onSaved) onSaved(res.idea);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save idea');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!idea?.id) return;
    if (!window.confirm('Delete this idea?')) return;
    setBusy(true);
    try {
      await api(`/api/ideas/${idea.id}`, undefined, 'DELETE');
      if (onDeleted) onDeleted(idea.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete idea');
    } finally {
      setBusy(false);
    }
  }

  function handleCreatePost() {
    if (onCreatePost) {
      onCreatePost({
        title,
        body,
        mediaAsset,
      });
      onClose();
    }
  }

  const currentGroupLabel = DEFAULT_GROUPS.find((g) => g.id === status)?.label ?? status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      {/* Idea Modal Card */}
      <div className="relative z-10 flex flex-col bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* 1. Header Bar: "New Idea", Status/Group dropdown, Tags dropdown, Close */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              {idea ? 'Edit Idea' : 'New Idea'}
            </h2>

            {/* Status / Group Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Columns className="h-3 w-3 text-slate-500" />
                <span>{currentGroupLabel}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {groupDropdownOpen && (
                <div className="absolute left-0 top-9 z-50 w-48 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 text-xs font-medium text-slate-700">
                  {DEFAULT_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setStatus(g.id);
                        setGroupDropdownOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-slate-50 transition"
                    >
                      <span>{g.label}</span>
                      {status === g.id && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tags Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setTagsDropdownOpen(!tagsDropdownOpen)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Tag className="h-3 w-3 text-slate-500" />
                <span>Tags</span>
                {tags.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-800 font-bold">
                    {tags.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {tagsDropdownOpen && (
                <div className="absolute left-0 top-9 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Idea Tags
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                      >
                        {t}
                        <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                          <X className="h-3 w-3 hover:text-emerald-950" />
                        </button>
                      </span>
                    ))}
                    {tags.length === 0 && (
                      <span className="text-xs text-slate-400 italic">There are no tags yet.</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="New tag..."
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-emerald-500"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTagInput.trim()) {
                          if (!tags.includes(newTagInput.trim())) setTags([...tags, newTagInput.trim()]);
                          setNewTagInput('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newTagInput.trim() && !tags.includes(newTagInput.trim())) {
                          setTags([...tags, newTagInput.trim()]);
                          setNewTagInput('');
                        }
                      }}
                      className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      New tag
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-xl bg-red-50 p-2.5 text-xs text-red-800 border border-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError('')}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* 2. Editor Canvas: Title, Body with AI prompt, Media Dropzone, Toolbar */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title Input */}
          <input
            type="text"
            placeholder="Give your idea a title"
            className="w-full text-base font-bold text-slate-900 placeholder:text-slate-400 outline-none border-b border-transparent focus:border-slate-200 pb-1.5 transition"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Body Textarea with Inline AI Button */}
          <div className="relative min-h-[140px]">
            <textarea
              ref={textareaRef}
              rows={5}
              placeholder="Idea text"
              className="w-full text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 outline-none resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />

            {!body && (
              <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                <span>Thinking... thinking... or</span>
                <button
                  type="button"
                  onClick={generateWithAI}
                  disabled={aiBusy}
                  className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3 text-purple-600" />
                  <span>{aiBusy ? 'Generating...' : 'Use the AI Assistant'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Media Dropzone Square */}
          <div>
            {mediaAsset ? (
              <div className="relative inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 pr-4 shadow-sm">
                {mediaAsset.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/media/${mediaAsset.storageKey}`}
                    alt="Uploaded file"
                    className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                    <Video className="h-6 w-6" />
                  </div>
                )}
                <div className="truncate max-w-[200px]">
                  <div className="truncate text-xs font-bold text-slate-800">{mediaAsset.filename}</div>
                  <div className="text-[10px] text-slate-400 uppercase">{mediaAsset.mimeType}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMediaAsset(null)}
                  className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-red-100 hover:text-red-700 transition"
                  title="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label
                className={`flex h-28 w-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-2 text-center transition ${
                  uploading
                    ? 'border-emerald-500 bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50/50 hover:border-emerald-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,video/mp4,video/quicktime"
                  disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0])}
                />
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm mb-1.5">
                  {uploading ? (
                    <Upload className="h-4 w-4 animate-bounce text-emerald-600" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </div>
                <span className="text-[10px] font-semibold text-slate-700 leading-tight">
                  Drag & drop or <span className="text-emerald-600">select a file</span>
                </span>
              </label>
            )}
          </div>

          {/* In-Editor Bottom Toolbar: + v Integrations, Emoji, AI Assistant */}
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
            {/* + Integrations Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIntegrationsOpen(!integrationsOpen);
                  setEmojiPickerOpen(false);
                }}
                className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {integrationsOpen && (
                <div className="absolute left-0 bottom-10 z-50 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 text-xs font-medium text-slate-700">
                  <button
                    type="button"
                    onClick={() => setIntegrationsOpen(false)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    <span>Canva</span>
                    <span className="text-slate-400 text-[10px]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntegrationsOpen(false)}
                    className="flex w-full items-center rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    Dropbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntegrationsOpen(false)}
                    className="flex w-full items-center rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    Google Drive
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntegrationsOpen(false)}
                    className="flex w-full items-center rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    Google Photos
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntegrationsOpen(false)}
                    className="flex w-full items-center rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    OneDrive
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntegrationsOpen(false)}
                    className="flex w-full items-center rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    Unsplash
                  </button>
                </div>
              )}
            </div>

            {/* Emoji Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setEmojiPickerOpen(!emojiPickerOpen);
                  setIntegrationsOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
                title="Insert emoji"
              >
                <Smile className="h-4 w-4" />
              </button>

              {emojiPickerOpen && (
                <div className="absolute left-0 bottom-10 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="text-xs font-bold text-slate-800">Insert Emoji</span>
                    <button type="button" onClick={() => setEmojiPickerOpen(false)}>
                      <X className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {EMOJI_CATEGORIES.map((cat) => (
                      <div key={cat.name}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                          {cat.name}
                        </div>
                        <div className="grid grid-cols-6 gap-1">
                          {cat.emojis.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => insertTextAtCursor(` ${emoji} `)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-slate-100 transition"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Assistant Button */}
            <button
              type="button"
              onClick={generateWithAI}
              disabled={aiBusy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5 text-purple-600" />
              <span>{aiBusy ? 'Generating...' : 'AI Assistant'}</span>
            </button>
          </div>
        </div>

        {/* 3. Footer Bar: Delete (if editing), Save Idea, and Create Post */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4 shrink-0">
          <div>
            {idea?.id ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 transition disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Idea</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Create Post Button (Converts idea to post composer) */}
            <button
              type="button"
              onClick={handleCreatePost}
              disabled={!title.trim() && !body.trim()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-40"
              title="Convert this idea into a scheduled post"
            >
              Create Post
            </button>

            {/* Save Idea Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !title.trim()}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-40"
            >
              {busy ? 'Saving...' : 'Save Idea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
