'use client';

import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Hash,
  Heart,
  Image as ImageIcon,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  Repeat,
  Send,
  Share2,
  Smile,
  Sparkles,
  Tag,
  ThumbsUp,
  Upload,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TwitterIcon,
  YouTubeIcon,
} from '@/components/marketing/SocialIcons';
import { StatusBadge } from '@/components/marketing/StatusBadge';
import { api, ApiError } from '@/lib/api-client';
import { uploadMediaFile } from '@/lib/marketing/upload-client';
import type { AuditResult } from '@/lib/marketing/compliance';
import type { Platform } from '@/lib/marketing/platforms/types';

interface Account {
  id: string;
  platform: string;
  accountName: string;
  status: string;
  expiresAt: string | null;
}

interface Asset {
  id: string;
  filename: string;
  mimeType: string;
  storageKey: string;
}

interface Variation {
  angle: string;
  caption: string;
}

// 5 Official Social Media Platforms (Threads, Instagram, Facebook, Twitter, YouTube)
export const SUPPORTED_NETWORKS = [
  {
    id: 'THREADS',
    label: 'Threads',
    icon: ThreadsIcon,
    charLimit: 500,
    color: '#000000',
    defaultAccount: '@brand_threads',
  },
  {
    id: 'INSTAGRAM',
    label: 'Instagram',
    icon: InstagramIcon,
    charLimit: 2200,
    color: '#E1306C',
    defaultAccount: '@brand_instagram',
  },
  {
    id: 'FACEBOOK',
    label: 'Facebook',
    icon: FacebookIcon,
    charLimit: 63206,
    color: '#1877F2',
    defaultAccount: 'Brand Facebook Page',
  },
  {
    id: 'TWITTER',
    label: 'X (Twitter)',
    icon: TwitterIcon,
    charLimit: 280,
    color: '#0F1419',
    defaultAccount: '@brand_x',
  },
  {
    id: 'YOUTUBE',
    label: 'YouTube',
    icon: YouTubeIcon,
    charLimit: 5000,
    color: '#FF0000',
    defaultAccount: 'Brand YouTube Channel',
  },
] as const;

type SupportedPlatformId = (typeof SUPPORTED_NETWORKS)[number]['id'];

// Built-in Templates matching Discover Library
const TEMPLATES_DISCOVER = [
  {
    id: 'notes_report',
    title: 'Report back on your first week of Notes',
    description: 'For the end of your first week of Notes. One number is enough, even a small one.',
    category: 'Start on Substack Notes',
    content:
      'Week 1 milestone report 📊\n\nOne small number that made my week: [Insert Milestone / Stat].\n\nWhat worked:\n- [Key Insight 1]\n- [Key Insight 2]\n\nConsistency > intensity. On to week 2!',
  },
  {
    id: 'tease_idea',
    title: 'Tease an idea you could write a whole post about',
    description: 'For an idea with more to it than one Note can hold. The first half should be useful on its own.',
    category: 'Thought Leadership',
    content:
      'Quick thought on [Topic]:\n\nMost people think [Common View]. But after analyzing [Data / Experience], the opposite is true.\n\nHere is the short version:\n👉 [Key Takeaway]\n\nWriting a deeper breakdown on this soon. What would you like me to cover?',
  },
  {
    id: 'pas_framework',
    title: 'Problem-Agitate-Solve (PAS)',
    description: 'Hook your audience by highlighting a real pain point, then present your solution clearly.',
    category: 'Marketing Framework',
    content:
      'Most marketing teams struggle with [Insert Problem].\n\nIt leads to wasted budget, missed deadlines, and endless meetings without results.\n\nHere is how we fixed it in 3 steps:\n1. [Step 1]\n2. [Step 2]\n3. [Step 3]\n\nTry this approach and let me know your thoughts!',
  },
  {
    id: 'before_after',
    title: 'Before vs After Transformation',
    description: 'Showcase real growth and transformation using contrasting milestones.',
    category: 'Case Study',
    content:
      '6 months ago:\n❌ Spending 15 hours/week on manual social posting\n❌ Zero consistent inbound pipeline\n\nToday:\n✅ 1 automated hub managing all channels\n✅ 3.4x increase in organic engagement\n\nThe 1 thing that changed everything? [Insert Key Insight].',
  },
  {
    id: 'feature_announcement',
    title: 'Product / Feature Launch Announcement',
    description: 'Introduce a new release with key benefits, screenshots, and an engaging CTA.',
    category: 'Product Launch',
    content:
      '🚀 Big news! Today we are launching [New Feature/Product].\n\nBuilt specifically for [Target Audience] who want to [Core Benefit] without [Friction Point].\n\nKey highlights:\n✨ [Highlight 1]\n✨ [Highlight 2]\n✨ [Highlight 3]\n\nTry it now: [Link]',
  },
];

