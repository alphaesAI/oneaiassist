'use client';

import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronDown,
  Columns,
  Compass,
  ExternalLink,
  Globe,
  Grid,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  Lightbulb,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Newspaper,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { IdeaItem, IdeaModal } from '@/components/marketing/IdeaModal';
import { PostComposerModal } from '@/components/marketing/PostComposerModal';
import { api } from '@/lib/api-client';
import { CURATED_FEEDS, FeedArticle } from '@/lib/marketing/rss';
import { CURATED_TEMPLATES, SocialTemplate } from '@/lib/marketing/templates-data';

interface FeedSubscription {
  id: string;
  title: string;
  feedUrl: string;
  siteUrl?: string | null;
  category: string;
  createdAt: string;
}

const DEFAULT_BOARD_COLUMNS = [
  { id: 'UNASSIGNED', label: 'Unassigned' },
  { id: 'TO_DO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'DONE', label: 'Done' },
];

export default function CreateWorkspacePage() {
  // Top-Level Sub-Navigation: 'ideas' | 'templates' | 'feeds'
  const [activeTab, setActiveTab] = useState<'ideas' | 'templates' | 'feeds'>('ideas');

  // =========================================================================
  // TAB 1: IDEAS STATE
  // =========================================================================
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'board' | 'gallery'>('board');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [tagsFilterOpen, setTagsFilterOpen] = useState(false);
  const [groupsFilterOpen, setGroupsFilterOpen] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [columns, setColumns] = useState(DEFAULT_BOARD_COLUMNS);

  // Modals & Drawers
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<IdeaItem | null>(null);
  const [defaultColumnStatus, setDefaultColumnStatus] = useState('UNASSIGNED');

  // AI Idea Generator Wizard
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const [aiBusiness, setAiBusiness] = useState('');
  const [aiAudience, setAiAudience] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  // Post Composer Bridge
  const [postComposerOpen, setPostComposerOpen] = useState(false);
  const [postComposerPrefill, setPostComposerPrefill] = useState<{
    brief?: string;
    caption?: string;
    title?: string;
    asset?: IdeaItem['mediaAsset'];
  }>({});

  // =========================================================================
  // TAB 2: TEMPLATES STATE
  // =========================================================================
  const [templatesTab, setTemplatesTab] = useState<'discover' | 'personal'>('discover');
  const [personalTemplates, setPersonalTemplates] = useState<SocialTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [newTemplateModalOpen, setNewTemplateModalOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');
  const [newTemplateIcon, setNewTemplateIcon] = useState('💡');

  // =========================================================================
  // TAB 3: FEEDS STATE
  // =========================================================================
  const [feeds, setFeeds] = useState<FeedSubscription[]>([]);
  const [feedArticles, setFeedArticles] = useState<FeedArticle[]>([]);
  const [selectedFeedFilter, setSelectedFeedFilter] = useState<string>('all');
  const [addFeedModalOpen, setAddFeedModalOpen] = useState(false);
  const [exploreFeedsModalOpen, setExploreFeedsModalOpen] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [curatedCategory, setCuratedCategory] = useState('Featured');
  const [feedBusy, setFeedBusy] = useState(false);

  // Initial Data Loading
  useEffect(() => {
    loadIdeas();
    loadTemplates();
    loadFeeds();
  }, []);

  function loadIdeas() {
    api<{ ideas: IdeaItem[] }>('/api/ideas')
      .then((data) => setIdeas(data.ideas))
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }

  function loadTemplates() {
    api<{ personal: SocialTemplate[] }>('/api/templates')
      .then((data) => setPersonalTemplates(data.personal || []))
      .catch(() => undefined);
  }

  function loadFeeds() {
    api<{ feeds: FeedSubscription[]; articles: FeedArticle[] }>('/api/feeds')
      .then((data) => {
        setFeeds(data.feeds || []);
        setFeedArticles(data.articles || []);
      })
      .catch(() => undefined);
  }

  // All unique tags across ideas
  const allTags = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((i) => i.tags?.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [ideas]);

  // Filtered Ideas
  const filteredIdeas = useMemo(() => {
    return ideas.filter((idea) => {
      const matchesTag = selectedTagFilter === 'all' || idea.tags?.includes(selectedTagFilter);
      const matchesGroup =
        selectedGroupFilter === 'all' || (idea.status || 'UNASSIGNED') === selectedGroupFilter;
      const matchesSearch =
        !searchQuery ||
        idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        idea.body.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTag && matchesGroup && matchesSearch;
    });
  }, [ideas, selectedTagFilter, selectedGroupFilter, searchQuery]);

  // Move idea between Kanban columns
  async function moveIdea(id: string, newStatus: string) {
    try {
      setIdeas((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
      await api(`/api/ideas/${id}`, { status: newStatus }, 'PATCH');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update idea');
      loadIdeas();
    }
  }

  // Generate ideas with AI
  async function handleGenerateIdeasAI(e: React.FormEvent) {
    e.preventDefault();
    if (!aiBusiness.trim()) return;
    setAiBusy(true);
    setError('');
    try {
      const res = await api<{ variations: { angle: string; caption: string }[] }>('/api/ai/copy', {
        brief: `Business: ${aiBusiness}. Target Audience: ${aiAudience || 'General audience'}. Brainstorm 3 fresh social media content ideas with punchy titles and draft bodies.`,
        platform: 'THREADS',
        count: 3,
      });

      // Save generated ideas to database
      for (const v of res.variations) {
        await api('/api/ideas', {
          title: v.angle || `Idea for ${aiBusiness}`,
          body: v.caption,
          status: 'UNASSIGNED',
          tags: ['ai-generated', aiBusiness.trim().split(' ')[0].toLowerCase()],
        });
      }

      loadIdeas();
      setAiWizardOpen(false);
      setAiBusiness('');
      setAiAudience('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  // Create Post Bridge from Idea
  function handleCreatePostFromIdea(item: {
    title: string;
    body: string;
    mediaAsset?: IdeaItem['mediaAsset'];
  }) {
    setPostComposerPrefill({
      title: item.title,
      caption: item.body,
      brief: item.title,
      asset: item.mediaAsset,
    });
    setPostComposerOpen(true);
  }

  // Create Post Bridge from Template
  function handleUseTemplate(template: SocialTemplate) {
    setPostComposerPrefill({
      title: template.title,
      caption: template.promptText,
      brief: template.title,
    });
    setPostComposerOpen(true);
  }

  // Create Post Bridge from Feed Article
  function handleCreatePostFromArticle(article: FeedArticle) {
    setPostComposerPrefill({
      title: article.title,
      caption: `${article.title}\n\n${article.description}\n\nRead more: ${article.link}`,
      brief: article.title,
    });
    setPostComposerOpen(true);
  }

  // Add Feed
  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!newFeedUrl.trim()) return;
    setFeedBusy(true);
    setError('');
    try {
      let title = newFeedUrl.replace(/^https?:\/\//, '').split('/')[0];
      await api('/api/feeds', {
        title: title || 'Custom Feed',
        feedUrl: newFeedUrl.trim(),
        category: 'Custom',
      });
      loadFeeds();
      setAddFeedModalOpen(false);
      setNewFeedUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add RSS feed');
    } finally {
      setFeedBusy(false);
    }
  }

  // Subscribe to Curated Feed
  async function handleSubscribeCurated(feed: (typeof CURATED_FEEDS)[0]) {
    try {
      await api('/api/feeds', {
        title: feed.title,
        feedUrl: feed.feedUrl,
        siteUrl: feed.siteUrl,
        category: feed.category,
      });
      loadFeeds();
      setExploreFeedsModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe to curated feed');
    }
  }

  // Delete Feed
  async function handleDeleteFeed(id: string) {
    try {
      await api(`/api/feeds/${id}`, {}, 'DELETE');
      setFeeds((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // ignore
    }
  }

  // Save Personal Template
  async function handleCreatePersonalTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplatePrompt.trim()) return;
    try {
      const res = await api<{ template: SocialTemplate }>('/api/templates', {
        title: newTemplateTitle.trim(),
        description: newTemplateDesc.trim(),
        promptText: newTemplatePrompt.trim(),
        icon: newTemplateIcon,
      });
      setPersonalTemplates((prev) => [res.template, ...prev]);
      setNewTemplateModalOpen(false);
      setNewTemplateTitle('');
      setNewTemplateDesc('');
      setNewTemplatePrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  }

  return (
    <div className="space-y-6 pb-20">
      {/* ===================================================================== */}
      {/* 1. TOP HEADER BAR: "Create" (H1) + Bookmark + Actions */}
      {/* ===================================================================== */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          {/* Header row: Bulb icon in squircle, Title, Bookmark */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-800 shadow-2xs">
              <Lightbulb className="h-4.5 w-4.5 text-slate-700" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create</h1>
            <button
              type="button"
              title="Save current view"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <Bookmark className="h-4 w-4" />
            </button>
          </div>

          {/* Sub-Navigation Tabs: Ideas | Templates | Feeds */}
          <div className="flex items-center gap-6 pt-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('ideas')}
              className={`pb-2.5 border-b-2 transition ${
                activeTab === 'ideas'
                  ? 'border-[#22c55e] text-slate-950 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Ideas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`pb-2.5 border-b-2 transition ${
                activeTab === 'templates'
                  ? 'border-[#22c55e] text-slate-950 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Templates
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('feeds')}
              className={`pb-2.5 border-b-2 transition ${
                activeTab === 'feeds'
                  ? 'border-[#22c55e] text-slate-950 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Feeds
            </button>
          </div>
        </div>

        {/* Top-Right Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Share Feedback Button */}
          <button
            type="button"
            title="Share Feedback"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <MessageCircle className="h-4 w-4" />
          </button>

          {/* TAB 1 (IDEAS) CONTROLS */}
          {activeTab === 'ideas' && (
            <>
              {/* Generate Ideas (AI) Button */}
              <button
                type="button"
                onClick={() => setAiWizardOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-2xs transition hover:bg-slate-50"
              >
                <Wand2 className="h-3.5 w-3.5 text-purple-600" />
                <span>Generate Ideas</span>
              </button>

              {/* + New Idea Button (Green solid) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedIdea(null);
                  setDefaultColumnStatus('UNASSIGNED');
                  setIdeaModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-4 py-2 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#16a34a] hover:text-white"
              >
                <Plus className="h-4 w-4" />
                <span>New Idea</span>
              </button>

              {/* Groups Filter Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setGroupsFilterOpen(!groupsFilterOpen);
                    setTagsFilterOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                >
                  <Columns className="h-3.5 w-3.5 text-slate-400" />
                  <span>{selectedGroupFilter === 'all' ? 'Groups' : selectedGroupFilter}</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {groupsFilterOpen && (
                  <div className="absolute right-0 top-10 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 text-xs font-medium text-slate-700 space-y-1">
                    <div className="px-2 py-1">
                      <input
                        type="text"
                        placeholder="Search groups"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupFilter('all');
                        setGroupsFilterOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-slate-50"
                    >
                      <span>All Groups</span>
                      {selectedGroupFilter === 'all' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </button>
                    {columns.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => {
                          setSelectedGroupFilter(col.id);
                          setGroupsFilterOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-slate-50"
                      >
                        <span>{col.label}</span>
                        {selectedGroupFilter === col.id && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tags Filter Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setTagsFilterOpen(!tagsFilterOpen);
                    setGroupsFilterOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                >
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <span>{selectedTagFilter === 'all' ? 'Tags' : `#${selectedTagFilter}`}</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {tagsFilterOpen && (
                  <div className="absolute right-0 top-10 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 text-xs font-medium text-slate-700 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search tags"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-emerald-500"
                      />
                    </div>
                    {allTags.length === 0 ? (
                      <div className="py-4 text-center space-y-1">
                        <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <Tag className="h-4 w-4" />
                        </div>
                        <p className="font-bold text-slate-800 text-[11px]">No tags</p>
                        <p className="text-[10px] text-slate-400">Use tags to organise your content</p>
                      </div>
                    ) : (
                      <div className="max-h-36 overflow-y-auto space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTagFilter('all');
                            setTagsFilterOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          <span>All Tags</span>
                          {selectedTagFilter === 'all' && <Check className="h-3 w-3 text-emerald-600" />}
                        </button>
                        {allTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSelectedTagFilter(tag);
                              setTagsFilterOpen(false);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            <span>#{tag}</span>
                            {selectedTagFilter === tag && <Check className="h-3 w-3 text-emerald-600" />}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSelectedTagFilter('all')}
                        className="text-slate-500 hover:text-slate-800 font-semibold"
                      >
                        Clear All
                      </button>
                      <Settings className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" />
                    </div>
                  </div>
                )}
              </div>

              {/* View Switcher: Board vs Gallery */}
              <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    viewMode === 'board'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Columns className="h-3.5 w-3.5" />
                  <span>Board</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('gallery')}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    viewMode === 'gallery'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Gallery</span>
                </button>
              </div>
            </>
          )}

          {/* TAB 2 (TEMPLATES) CONTROLS */}
          {activeTab === 'templates' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 shadow-2xs"
                />
              </div>
              {templatesTab === 'personal' && (
                <button
                  type="button"
                  onClick={() => setNewTemplateModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#16a34a] hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Template</span>
                </button>
              )}
            </>
          )}

          {/* TAB 3 (FEEDS) CONTROLS */}
          {activeTab === 'feeds' && (
            <>
              <button
                type="button"
                onClick={() => setExploreFeedsModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
              >
                <Compass className="h-3.5 w-3.5 text-emerald-600" />
                <span>Explore Curated Feeds</span>
              </button>
              <button
                type="button"
                onClick={() => setAddFeedModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-4 py-2 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#16a34a] hover:text-white"
              >
                <Plus className="h-4 w-4" />
                <span>New Feed</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. TAB 1: IDEAS (BOARD & GALLERY VIEWS)                               */}
      {/* ===================================================================== */}
      {activeTab === 'ideas' && (
        <>
          {viewMode === 'board' ? (
            /* KANBAN BOARD VIEW */
            <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
              {columns.map((col) => {
                const colIdeas = filteredIdeas.filter((i) => (i.status || 'UNASSIGNED') === col.id);
                return (
                  <div
                    key={col.id}
                    className="flex w-80 shrink-0 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/60 p-3 shadow-2xs min-h-[550px]"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between px-1 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{col.label}</span>
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-700">
                          {colIdeas.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIdea(null);
                            setDefaultColumnStatus(col.id);
                            setIdeaModalOpen(true);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                          title={`Add idea to ${col.label}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        {col.id !== 'UNASSIGNED' && (
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Column Cards */}
                    <div className="flex-1 space-y-3 overflow-y-auto">
                      {/* Onboarding Cards in Unassigned */}
                      {col.id === 'UNASSIGNED' && colIdeas.length === 0 && (
                        <>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">
                              This is a place to plan ✍️ your content
                            </h4>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Save your Ideas before converting them into posts. Brainstorm, plan ahead, and keep inspirations organized.
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 leading-snug">
                                Save inspirations with one click 🤩
                              </h4>
                              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Use the AI Assistant to generate tailored hooks, or create post cards directly from your thoughts.
                            </p>
                          </div>
                        </>
                      )}

                      {/* User's Ideas */}
                      {colIdeas.map((idea) => (
                        <div
                          key={idea.id}
                          onClick={() => {
                            setSelectedIdea(idea);
                            setIdeaModalOpen(true);
                          }}
                          className="group relative cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-emerald-500 hover:shadow-md transition space-y-2.5"
                        >
                          {idea.mediaAsset && (
                            <div className="overflow-hidden rounded-xl border border-slate-100 max-h-36">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/media/${idea.mediaAsset.storageKey}`}
                                alt=""
                                className="w-full object-cover"
                              />
                            </div>
                          )}

                          <div className="font-bold text-xs text-slate-900 leading-snug">
                            {idea.title}
                          </div>

                          {idea.body && (
                            <p className="text-[11px] text-slate-500 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                              {idea.body}
                            </p>
                          )}

                          {idea.tags && idea.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {idea.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Quick Actions Footer */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            {/* Move status picker */}
                            <select
                              value={idea.status || 'UNASSIGNED'}
                              onChange={(e) => {
                                e.stopPropagation();
                                moveIdea(idea.id, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-lg bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200 outline-none"
                            >
                              <option value="UNASSIGNED">Unassigned</option>
                              <option value="TO_DO">To Do</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="DONE">Done</option>
                            </select>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreatePostFromIdea(idea);
                              }}
                              className="rounded-lg bg-[#22c55e] px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-[#16a34a] hover:text-white transition"
                            >
                              Create Post
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add Button at Bottom of Column */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIdea(null);
                          setDefaultColumnStatus(col.id);
                          setIdeaModalOpen(true);
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-500 hover:border-slate-400 hover:bg-white hover:text-slate-800 transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>New Idea</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* + New Group Column Adder */}
              <div className="flex w-72 shrink-0 flex-col rounded-2xl border border-dashed border-slate-300 p-4 items-center justify-center text-center space-y-2 min-h-[550px] bg-white/40">
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt('Enter group name:');
                    if (name) {
                      setColumns((prev) => [
                        ...prev,
                        { id: name.toUpperCase().replace(/\s+/g, '_'), label: name },
                      ]);
                    }
                  }}
                  className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Group</span>
                </button>
                <p className="text-[11px] text-slate-400">Add custom stages to organize your pipeline</p>
              </div>
            </div>
          ) : (
            /* GALLERY VIEW */
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 pt-1">
              {filteredIdeas.map((idea) => (
                <div
                  key={idea.id}
                  onClick={() => {
                    setSelectedIdea(idea);
                    setIdeaModalOpen(true);
                  }}
                  className="group flex flex-col justify-between cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-500 hover:shadow-md transition space-y-3"
                >
                  <div className="space-y-2">
                    {idea.mediaAsset ? (
                      <div className="overflow-hidden rounded-xl border border-slate-100 h-40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/media/${idea.mediaAsset.storageKey}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-300">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}

                    <h4 className="text-xs font-bold text-slate-900 leading-snug">{idea.title}</h4>
                    {idea.body && (
                      <p className="text-[11px] text-slate-500 line-clamp-3 leading-relaxed">
                        {idea.body}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {idea.status}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreatePostFromIdea(idea);
                      }}
                      className="rounded-lg bg-[#22c55e] px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-[#16a34a] hover:text-white transition"
                    >
                      Create Post
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* 3. TAB 2: TEMPLATES                                                    */}
      {/* ===================================================================== */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Sub-Tabs: [ Discover 165 ] [ Personal 0 ] */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTemplatesTab('discover')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                templatesTab === 'discover'
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Discover</span>
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                165
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTemplatesTab('personal')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                templatesTab === 'personal'
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Personal</span>
              <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                {personalTemplates.length}
              </span>
            </button>
          </div>

          {/* DISCOVER TEMPLATES VIEW */}
          {templatesTab === 'discover' && (
            <div className="space-y-6">
              {/* Featured Campaign Banner: CREATOR CAMP CONSISTENCY */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Start on Substack Notes
                  </h3>
                  <button type="button" className="text-xs font-bold text-blue-600 hover:underline">
                    See All &gt;
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 p-6 sm:grid-cols-3 text-white shadow-md">
                  <div className="sm:col-span-2 space-y-3">
                    <div className="text-[11px] font-bold tracking-widest text-emerald-400 uppercase">
                      CREATOR CAMP CONSISTENCY
                    </div>
                    <div className="text-sm font-bold text-slate-200">
                      Week 2: Test and read the results
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                      A free two-week sprint to help you treat Substack Notes like any other social
                      channel. Schedule this week&apos;s prompts in the Publish calendar.
                    </p>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleUseTemplate(CURATED_TEMPLATES[0])}
                        className="rounded-xl bg-[#22c55e] px-4 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-[#16a34a] hover:text-white transition"
                      >
                        Use Prompt
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
                      >
                        See All
                      </button>
                    </div>
                  </div>

                  {/* Embedded Preview Card on Right */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2 backdrop-blur-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔁</span>
                      <h4 className="text-xs font-bold text-white">Add your take to another sprinter&apos;s Note</h4>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      For a Note from the sprint that made you think. Post it from Substack, where restacks happen.
                    </p>
                  </div>
                </div>
              </div>

              {/* Curated Templates Grid */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Popular Social Post Templates
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                  {CURATED_TEMPLATES.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-500 hover:shadow-md transition space-y-3"
                    >
                      <div className="space-y-2">
                        <div className="text-2xl">{tmpl.icon}</div>
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">{tmpl.title}</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">
                          {tmpl.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-400">{tmpl.category}</span>
                        <button
                          type="button"
                          onClick={() => handleUseTemplate(tmpl)}
                          className="rounded-lg bg-[#22c55e] px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-[#16a34a] hover:text-white transition"
                        >
                          Use Prompt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PERSONAL TEMPLATES VIEW */}
          {templatesTab === 'personal' && (
            <div>
              {personalTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-md mx-auto">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700 shadow-2xs">
                    <Lock className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900">
                      Save the formats you reuse most
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Personal templates are private to you. Turn the posts you write again and again
                      into one-click starting points.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewTemplateModalOpen(true)}
                    className="rounded-xl bg-[#22c55e] px-5 py-2.5 text-xs font-bold text-slate-950 shadow-2xs hover:bg-[#16a34a] hover:text-white transition"
                  >
                    + Create Personal Template
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {personalTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="text-xl">{t.icon || '💡'}</div>
                        <h4 className="text-xs font-bold text-slate-900">{t.title}</h4>
                        <p className="text-[11px] text-slate-500 line-clamp-3">{t.promptText}</p>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleUseTemplate(t)}
                          className="rounded-lg bg-[#22c55e] px-3 py-1 text-xs font-bold text-slate-950 hover:bg-[#16a34a] hover:text-white"
                        >
                          Use Prompt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. TAB 3: FEEDS                                                       */}
      {/* ===================================================================== */}
      {activeTab === 'feeds' && (
        <div className="space-y-6">
          {feeds.length === 0 ? (
            /* EMPTY STATE */
            <div className="grid grid-cols-1 gap-8 rounded-3xl border border-slate-200 bg-white p-8 md:grid-cols-2 items-center shadow-2xs">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  Add your First Feed
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                  Subscribe to your favorite blogs, websites, or creators to get the latest content ideas.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddFeedModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-4 py-2.5 text-xs font-bold text-slate-950 shadow-2xs hover:bg-[#16a34a] hover:text-white transition"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New Feed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExploreFeedsModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Compass className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Explore Curated Feeds</span>
                  </button>
                </div>
              </div>

              {/* Right Illustration Card */}
              <div className="flex justify-center">
                <div className="relative rounded-3xl border border-slate-200 bg-emerald-50/40 p-6 shadow-sm w-full max-w-sm space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Rss className="h-3.5 w-3.5" />
                      </div>
                      <div className="h-2.5 w-32 rounded bg-slate-200" />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Newspaper className="h-3.5 w-3.5" />
                      </div>
                      <div className="h-2.5 w-40 rounded bg-slate-200" />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Globe className="h-3.5 w-3.5" />
                      </div>
                      <div className="h-2.5 w-28 rounded bg-slate-200" />
                    </div>
                  </div>

                  <div className="ml-auto w-44 rounded-2xl border border-slate-200 bg-white p-3 shadow-md flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Plus className="h-3 w-3" />
                    </div>
                    <div className="h-2 w-24 rounded bg-slate-200" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* SUBSCRIBED FEEDS & RECENT ARTICLES LIST */
            <div className="space-y-5">
              {/* Feeds Horizontal Chips Bar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedFeedFilter('all')}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition shrink-0 ${
                    selectedFeedFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Feeds ({feedArticles.length})
                </button>
                {feeds.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition shrink-0 border ${
                      selectedFeedFilter === f.title
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span onClick={() => setSelectedFeedFilter(f.title)} className="cursor-pointer">
                      {f.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteFeed(f.id)}
                      className="text-slate-400 hover:text-rose-600 ml-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Feed Articles Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {feedArticles
                  .filter((a) => selectedFeedFilter === 'all' || a.feedTitle === selectedFeedFilter)
                  .map((art) => (
                    <div
                      key={art.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-500 hover:shadow-md transition space-y-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800">
                            {art.feedTitle || 'RSS'}
                          </span>
                          <span>{art.pubDate}</span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">{art.title}</h4>
                        <p className="text-[11px] text-slate-500 line-clamp-3 leading-relaxed">
                          {art.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <a
                          href={art.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                        >
                          <span>Original</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCreatePostFromArticle(art)}
                          className="rounded-lg bg-[#22c55e] px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-[#16a34a] hover:text-white transition"
                        >
                          Create Post
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. MODALS & DRAWERS                                                    */}
      {/* ===================================================================== */}

      {/* MODAL A: Buffer "Generate Ideas" Questions Dialog */}
      {aiWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="absolute inset-0" onClick={() => setAiWizardOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Let&apos;s begin with a few questions 🪄
              </h3>
              <button
                type="button"
                onClick={() => setAiWizardOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateIdeasAI} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  What is your business about?
                </label>
                <input
                  type="text"
                  required
                  placeholder="A training and fitness brand"
                  value={aiBusiness}
                  onChange={(e) => setAiBusiness(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  What is your target audience?
                </label>
                <input
                  type="text"
                  placeholder="Busy working professionals worldwide"
                  value={aiAudience}
                  onChange={(e) => setAiAudience(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={aiBusy || !aiBusiness.trim()}
                className="w-full rounded-xl bg-[#22c55e] py-2.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#16a34a] hover:text-white disabled:opacity-50"
              >
                {aiBusy ? 'Generating 3 Ideas...' : 'Generate Ideas'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL B: Buffer "Add Feed" Dialog */}
      {addFeedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="absolute inset-0" onClick={() => setAddFeedModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add Feed</h3>
              <button
                type="button"
                onClick={() => setAddFeedModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              RSS URLs are links to automatically get updates from a blog or news site. The link is
              usually made up of the website&apos;s domain name, followed by &quot;/feed&quot; or
              &quot;/rss&quot;.
            </p>

            <form onSubmit={handleAddFeed} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">RSS URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://"
                  value={newFeedUrl}
                  onChange={(e) => setNewFeedUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddFeedModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={feedBusy || !newFeedUrl.trim()}
                  className="rounded-xl bg-[#22c55e] px-4 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-[#16a34a] hover:text-white disabled:opacity-50"
                >
                  {feedBusy ? 'Validating...' : 'Add Feed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL C: Buffer "Explore Curated Feeds" Dialog */}
      {exploreFeedsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="absolute inset-0" onClick={() => setExploreFeedsModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Explore Feeds</h3>
              <button
                type="button"
                onClick={() => setExploreFeedsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Category Pills Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              {['Featured', 'Tech', 'News', 'Business'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCuratedCategory(cat)}
                  className={`rounded-full px-3.5 py-1 font-bold transition shrink-0 ${
                    curatedCategory === cat
                      ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500/30'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Curated Feeds Grid (2 Columns) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CURATED_FEEDS.filter(
                (c) => curatedCategory === 'Featured' || c.category === curatedCategory
              ).map((feed) => {
                const isSubbed = feeds.some((f) => f.feedUrl === feed.feedUrl);
                return (
                  <div
                    key={feed.title}
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-emerald-400 hover:shadow-2xs transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                        {feed.title[0]}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{feed.title}</h4>
                        <p className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
                          {feed.feedUrl}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isSubbed}
                      onClick={() => handleSubscribeCurated(feed)}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                        isSubbed
                          ? 'bg-slate-100 text-slate-400 cursor-default'
                          : 'bg-slate-900 text-white hover:bg-emerald-600'
                      }`}
                      title={isSubbed ? 'Already Subscribed' : 'Subscribe'}
                    >
                      {isSubbed ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL D: Create Personal Template Dialog */}
      {newTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="absolute inset-0" onClick={() => setNewTemplateModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Create Personal Template</h3>
              <button
                type="button"
                onClick={() => setNewTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePersonalTemplate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Template Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Product Changelog"
                  value={newTemplateTitle}
                  onChange={(e) => setNewTemplateTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Prompt / Body</label>
                <textarea
                  rows={4}
                  required
                  placeholder="What we shipped this week:&#10;• [Feature 1]&#10;• [Feature 2]&#10;&#10;Try it out at: [Link]"
                  value={newTemplatePrompt}
                  onChange={(e) => setNewTemplatePrompt(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewTemplateModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#22c55e] px-4 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-[#16a34a] hover:text-white"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Idea Modal (Full Feature) */}
      <IdeaModal
        isOpen={ideaModalOpen}
        onClose={() => setIdeaModalOpen(false)}
        onSaved={loadIdeas}
        idea={selectedIdea}
        defaultStatus={defaultColumnStatus}
        onCreatePost={(item) => {
          setIdeaModalOpen(false);
          handleCreatePostFromIdea(item);
        }}
      />

      {/* Post Composer Modal (Bridge from Idea / Template / Feed Article) */}
      <PostComposerModal
        isOpen={postComposerOpen}
        onClose={() => setPostComposerOpen(false)}
        initialBrief={postComposerPrefill.brief}
        initialCaption={postComposerPrefill.caption}
        initialAsset={postComposerPrefill.asset}
      />
    </div>
  );
}
