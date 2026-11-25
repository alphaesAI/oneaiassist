'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Filter,
  Heart,
  Inbox,
  LayoutGrid,
  List as ListIcon,
  MessageCircle,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { ConnectChannelModal } from '@/components/marketing/ConnectChannelModal';
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TwitterIcon,
  YouTubeIcon,
} from '@/components/marketing/SocialIcons';
import { api } from '@/lib/api-client';

interface ConnectedAccount {
  id: string;
  platform: string;
  accountName: string;
  status: string;
}

interface PostItem {
  id: string;
  title: string;
  caption: string;
  createdAt: string;
  mediaAsset?: {
    storageKey: string;
    filename: string;
  } | null;
}

interface CommentItem {
  id: string;
  postId?: string | null;
  accountId?: string | null;
  platform: 'THREADS' | 'INSTAGRAM' | 'FACEBOOK' | 'TWITTER' | 'YOUTUBE';
  authorName: string;
  authorHandle?: string | null;
  authorAvatar?: string | null;
  content: string;
  status: 'UNANSWERED' | 'REPLIED' | 'RESOLVED';
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'QUESTION';
  isQuestion: boolean;
  hasHeart: boolean;
  isHidden: boolean;
  externalId?: string | null;
  replyText?: string | null;
  repliedAt?: string | null;
  repliedBy?: string | null;
  createdAt: string;
  post?: PostItem | null;
  account?: {
    id: string;
    platform: string;
    accountName: string;
    lastSyncedAt?: string | null;
    syncError?: string | null;
  } | null;
}