// Emoji Groups
const EMOJI_CATEGORIES = [
  {
    name: 'Smileys & People',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😎', '🤩', '🤔', '👋', '🙌', '🤝', '👏', '🎉', '💬', '👀', '💯'],
  },
  {
    name: 'Growth & Work',
    emojis: ['🚀', '📈', '🔥', '✨', '💡', '🎯', '📊', '💼', '🏆', '🌟', '⚡', '🛠️', '⚙️', '💻', '📱', '📅', '📝', '✉️', '🔔', '📌', '🔖', '🔗', '⏳', '⭐', '✅'],
  },
];

// Hashtag Packs
const HASHTAG_PACKS = [
  {
    title: 'Marketing & Growth',
    tags: ['#digitalmarketing', '#growthmarketing', '#socialmediamarketing', '#contentstrategy', '#brandgrowth'],
  },
  {
    title: 'SaaS & Tech',
    tags: ['#saas', '#techinnovation', '#startup', '#automation', '#productivity', '#futureofwork'],
  },
  {
    title: 'Creator & Leadership',
    tags: ['#buildinpublic', '#creatoreconomy', '#leadership', '#entrepreneurship', '#founderstories'],
  },
];

function newRequestId() {
  return crypto.randomUUID();
}

interface PostComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialBrief?: string;
  initialCaption?: string;
  initialTitle?: string;
  initialAsset?: Asset | null;
}