export default function CommunityPage() {
  // Navigation tabs: 'comments' | 'mentions'
  const [activeTab, setActiveTab] = useState<'comments'>('comments');

  // View modes: 'posts' (split panel) | 'list' (linear stream)
  const [viewMode, setViewMode] = useState<'posts' | 'list'>('posts');

  // Left posts sub-sidebar collapse toggle
  const [postsPanelCollapsed, setPostsPanelCollapsed] = useState(false);

  // Filter dropdown states
  const [channelsMenuOpen, setChannelsMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters & Sorting state
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNANSWERED' | 'REPLIED' | 'RESOLVED'>('ALL');
  const [sortBy, setSortBy] = useState<'unanswered' | 'newest' | 'oldest'>('unanswered');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '6m' | '12m'>('12m');
  const [showAllPostsWithoutComments, setShowAllPostsWithoutComments] = useState(true);

  // Data
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [replyInputMap, setReplyInputMap] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  // Dropdown refs for outside click detection
  const channelsRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (channelsRef.current && !channelsRef.current.contains(e.target as Node)) {
        setChannelsMenuOpen(false);
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show toast notification
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Fetch all initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, postsRes, commRes] = await Promise.all([
        api<{ accounts: ConnectedAccount[] }>('/api/accounts').catch(() => ({ accounts: [] })),
        api<{ posts: PostItem[] }>('/api/posts').catch(() => ({ posts: [] })),
        api<{ comments: CommentItem[] }>(
          `/api/community/comments?status=${statusFilter}&sort=${sortBy}&dateRange=${dateRange}`
        ).catch(() => ({ comments: [] })),
      ]);

      setAccounts(accRes.accounts || []);
      setPosts(postsRes.posts || []);
      setComments(commRes.comments || []);

      // If no post selected, select first post if available
      if (postsRes.posts && postsRes.posts.length > 0 && !selectedPostId) {
        setSelectedPostId(postsRes.posts[0].id);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sortBy, dateRange, selectedPostId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reply to comment
  async function submitReply(commentId: string) {
    const text = replyInputMap[commentId]?.trim();
    if (!text) return;
    setActionBusy(true);
    try {
      await api(`/api/community/comments/${commentId}`, { replyText: text }, 'PATCH');
      setReplyInputMap((prev) => ({ ...prev, [commentId]: '' }));
      showToast('Reply posted ✨');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send reply');
    } finally {
      setActionBusy(false);
    }
  }

  // Like / unlike on Facebook (Instagram does not allow apps to like comments)
  async function toggleHeart(comment: CommentItem) {
    try {
      await api(`/api/community/comments/${comment.id}`, { hasHeart: !comment.hasHeart }, 'PATCH');
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, hasHeart: !c.hasHeart } : c))
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update the like');
    }
  }

  // Hide / unhide on the platform
  async function toggleHidden(comment: CommentItem) {
    try {
      await api(`/api/community/comments/${comment.id}`, { hidden: !comment.isHidden }, 'PATCH');
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, isHidden: !c.isHidden } : c))
      );
      showToast(comment.isHidden ? 'Comment is visible again' : 'Comment hidden');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not hide the comment');
    }
  }

  // Read new comments from the platforms now
  async function syncNow() {
    setSyncing(true);
    try {
      const res = await api<{ accounts: { accountName: string; comments: number; error: string | null }[] }>('/api/community/sync', {});
      const problems = res.accounts.filter((a) => a.error);
      showToast(
        res.accounts.length === 0
          ? 'Connect a Facebook Page or Instagram account to read comments'
          : problems.length
            ? `${problems[0].accountName}: ${problems[0].error === 'token' ? 'reconnect this account' : problems[0].error}`
            : 'Comments are up to date'
      );
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not sync');
    } finally {
      setSyncing(false);
    }
  }

  // Update status (e.g. resolve / unresolve)
  async function updateStatus(commentId: string, newStatus: 'UNANSWERED' | 'REPLIED' | 'RESOLVED') {
    try {
      await api(`/api/community/comments/${commentId}`, { status: newStatus }, 'PATCH');
      showToast(newStatus === 'RESOLVED' ? 'Marked as resolved' : 'Status updated');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  // Helper for platform icon
  function renderPlatformIcon(platform: string, className = 'h-4 w-4') {
    switch (platform) {
      case 'THREADS':
        return <ThreadsIcon className={className} />;
      case 'INSTAGRAM':
        return <InstagramIcon className={className} />;
      case 'FACEBOOK':
        return <FacebookIcon className={className} />;
      case 'TWITTER':
        return <TwitterIcon className={className} />;
      case 'YOUTUBE':
        return <YouTubeIcon className={className} />;
      default:
        return <MessageCircle className={className} />;
    }
  }

  // Filtered comments
  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      // Channel filter
      if (selectedChannels.length > 0) {
        if (!c.accountId || !selectedChannels.includes(c.accountId)) {
          return false;
        }
      }
      // Status filter
      if (statusFilter !== 'ALL' && c.status !== statusFilter) {
        return false;
      }
      // In posts view, only show comments for the selected post
      if (viewMode === 'posts' && selectedPostId) {
        if (c.postId && c.postId !== selectedPostId) {
          return false;
        }
      }
      return true;
    });
  }, [comments, selectedChannels, statusFilter, viewMode, selectedPostId]);

  // Count unanswered comments per post
  const unansweredCountByPost = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of comments) {
      if (c.postId && c.status === 'UNANSWERED') {
        map[c.postId] = (map[c.postId] || 0) + 1;
      }
    }
    return map;
  }, [comments]);

  // Filtered accounts for Channels popover search
  const searchedAccounts = useMemo(() => {
    if (!channelSearchQuery.trim()) return accounts;
    const q = channelSearchQuery.toLowerCase();
    return accounts.filter(
      (a) =>
        a.accountName.toLowerCase().includes(q) ||
        a.platform.toLowerCase().includes(q)
    );
  }, [accounts, channelSearchQuery]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white text-slate-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6 py-3.5">
        <div className="flex items-center gap-3">
          {/* 4-circles community squircle */}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs">
            <LayoutGrid className="h-4 w-4" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Community</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Read new comments from Facebook and Instagram now */}
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            title="Read new comments from Facebook and Instagram"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing…' : 'Sync now'}</span>
          </button>

          {/* Mode Switcher: [ ▯ By post ] [ ≡ List ] */}
          {activeTab === 'comments' && (
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('posts')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
                  viewMode === 'posts'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <div className="flex h-3 w-3 items-center justify-between rounded-xs border border-current p-[1px]">
                  <span className="h-full w-1/3 bg-current opacity-70" />
                </div>
                <span>By post</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <ListIcon className="h-3 w-3" />
                <span>List</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Sub-Navigation Tabs & Right Filters Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6 py-2.5">
        {/* Left Tabs: Comments & Mentions */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`relative py-1 text-sm font-semibold transition ${
              activeTab === 'comments'
                ? 'text-slate-950 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Comments</span>
            {activeTab === 'comments' && (
              <span className="absolute bottom-[-11px] left-0 right-0 h-0.5 rounded-full bg-emerald-600" />
            )}
          </button>

        </div>

        {/* Right Filter Controls (shown on Comments tab) */}
        {activeTab === 'comments' && (
          <div className="flex items-center gap-2">
            {/* Filter by Channels Popover */}
            <div className="relative" ref={channelsRef}>
              <button
                type="button"
                onClick={() => setChannelsMenuOpen(!channelsMenuOpen)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  channelsMenuOpen || selectedChannels.length > 0
                    ? 'border-slate-300 bg-slate-50 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5 text-slate-500" />
                <span>
                  {selectedChannels.length > 0
                    ? `Channels (${selectedChannels.length})`
                    : 'Channels'}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {channelsMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl animate-in fade-in zoom-in-95">
                  {/* Search Channels Input */}
                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={channelSearchQuery}
                      onChange={(e) => setChannelSearchQuery(e.target.value)}
                      placeholder="Search channels"
                      className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="mb-2 flex items-center justify-between px-1 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Channels</span>
                    {accounts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedChannels.length === accounts.length) {
                            setSelectedChannels([]);
                          } else {
                            setSelectedChannels(accounts.map((a) => a.id));
                          }
                        }}
                        className="font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        {selectedChannels.length === accounts.length ? 'Clear all' : 'Select all'}
                      </button>
                    )}
                  </div>

                  {accounts.length === 0 ? (
                    <div className="py-6 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <LayoutGrid className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">No channels found</p>
                      <button
                        type="button"
                        onClick={() => {
                          setChannelsMenuOpen(false);
                          setConnectModalOpen(true);
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Connect a Channel</span>
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {searchedAccounts.map((account) => {
                        const isSelected = selectedChannels.includes(account.id);
                        return (
                          <label
                            key={account.id}
                            className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2 text-xs">
                              {renderPlatformIcon(account.platform, 'h-3.5 w-3.5')}
                              <span className="font-medium text-slate-800">
                                {account.accountName}
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedChannels(selectedChannels.filter((id) => id !== account.id));
                                } else {
                                  setSelectedChannels([...selectedChannels, account.id]);
                                }
                              }}
                              className="h-3.5 w-3.5 rounded-xs border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Filter by Status Menu: All, Unanswered, Replied, Resolved */}
            <div className="relative" ref={statusRef}>
              <button
                type="button"
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 transition"
              >
                <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
                <span className="capitalize">
                  {statusFilter === 'ALL' ? 'All' : statusFilter.toLowerCase()}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {statusMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl animate-in fade-in zoom-in-95">
                  {(['ALL', 'UNANSWERED', 'REPLIED', 'RESOLVED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setStatusFilter(st);
                        setStatusMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <span className="capitalize">{st === 'ALL' ? 'All' : st.toLowerCase()}</span>
                      {statusFilter === st && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter and Sort Comments Button (☵) */}
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                onClick={() => setSortMenuOpen(!sortMenuOpen)}
                title="Filter and sort comments"
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-slate-600 transition ${
                  sortMenuOpen
                    ? 'border-slate-300 bg-slate-50 text-slate-900'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              {sortMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95">
                  {/* Sort By section */}
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Sort By
                  </div>
                  <button
                    type="button"
                    onClick={() => setSortBy('unanswered')}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <span>Unanswered first</span>
                    {sortBy === 'unanswered' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('newest')}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <span>Newest</span>
                    {sortBy === 'newest' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('oldest')}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <span>Oldest</span>
                    {sortBy === 'oldest' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  </button>

                  <div className="my-2 border-t border-slate-100" />

                  {/* Date Range section */}
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Date Range
                  </div>
                  {(['7d', '30d', '6m', '12m'] as const).map((dr) => {
                    const label =
                      dr === '7d'
                        ? 'Last 7 days'
                        : dr === '30d'
                        ? 'Last 30 days'
                        : dr === '6m'
                        ? 'Last 6 months'
                        : 'Last 12 months';
                    return (
                      <button
                        key={dr}
                        type="button"
                        onClick={() => setDateRange(dr)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <span>{label}</span>
                        {dateRange === dr && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      </button>
                    );
                  })}

                  <div className="my-2 border-t border-slate-100" />

                  <button
                    type="button"
                    onClick={() => {
                      setSortBy('unanswered');
                      setDateRange('12m');
                      setStatusFilter('ALL');
                      setSelectedChannels([]);
                      setSortMenuOpen(false);
                      showToast('Filters reset to default');
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Main Body Content */}
      <div className="flex flex-1 overflow-hidden">

        {/* ===================== TAB: COMMENTS ===================== */}
        {activeTab === 'comments' && (
          <>
            {/* Split Panel: Left Posts Sub-Sidebar (only in By post mode) */}
            {viewMode === 'posts' && !postsPanelCollapsed && (
              <div className="flex w-80 shrink-0 flex-col border-r border-slate-200/80 bg-white">
                {/* Posts Column Header */}
                <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
                  <span className="text-sm font-bold text-slate-900">Posts</span>
                  <div className="flex items-center gap-1 text-slate-400">
                    <button
                      type="button"
                      onClick={() => {
                        setSortBy('unanswered');
                        showToast('Bringing posts with newest unanswered comments to top');
                      }}
                      title="Bring posts with the newest unanswered comments to the top"
                      className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-100 hover:text-slate-700 transition"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllPostsWithoutComments(!showAllPostsWithoutComments);
                        showToast(
                          !showAllPostsWithoutComments
                            ? 'Showing all posts'
                            : 'Showing only posts with comments'
                        );
                      }}
                      title="Show all posts, including those with no comments"
                      className={`flex h-6 w-6 items-center justify-center rounded-md transition ${
                        showAllPostsWithoutComments
                          ? 'text-slate-800 hover:bg-slate-100'
                          : 'hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      <Inbox className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPostsPanelCollapsed(true)}
                      title="Collapse posts panel"
                      className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-100 hover:text-slate-700 transition"
                    >
                      <PanelLeftClose className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Posts List Content */}
                <div className="flex-1 overflow-y-auto p-2">
                  {posts.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-6 text-center">
                      <p className="text-xs text-slate-400 font-medium">Your posts will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {posts.map((post) => {
                        const isSelected = selectedPostId === post.id;
                        const unread = unansweredCountByPost[post.id] || 0;
                        return (
                          <button
                            key={post.id}
                            type="button"
                            onClick={() => setSelectedPostId(post.id)}
                            className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                              isSelected
                                ? 'bg-slate-100 text-slate-950 shadow-xs'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            {/* Post Thumbnail or Icon */}
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-200/80 text-slate-600 font-semibold text-xs overflow-hidden">
                              {post.mediaAsset ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`/media/${post.mediaAsset.storageKey}`}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <MessageCircle className="h-4 w-4 text-slate-400" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {post.title || post.caption || 'Untitled Post'}
                              </p>
                              <p className="line-clamp-1 mt-0.5 text-[11px] text-slate-500">
                                {post.caption || 'No caption'}
                              </p>
                              <span className="mt-1 block text-[10px] text-slate-400">
                                {new Date(post.createdAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>

                            {/* Unread badge */}
                            {unread > 0 && (
                              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                                {unread}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* If posts panel is collapsed, provide quick un-collapse button */}
            {viewMode === 'posts' && postsPanelCollapsed && (
              <div className="border-r border-slate-200/80 p-2">
                <button
                  type="button"
                  onClick={() => setPostsPanelCollapsed(false)}
                  title="Expand posts panel"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Right Main Canvas: Conversation Stream OR Empty State Illustration */}
            <div className="flex flex-1 flex-col overflow-y-auto bg-slate-50/40">
              {filteredComments.length === 0 ? (
                /* Empty State Illustration */
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                  {/* Floating Cards + Orbiting Loop SVG Illustration */}
                  <div className="relative mb-6 flex h-48 w-80 items-center justify-center">
                    {/* SVG Orbit Loop Arrow */}
                    <svg
                      className="absolute inset-0 h-full w-full pointer-events-none"
                      viewBox="0 0 320 200"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M 235 60 C 275 80, 275 140, 220 165 C 160 190, 80 170, 90 120 C 95 80, 160 30, 235 60"
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <polygon points="238,55 246,62 236,66" fill="#94a3b8" />
                    </svg>

                    {/* Top Floating Card */}
                    <div className="absolute top-2 w-48 rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-sm animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 rounded-full bg-slate-200" />
                          <div className="h-2 w-20 rounded-full bg-slate-100" />
                        </div>
                        <Heart className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
                      </div>
                    </div>

                    {/* Middle Card (Main focus with reply box mockup) */}
                    <div className="absolute top-12 z-10 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded-full bg-slate-200" />
                          <div className="h-2 w-24 rounded-full bg-slate-200" />
                        </div>
                        <Heart className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1.5">
                        <div className="h-3 w-3 rounded-full border border-slate-300" />
                        <div className="h-2 w-28 rounded-full bg-slate-200" />
                      </div>
                    </div>

                    {/* Bottom Floating Card */}
                    <div className="absolute bottom-2 w-44 rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full bg-slate-200" />
                        <div className="h-2 w-24 rounded-full bg-slate-100" />
                      </div>
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-base font-bold tracking-tight text-slate-900">
                    Reply to all your social media comments in one place ✨
                  </h3>
                  <p className="mt-1 max-w-md text-xs text-slate-500">
                    Stop juggling tabs and apps. Manage every conversation from a single,
                    distraction-free inbox.
                  </p>

                  {/* Bottom Supported Channels Card */}
                  <div className="mt-8 w-full max-w-xl rounded-2xl border border-slate-200/80 bg-slate-50/80 p-6 shadow-xs">
                    <p className="text-xs font-medium text-slate-600">
                      Connect one of the supported channels to start interacting with your audience.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-5">
                      <button
                        type="button"
                        onClick={() => setConnectModalOpen(true)}
                        title="Connect Threads"
                        className="group flex flex-col items-center gap-1.5"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-xs group-hover:border-slate-400 group-hover:shadow-sm transition">
                          <ThreadsIcon className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-900">
                          Threads
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConnectModalOpen(true)}
                        title="Connect Facebook"
                        className="group flex flex-col items-center gap-1.5"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-xs group-hover:border-slate-400 group-hover:shadow-sm transition">
                          <FacebookIcon className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-900">
                          Facebook
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConnectModalOpen(true)}
                        title="Connect Instagram"
                        className="group flex flex-col items-center gap-1.5"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-xs group-hover:border-slate-400 group-hover:shadow-sm transition">
                          <InstagramIcon className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-900">
                          Instagram
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConnectModalOpen(true)}
                        title="Connect X (Twitter)"
                        className="group flex flex-col items-center gap-1.5"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-xs group-hover:border-slate-400 group-hover:shadow-sm transition">
                          <TwitterIcon className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-900">
                          Twitter
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConnectModalOpen(true)}
                        title="Connect YouTube"
                        className="group flex flex-col items-center gap-1.5"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-xs group-hover:border-slate-400 group-hover:shadow-sm transition">
                          <YouTubeIcon className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-900">
                          YouTube
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Active Comments Conversation Stream */
                <div className="mx-auto w-full max-w-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      {filteredComments.length} {filteredComments.length === 1 ? 'Comment' : 'Comments'}
                    </span>
                  </div>

                  {filteredComments.map((comment) => {
                    const isReplying = replyingId === comment.id;
                    return (
                      <div
                        key={comment.id}
                        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-slate-300"
                      >
                        {/* Comment Header: Author, Platform badge, Status & Sentiment */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="relative">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-xs">
                                {comment.authorName[0]?.toUpperCase() || 'U'}
                              </div>
                              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-xs">
                                {renderPlatformIcon(comment.platform, 'h-3 w-3')}
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  {comment.authorName}
                                </span>
                                {comment.authorHandle && (
                                  <span className="text-[11px] text-slate-400">
                                    {comment.authorHandle}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {new Date(comment.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                ·{' '}
                                {new Date(comment.createdAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {comment.isHidden && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                Hidden
                              </span>
                            )}
                            {comment.isQuestion && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                Question
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                comment.status === 'UNANSWERED'
                                  ? 'bg-amber-50 text-amber-700'
                                  : comment.status === 'REPLIED'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {comment.status}
                            </span>
                          </div>
                        </div>

                        {/* Comment Content */}
                        <div className="mt-3 pl-12">
                          <p className="text-xs leading-relaxed text-slate-800">
                            {comment.content}
                          </p>

                          {/* Existing Reply if already answered */}
                          {comment.replyText && (
                            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
                                <Check className="h-3 w-3 text-emerald-600" />
                                <span>Replied {comment.repliedBy ? `by ${comment.repliedBy}` : ''}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-700">{comment.replyText}</p>
                            </div>
                          )}

                          {/* Action Toolbar: Heart, Resolve, Reply */}
                          <div className="mt-3 flex items-center gap-4">
                            {comment.platform === 'FACEBOOK' && comment.externalId && (
                            <button
                              type="button"
                              onClick={() => toggleHeart(comment)}
                              className={`flex items-center gap-1.5 text-xs font-semibold transition ${
                                comment.hasHeart
                                  ? 'text-emerald-600'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              <Heart
                                className={`h-4 w-4 ${
                                  comment.hasHeart ? 'fill-emerald-600' : ''
                                }`}
                              />
                              <span>{comment.hasHeart ? 'Liked' : 'Like'}</span>
                            </button>
                            )}

                            {comment.externalId && (
                              <button
                                type="button"
                                onClick={() => toggleHidden(comment)}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                              >
                                {comment.isHidden ? 'Unhide' : 'Hide'}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                updateStatus(
                                  comment.id,
                                  comment.status === 'RESOLVED' ? 'UNANSWERED' : 'RESOLVED'
                                )
                              }
                              className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                            >
                              {comment.status === 'RESOLVED'
                                ? 'Reopen'
                                : 'Mark as Resolved'}
                            </button>

                            <button
                              type="button"
                              onClick={() => setReplyingId(isReplying ? null : comment.id)}
                              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                            >
                              {isReplying ? 'Cancel' : 'Reply'}
                            </button>
                          </div>

                          {/* Reply Box Composer */}
                          {isReplying && (
                            <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                              <textarea
                                value={replyInputMap[comment.id] || ''}
                                onChange={(e) =>
                                  setReplyInputMap((prev) => ({
                                    ...prev,
                                    [comment.id]: e.target.value,
                                  }))
                                }
                                placeholder="Write a reply..."
                                rows={2}
                                className="w-full resize-none rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setReplyingId(null)}
                                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusy || !replyInputMap[comment.id]?.trim()}
                                  onClick={() => submitReply(comment.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <Send className="h-3 w-3" />
                                  <span>Send Reply</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Connect Channel Modal */}
      <ConnectChannelModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        onConnected={() => {
          setConnectModalOpen(false);
          loadData();
          showToast('Channel connected successfully 🎉');
        }}
      />

    </div>
  );
}