export function PostComposerModal({
  isOpen,
  onClose,
  onSuccess,
  initialBrief,
  initialCaption,
  initialTitle,
  initialAsset,
}: PostComposerModalProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<SupportedPlatformId[]>(['TWITTER', 'THREADS']);
  const [activeChannel, setActiveChannel] = useState<SupportedPlatformId>('TWITTER');

  // Text content & overrides per platform
  const [caption, setCaption] = useState(initialCaption || '');
  const [title, setTitle] = useState(initialTitle || '');
  const [firstComment, setFirstComment] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [aiGeneratedToggle, setAiGeneratedToggle] = useState(false);

  // Attachments
  const [asset, setAsset] = useState<Asset | null>(initialAsset || null);
  const [uploading, setUploading] = useState(false);

  // Tags & Fullscreen
  const [isExpanded, setIsExpanded] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // Right Drawer View ('preview' | 'ai' | 'templates')
  const [rightPanelMode, setRightPanelMode] = useState<'preview' | 'ai' | 'templates'>('preview');
  const [previewPlatform, setPreviewPlatform] = useState<SupportedPlatformId>('TWITTER');

  // Popovers inside Editor
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [hashtagPickerOpen, setHashtagPickerOpen] = useState(false);
  const [firstCommentOpen, setFirstCommentOpen] = useState(false);

  // Templates Tab
  const [templateTab, setTemplateTab] = useState<'discover' | 'personal'>('discover');
  const [templateSearch, setTemplateSearch] = useState('');

  // AI Assistant State
  const [brief, setBrief] = useState(initialBrief || '');
  const [variations, setVariations] = useState<Variation[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  // Compliance & Submission
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditOverride, setAuditOverride] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validation, setValidation] = useState<Record<string, string[]> | null>(null);

  const requestId = useRef(newRequestId());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load connected accounts from DB and sync initial props
  useEffect(() => {
    if (isOpen) {
      if (initialCaption !== undefined) setCaption(initialCaption);
      if (initialTitle !== undefined) setTitle(initialTitle);
      if (initialBrief !== undefined) setBrief(initialBrief);
      if (initialAsset !== undefined) setAsset(initialAsset);
      loadAccounts();
    }
  }, [isOpen, initialCaption, initialTitle, initialBrief, initialAsset]);

  function loadAccounts() {
    api<{ accounts: Account[] }>('/api/accounts')
      .then((data) => {
        setAccounts(data.accounts);
        if (data.accounts.length > 0) {
          const valid = data.accounts.find((a) =>
            SUPPORTED_NETWORKS.some((net) => net.id === a.platform)
          );
          if (valid) {
            setSelectedChannels([valid.platform as SupportedPlatformId]);
            setActiveChannel(valid.platform as SupportedPlatformId);
            setPreviewPlatform(valid.platform as SupportedPlatformId);
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }

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

  // Sync active platform with preview
  useEffect(() => {
    setPreviewPlatform(activeChannel);
  }, [activeChannel]);

  if (!isOpen) return null;

  const currentNetwork = SUPPORTED_NETWORKS.find((n) => n.id === activeChannel) || SUPPORTED_NETWORKS[0];
  const activeCaption = overrides[activeChannel] !== undefined ? overrides[activeChannel] : caption;
  const currentLimit = currentNetwork.charLimit;
  const remainingChars = currentLimit - [...activeCaption].length;

  function toggleChannel(platformId: SupportedPlatformId) {
    if (selectedChannels.includes(platformId)) {
      if (selectedChannels.length === 1) return; // Keep at least one
      const updated = selectedChannels.filter((c) => c !== platformId);
      setSelectedChannels(updated);
      if (activeChannel === platformId) setActiveChannel(updated[0]);
    } else {
      setSelectedChannels([...selectedChannels, platformId]);
      setActiveChannel(platformId);
    }
  }

  function insertTextAtCursor(text: string) {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const updated = activeCaption.substring(0, start) + text + activeCaption.substring(end);
      if (activeChannel === selectedChannels[0] && overrides[activeChannel] === undefined) {
        setCaption(updated);
      } else {
        setOverrides({ ...overrides, [activeChannel]: updated });
      }
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + text.length;
          textareaRef.current.focus();
        }
      }, 10);
    } else {
      setCaption((prev) => prev + text);
    }
  }

  async function uploadMedia(file: File) {
    setUploading(true);
    setError('');
    try {
      setAsset(await uploadMediaFile<Asset>(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function generateAI() {
    setAiBusy(true);
    setError('');
    try {
      // Map platform for AI generation
      const apiPlatform: Platform =
        activeChannel === 'TWITTER' || activeChannel === 'THREADS'
          ? 'FACEBOOK'
          : (activeChannel as Platform);

      const data = await api<{ variations: Variation[] }>('/api/ai/copy', {
        brief,
        platform: apiPlatform,
        count: 3,
      });
      setVariations(data.variations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function submitPost() {
    setBusy(true);
    setError('');
    setValidation(null);
    setSuccess('');

    // Only ever post to accounts the user really connected, on the channels they picked
    const targetAccountIds = accounts
      .filter((a) => selectedChannels.includes(a.platform as SupportedPlatformId))
      .map((a) => a.id);
    const missing = selectedChannels.filter((channel) => !accounts.some((a) => a.platform === channel));
    if (missing.length > 0 || targetAccountIds.length === 0) {
      setError(
        missing.length > 0
          ? `Connect ${missing.join(', ')} on the Channels page, or deselect it, before publishing.`
          : 'Select at least one channel.',
      );
      setBusy(false);
      return;
    }

    const accountOverrides = Object.fromEntries(
      accounts
        .filter((a) => targetAccountIds.includes(a.id) && overrides[a.platform as SupportedPlatformId] !== undefined)
        .map((a) => [a.id, overrides[a.platform as SupportedPlatformId]]),
    );

    try {
      const res = await api<{ post: { approvalStatus: string | null } }>('/api/posts', {
        clientRequestId: requestId.current,
        title: title || 'Social Post',
        caption: caption || activeCaption,
        mediaAssetId: asset?.id ?? null,
        accountIds: targetAccountIds,
        captionOverrides: accountOverrides,
        scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : null,
        overrideAudit: auditOverride,
      });

      setSuccess(
        res.post.approvalStatus === 'PENDING'
          ? '📨 Sent for approval. It publishes once the client or an admin approves it (see Approvals).'
          : scheduleAt
          ? '🎉 Post scheduled successfully! Track it on the Posts page.'
          : '🚀 Queued for publishing! Track it on the Posts page.'
      );
      requestId.current = newRequestId();
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1400);
    } catch (err) {
      if (err instanceof ApiError && err.details?.validation) setValidation(err.details.validation);
      if (err instanceof ApiError && err.details?.audit) {
        setAudit({ score: 0, hasCritical: true, findings: err.details.audit });
      }
      setError(err instanceof Error ? err.message : 'Failed to publish post');
    } finally {
      setBusy(false);
    }
  }

  const filteredTemplates = TEMPLATES_DISCOVER.filter(
    (t) =>
      t.title.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.description.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.category.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const ActiveIcon = currentNetwork.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      {/* Click outside backdrop listener */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div
        ref={modalRef}
        className={`relative z-10 flex flex-col bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden transition-all duration-200 ${
          isExpanded ? 'w-full max-w-[98vw] h-[95vh]' : 'w-full max-w-5xl h-[86vh] max-h-[820px]'
        }`}
      >
        {/* 1. Header Bar: Title, Tags ▾, Templates, AI Assistant, Preview, Fullscreen, Close */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold tracking-tight text-slate-900">Create Post</h2>

            {/* Tags ▾ Dropdown Button */}
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
                    Campaign Tags
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
                      <span className="text-xs text-slate-400 italic">No tags selected</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Add tag..."
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
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Header Buttons: Templates, AI Assistant, Preview Toggle, Fullscreen, Close */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRightPanelMode(rightPanelMode === 'templates' ? 'preview' : 'templates')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                rightPanelMode === 'templates'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Templates</span>
            </button>

            <button
              type="button"
              onClick={() => setRightPanelMode(rightPanelMode === 'ai' ? 'preview' : 'ai')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                rightPanelMode === 'ai'
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              <span>AI Assistant</span>
            </button>

            <button
              type="button"
              onClick={() => setRightPanelMode(rightPanelMode === 'preview' ? 'templates' : 'preview')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                rightPanelMode === 'preview'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Eye className="h-3.5 w-3.5 text-emerald-600" />
              <span>Preview</span>
            </button>

            <div className="mx-1 h-4 w-px bg-slate-200" />

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title={isExpanded ? 'Collapse' : 'Expand full screen'}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Close composer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. Official Social Media Network Selector (Only Threads, Instagram, Facebook, Twitter, YouTube) */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-3 shrink-0 overflow-x-auto bg-slate-50/50">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Channels:
          </span>
          {SUPPORTED_NETWORKS.map((net) => {
            const isSelected = selectedChannels.includes(net.id);
            const Icon = net.icon;
            return (
              <button
                key={net.id}
                type="button"
                onClick={() => toggleChannel(net.id)}
                title={`${net.label} (${isSelected ? 'Selected' : 'Click to select'})`}
                className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition shadow-sm ${
                  isSelected
                    ? 'border-2 border-slate-900 bg-white text-slate-900 ring-2 ring-slate-900/10'
                    : 'border border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon size={18} />
                {isSelected && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
                    <Check className="h-2 w-2 text-white stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Alert Notifications */}
        {error && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError('')}>
              <X className="h-3.5 w-3.5 text-red-600" />
            </button>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 border border-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* 3. Main Split Content Area */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
          {/* Left Side (7 cols): Active Editor Card & Stacked Collapsed Cards */}
          <div className="flex flex-col overflow-y-auto p-6 md:col-span-7 border-r border-slate-100 space-y-4">
            {/* Active Platform Editor Card */}
            <div className="flex flex-col flex-1 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm space-y-3">
              {/* Card Header: Official Icon & Limit Counter */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm shrink-0">
                    <ActiveIcon size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900">{currentNetwork.label}</span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 font-semibold">
                      {currentNetwork.defaultAccount}
                    </span>
                  </div>
                </div>
                {/* Character Counter */}
                <span
                  className={`font-mono text-xs font-semibold ${
                    remainingChars < 0
                      ? 'text-red-600 font-bold'
                      : remainingChars < 30
                      ? 'text-amber-600 font-bold'
                      : 'text-slate-400'
                  }`}
                >
                  {remainingChars}
                </span>
              </div>

              {/* YouTube Title field (if YouTube is active) */}
              {activeChannel === 'YOUTUBE' && (
                <div>
                  <input
                    type="text"
                    placeholder="YouTube Video Title (required)"
                    maxLength={100}
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-red-500"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              )}

              {/* Main Textarea */}
              <textarea
                ref={textareaRef}
                rows={5}
                placeholder="Start writing or get inspired with 📄 Templates"
                className="w-full flex-1 resize-none border-none p-1 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                value={activeCaption}
                onChange={(e) => {
                  const val = e.target.value;
                  if (activeChannel === selectedChannels[0] && overrides[activeChannel] === undefined) {
                    setCaption(val);
                  } else {
                    setOverrides({ ...overrides, [activeChannel]: val });
                  }
                }}
              />

              {/* Media Upload Square Dropzone */}
              <div>
                {asset ? (
                  <div className="relative inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 pr-4 shadow-sm">
                    {asset.mimeType.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/media/${asset.storageKey}`}
                        alt="Upload"
                        className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                        <Video className="h-6 w-6" />
                      </div>
                    )}
                    <div className="truncate max-w-[200px]">
                      <div className="truncate text-xs font-bold text-slate-800">{asset.filename}</div>
                      <div className="text-[10px] text-slate-400 uppercase">{asset.mimeType}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAsset(null)}
                      className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-red-100 hover:text-red-700 transition"
                      title="Remove file"
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

              {/* In-Card Bottom Toolbar: + v, Emoji, Hashtags, Start Thread / First Comment, AI-Generated Toggle */}
              <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 text-slate-600">
                <div className="flex items-center gap-1.5">
                  {/* + Integrations Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIntegrationsOpen(!integrationsOpen);
                        setEmojiPickerOpen(false);
                        setHashtagPickerOpen(false);
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

                  {/* Emoji Picker Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setEmojiPickerOpen(!emojiPickerOpen);
                        setIntegrationsOpen(false);
                        setHashtagPickerOpen(false);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
                      title="Insert emoji"
                    >
                      <Smile className="h-4 w-4" />
                    </button>

                    {emojiPickerOpen && (
                      <div className="absolute left-0 bottom-10 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                          <input
                            type="text"
                            placeholder="Search emoji..."
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-emerald-500"
                            value={emojiSearch}
                            onChange={(e) => setEmojiSearch(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => setEmojiPickerOpen(false)}
                            className="ml-2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
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

                  {/* Hashtags Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setHashtagPickerOpen(!hashtagPickerOpen);
                        setIntegrationsOpen(false);
                        setEmojiPickerOpen(false);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
                      title="Insert hashtags"
                    >
                      <Hash className="h-4 w-4" />
                    </button>

                    {hashtagPickerOpen && (
                      <div className="absolute left-0 bottom-10 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                          <span className="text-xs font-bold text-slate-800">Hashtag Packs</span>
                          <button
                            type="button"
                            onClick={() => setHashtagPickerOpen(false)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="space-y-2.5 max-h-48 overflow-y-auto">
                          {HASHTAG_PACKS.map((pack) => (
                            <div key={pack.title} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-slate-800">{pack.title}</span>
                                <button
                                  type="button"
                                  onClick={() => insertTextAtCursor(`\n\n${pack.tags.join(' ')}`)}
                                  className="text-[10px] font-bold text-emerald-600 hover:underline"
                                >
                                  + Add all
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {pack.tags.map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => insertTextAtCursor(` ${tag}`)}
                                    className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:text-emerald-700"
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Channel-Specific Helper: + Start Thread / + Add First Comment */}
                  {(activeChannel === 'TWITTER' || activeChannel === 'THREADS') && (
                    <button
                      type="button"
                      onClick={() => insertTextAtCursor('\n\n🧵 2/ ')}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Start Thread</span>
                    </button>
                  )}

                  {(activeChannel === 'INSTAGRAM' || activeChannel === 'FACEBOOK') && (
                    <button
                      type="button"
                      onClick={() => setFirstCommentOpen(!firstCommentOpen)}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                        firstCommentOpen || firstComment
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>First Comment</span>
                    </button>
                  )}
                </div>

                {/* AI-Generated Toggle Switch */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">AI-Generated</span>
                  <button
                    type="button"
                    onClick={() => setAiGeneratedToggle(!aiGeneratedToggle)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      aiGeneratedToggle ? 'bg-slate-900' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        aiGeneratedToggle ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* First comment drawer if active */}
              {firstCommentOpen && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span>First Comment ({currentNetwork.label})</span>
                    <button type="button" onClick={() => setFirstCommentOpen(false)}>
                      <X className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Link or extra hashtags to post as the first comment..."
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs outline-none focus:border-emerald-500"
                    value={firstComment}
                    onChange={(e) => setFirstComment(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Stacked Collapsed Cards for other selected channels */}
            {selectedChannels
              .filter((c) => c !== activeChannel)
              .map((channelId) => {
                const net = SUPPORTED_NETWORKS.find((b) => b.id === channelId);
                const Icon = net?.icon || TwitterIcon;
                const customText = overrides[channelId] || caption;
                return (
                  <div
                    key={channelId}
                    onClick={() => setActiveChannel(channelId)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:bg-slate-50 transition shadow-sm"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-xs shrink-0 shadow-sm">
                        <Icon size={14} />
                      </div>
                      <span className="truncate text-xs text-slate-700 font-medium">
                        {customText || `Customize post for ${net?.label}...`}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-600 shrink-0 ml-2">Customize →</span>
                  </div>
                );
              })}
          </div>

          {/* Right Side (5 cols): 3-Mode Sidecar (Preview, AI Assistant, Templates) */}
          <div className="flex flex-col overflow-y-auto p-6 md:col-span-5 bg-slate-50/50">
            {/* Mode 1: Live WYSIWYG Platform Previews */}
            {rightPanelMode === 'preview' && (
              <div className="flex flex-col flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    {SUPPORTED_NETWORKS.find((b) => b.id === previewPlatform)?.label ?? 'Live'} Preview ⓘ
                  </span>
                  {/* Quick sub-preview switcher with official icons */}
                  <div className="flex items-center gap-1">
                    {selectedChannels.map((p) => {
                      const net = SUPPORTED_NETWORKS.find((b) => b.id === p);
                      const Icon = net?.icon || TwitterIcon;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPreviewPlatform(p)}
                          title={`Preview ${net?.label}`}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg transition shadow-sm ${
                            previewPlatform === p ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Icon size={13} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* WYSIWYG Preview Card Container */}
                <div className="flex-1 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  {/* 1. Twitter / X Preview */}
                  {previewPlatform === 'TWITTER' && (
                    <div className="space-y-3 font-sans">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shrink-0 shadow-sm">
                          <TwitterIcon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-900">Marketing Hub</span>
                            <span className="text-[11px] text-slate-500">@marketinghub · 1m</span>
                          </div>
                          <div className="mt-1 text-xs leading-relaxed text-slate-900 whitespace-pre-wrap">
                            {activeCaption || 'See your post’s preview here'}
                          </div>
                          {asset && asset.mimeType.startsWith('image/') && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/media/${asset.storageKey}`}
                              alt="Attached"
                              className="mt-2.5 w-full rounded-2xl object-cover border border-slate-200 max-h-56"
                            />
                          )}
                          <div className="mt-3 flex items-center justify-between text-slate-400 text-xs max-w-xs">
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5" /> 14
                            </div>
                            <div className="flex items-center gap-1">
                              <Repeat className="h-3.5 w-3.5" /> 8
                            </div>
                            <div className="flex items-center gap-1">
                              <Heart className="h-3.5 w-3.5" /> 67
                            </div>
                            <div className="flex items-center gap-1">
                              <Share2 className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Threads Preview */}
                  {previewPlatform === 'THREADS' && (
                    <div className="space-y-3 font-sans">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shrink-0 shadow-sm">
                          <ThreadsIcon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900">marketinghub_threads</span>
                              <span className="text-[10px] text-slate-400">1m</span>
                            </div>
                            <span className="text-slate-400 font-bold text-xs">•••</span>
                          </div>
                          <div className="mt-1 text-xs leading-relaxed text-slate-900 whitespace-pre-wrap">
                            {activeCaption || 'See your Threads post preview here'}
                          </div>
                          {asset && asset.mimeType.startsWith('image/') && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/media/${asset.storageKey}`}
                              alt="Attached"
                              className="mt-2.5 w-full rounded-2xl object-cover border border-slate-200 max-h-56"
                            />
                          )}
                          <div className="mt-3 flex items-center gap-4 text-slate-600 text-xs">
                            <Heart className="h-4 w-4 cursor-pointer hover:text-red-500" />
                            <MessageSquare className="h-4 w-4 cursor-pointer" />
                            <Repeat className="h-4 w-4 cursor-pointer" />
                            <Send className="h-4 w-4 cursor-pointer" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Instagram Preview */}
                  {previewPlatform === 'INSTAGRAM' && (
                    <div className="space-y-3 font-sans">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-rose-600 text-white shrink-0 shadow-sm">
                            <InstagramIcon size={14} />
                          </div>
                          <span className="text-xs font-bold text-slate-900">marketinghub_app</span>
                        </div>
                        <span className="text-slate-400 font-bold">•••</span>
                      </div>
                      {asset && asset.mimeType.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/media/${asset.storageKey}`}
                          alt="Feed"
                          className="w-full aspect-square rounded-xl object-cover border border-slate-100"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-100 text-slate-400 text-xs text-center p-4">
                          Add an image to view full Instagram card
                        </div>
                      )}
                      <div className="space-y-1 text-xs">
                        <div className="font-bold text-slate-900">142 likes</div>
                        <div>
                          <span className="font-bold text-slate-900 mr-1.5">marketinghub_app</span>
                          <span className="text-slate-800 whitespace-pre-wrap">
                            {activeCaption || 'Your caption here...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. Facebook Preview */}
                  {previewPlatform === 'FACEBOOK' && (
                    <div className="space-y-3 font-sans">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1877F2] text-white shrink-0 shadow-sm">
                          <FacebookIcon size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900">Marketing Hub Official</div>
                          <div className="text-[10px] text-slate-400">Just now · 🌐 Public</div>
                        </div>
                      </div>
                      <div className="text-xs leading-relaxed text-slate-900 whitespace-pre-wrap">
                        {activeCaption || 'Your post will appear here...'}
                      </div>
                      {asset && asset.mimeType.startsWith('image/') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/media/${asset.storageKey}`}
                          alt="Attached"
                          className="w-full rounded-xl object-cover border border-slate-100 max-h-56"
                        />
                      )}
                      <div className="flex items-center justify-between border-t border-b border-slate-100 py-1.5 text-xs font-semibold text-slate-600">
                        <div className="flex items-center justify-center gap-1 flex-1 py-1 rounded cursor-pointer">
                          <ThumbsUp className="h-3.5 w-3.5 text-blue-600" /> Like
                        </div>
                        <div className="flex items-center justify-center gap-1 flex-1 py-1 rounded cursor-pointer">
                          <MessageSquare className="h-3.5 w-3.5" /> Comment
                        </div>
                        <div className="flex items-center justify-center gap-1 flex-1 py-1 rounded cursor-pointer">
                          <Share2 className="h-3.5 w-3.5" /> Share
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. YouTube Preview */}
                  {previewPlatform === 'YOUTUBE' && (
                    <div className="space-y-3 font-sans">
                      <div className="relative aspect-video w-full rounded-xl bg-slate-900 flex items-center justify-center text-white overflow-hidden">
                        {asset && asset.mimeType.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/media/${asset.storageKey}`}
                            alt="Video Thumbnail"
                            className="w-full h-full object-cover opacity-80"
                          />
                        ) : (
                          <div className="text-xs text-slate-400">Video Player Preview</div>
                        )}
                        <div className="absolute flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
                          <YouTubeIcon size={16} />
                        </div>
                      </div>
                      <div className="font-bold text-xs text-slate-900">
                        {title || 'Video Title Will Appear Here'}
                      </div>
                      <div className="text-[11px] text-slate-500">Marketing Hub • 0 views • Just now</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mode 2: AI Assistant */}
            {rightPanelMode === 'ai' && (
              <div className="flex flex-col flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-bold text-purple-600">AI Assistant</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">What do you want to write about?</label>
                  <textarea
                    rows={4}
                    placeholder="Eg. Promote my photography course to get new signups. Registration closes in 3 days."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-900 outline-none focus:border-purple-500 shadow-sm"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-500">
                    Pro tip: Include key points, your target audience and your desired outcome for this post
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={generateAI}
                    disabled={aiBusy || brief.trim().length < 5}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                    <span>{aiBusy ? 'Generating...' : 'Generate'}</span>
                  </button>
                </div>

                {/* Generated Variations */}
                {variations.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Generated Options
                    </span>
                    {variations.map((v, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-2 shadow-sm hover:border-purple-400 transition"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-700 text-[10px] uppercase">{v.angle}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (activeChannel === selectedChannels[0] && overrides[activeChannel] === undefined) {
                                setCaption(v.caption);
                              } else {
                                setOverrides({ ...overrides, [activeChannel]: v.caption });
                              }
                              setRightPanelMode('preview');
                            }}
                            className="rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-purple-700"
                          >
                            Use this
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{v.caption}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-3 text-[11px] text-slate-400 flex items-center gap-1">
                  <span>ⓘ Learn more about creating great prompts and the known limitations of AI.</span>
                </div>
              </div>
            )}

            {/* Mode 3: Templates */}
            {rightPanelMode === 'templates' && (
              <div className="flex flex-col flex-1 space-y-3">
                <span className="text-sm font-bold text-slate-900">Templates</span>

                {/* Discover | Personal Tabs */}
                <div className="flex border-b border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTemplateTab('discover')}
                    className={`pb-2 px-1 border-b-2 transition ${
                      templateTab === 'discover'
                        ? 'border-slate-900 text-slate-900 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Discover
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateTab('personal')}
                    className={`pb-2 px-3 border-b-2 transition ${
                      templateTab === 'personal'
                        ? 'border-slate-900 text-slate-900 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Personal
                  </button>
                </div>

                {/* Search templates input */}
                <input
                  type="text"
                  placeholder="Search templates..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-sm"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                />

                {/* Template Cards List */}
                <div className="space-y-3 overflow-y-auto max-h-[460px] pr-1">
                  {filteredTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="rounded-2xl border border-slate-200 bg-white p-3.5 text-xs space-y-2 shadow-sm hover:border-emerald-400 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-slate-900 leading-snug">{tpl.title}</div>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeChannel === selectedChannels[0] && overrides[activeChannel] === undefined) {
                              setCaption(tpl.content);
                            } else {
                              setOverrides({ ...overrides, [activeChannel]: tpl.content });
                            }
                            setRightPanelMode('preview');
                          }}
                          className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                        >
                          Insert
                        </button>
                      </div>
                      <p className="text-slate-500 text-[11px] leading-relaxed">{tpl.description}</p>
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {tpl.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Modal Footer: Primary Action (right) */}
        <div className="flex items-center justify-end border-t border-slate-100 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Schedule for later toggle/picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setScheduleOpen(!scheduleOpen)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  scheduleAt
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>{scheduleAt ? new Date(scheduleAt).toLocaleString() : 'Schedule'}</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {scheduleOpen && (
                <div className="absolute right-0 bottom-12 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 space-y-2">
                  <div className="text-xs font-bold text-slate-800">Select Date & Time</div>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                  />
                  {scheduleAt && (
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleAt('');
                        setScheduleOpen(false);
                      }}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Clear schedule (post now)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Dynamic Green Action Button */}
            <button
              type="button"
              id="publish"
              onClick={submitPost}
              disabled={busy || !activeCaption.trim()}
              className="flex items-center gap-2 rounded-xl bg-[#22c55e] px-6 py-2.5 text-sm font-bold text-slate-950 shadow-md transition hover:bg-[#16a34a] hover:text-white disabled:opacity-40"
            >
              {busy ? (
                <span>Publishing...</span>
              ) : scheduleAt ? (
                <>
                  <Calendar className="h-4 w-4" />
                  <span>Schedule Post</span>
                </>
              ) : (
                <span>Add to Queue</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
