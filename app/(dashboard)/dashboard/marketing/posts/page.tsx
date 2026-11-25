'use client';

import {
  AlertCircle,
  Bookmark,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Grid,
  Image as ImageIcon,
  Layers,
  Layout,
  List as ListIcon,
  MessageCircle,
  MoreHorizontal,
  MoreVertical,
  PanelRight,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PostComposerModal } from '@/components/marketing/PostComposerModal';
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TwitterIcon,
  YouTubeIcon,
} from '@/components/marketing/SocialIcons';
import { StatusBadge } from '@/components/marketing/StatusBadge';
import { api } from '@/lib/api-client';

interface ConnectedAccount {
  id: string;
  platform: string;
  accountName: string;
}

interface PublishJob {
  id: string;
  platform: string;
  accountName: string;
  status: string;
  attempts: number;
  runAt: string;
  externalUrl: string | null;
  errorMessage: string | null;
  accountId: string | null;
}

interface PostItem {
  id: string;
  title: string;
  caption: string;
  createdAt: string;
  scheduledAt: string | null;
  auditOverridden: boolean;
  mediaAsset?: {
    id: string;
    storageKey: string;
    filename: string;
    mimeType: string;
  } | null;
  jobs: PublishJob[];
}

const PLATFORM_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  INSTAGRAM: InstagramIcon,
  THREADS: ThreadsIcon,
  TWITTER: TwitterIcon,
  FACEBOOK: FacebookIcon,
  YOUTUBE: YouTubeIcon,
};

const DEFAULT_SCHEDULE_SLOTS = [
  { time: '9:00 AM', platform: 'INSTAGRAM' },
  { time: '1:00 PM', platform: 'FACEBOOK' },
  { time: '5:00 PM', platform: 'THREADS' },
];

const TIMEZONES = [
  { label: 'Kolkata', value: 'Asia/Kolkata' },
  { label: 'UTC', value: 'UTC' },
  { label: 'New York', value: 'America/New_York' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
];

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PublishWorkspacePage() {
  // Primary View Mode: 'list' (Queue) | 'calendar'
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Sub-Navigation Tab in List View: 'queue' | 'drafts' | 'approvals' | 'sent'
  const [subTab, setSubTab] = useState<'queue' | 'drafts' | 'approvals' | 'sent'>('queue');

  // Calendar Granularity: 'month' | 'week'
  const [calendarGranularity, setCalendarGranularity] = useState<'month' | 'week'>('month');

  // Calendar Reference Date
  const [currentDate, setCurrentDate] = useState(new Date());

  // Data State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // Filtering Controls State
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelsPopoverOpen, setChannelsPopoverOpen] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [tagsPopoverOpen, setTagsPopoverOpen] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState(TIMEZONES[0]);
  const [timezonePopoverOpen, setTimezonePopoverOpen] = useState(false);
  const [calendarStatusFilter, setCalendarStatusFilter] = useState<'all' | 'scheduled' | 'sent' | 'drafts'>('all');
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [granularityDropdownOpen, setGranularityDropdownOpen] = useState(false);

  // No Date Drafts Drawer
  const [noDateDrawerOpen, setNoDateDrawerOpen] = useState(false);

  // Composer Modal State
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPrefill, setComposerPrefill] = useState<{
    caption?: string;
    title?: string;
    runAt?: string;
  }>({});

  const loadData = useCallback(() => {
    api<{ posts: PostItem[] }>('/api/posts')
      .then((d) => setPosts(d.posts || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));

    api<{ accounts: ConnectedAccount[] }>('/api/accounts')
      .then((d) => {
        setAccounts(d.accounts || []);
        if (selectedChannels.length === 0) {
          setSelectedChannels((d.accounts || []).map((a) => a.id));
        }
      })
      .catch(() => undefined);
  }, [selectedChannels.length]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 6000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Handle Action on a Job
  async function actOnJob(job: PublishJob, action: 'retry' | 'cancel' | 'resolve') {
    if (
      action === 'retry' &&
      job.status === 'NEEDS_REVIEW' &&
      !window.confirm('This post may already be live. Retrying could publish it twice. Continue?')
    ) {
      return;
    }
    setError('');
    try {
      await api(`/api/jobs/${job.id}/${action}`, {});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  // Filtered Posts
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Channel filtering
      if (selectedChannels.length > 0 && accounts.length > 0) {
        const hasMatchingJob = post.jobs.some(
          (j) => j.accountId && selectedChannels.includes(j.accountId)
        );
        if (!hasMatchingJob && post.jobs.length > 0) return false;
      }

      // Status filtering in calendar mode
      if (viewMode === 'calendar') {
        if (calendarStatusFilter === 'scheduled') {
          return post.jobs.some((j) => j.status === 'PENDING' || j.status === 'PUBLISHING' || j.status === 'AWAITING_APPROVAL');
        }
        if (calendarStatusFilter === 'sent') {
          return post.jobs.some((j) => j.status === 'SUCCESS');
        }
        if (calendarStatusFilter === 'drafts') {
          return post.jobs.length === 0 || post.jobs.some((j) => j.status === 'DRAFT');
        }
      }

      return true;
    });
  }, [posts, selectedChannels, accounts.length, viewMode, calendarStatusFilter]);

  // Categorized counts for tabs
  const queuePosts = useMemo(
    () =>
      filteredPosts.filter((p) =>
        p.jobs.some((j) => j.status === 'PENDING' || j.status === 'PUBLISHING' || j.status === 'AWAITING_APPROVAL')
      ),
    [filteredPosts]
  );
  const sentPosts = useMemo(
    () => filteredPosts.filter((p) => p.jobs.some((j) => j.status === 'SUCCESS')),
    [filteredPosts]
  );
  const draftPosts = useMemo(
    () =>
      filteredPosts.filter(
        (p) => p.jobs.length === 0 || p.jobs.some((j) => j.status === 'DRAFT' || !p.scheduledAt)
      ),
    [filteredPosts]
  );
  const approvalPosts = useMemo(
    () => filteredPosts.filter((p) => p.jobs.some((j) => j.status === 'NEEDS_REVIEW')),
    [filteredPosts]
  );

  // Month Calendar Days Generator
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayIndex = firstDay.getDay(); // 0 is Sunday
    const totalDays = lastDay.getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill complete grid
    const remaining = 35 - days.length > 0 ? 35 - days.length : 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  // Week Calendar Days Generator
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Helper to open composer from slot
  function handleOpenComposerFromSlot(dateStr: string, timeStr?: string, platform?: string) {
    setComposerPrefill({
      title: '',
      caption: '',
      runAt: dateStr,
    });
    setComposerOpen(true);
  }

  // Next / Previous Date Navigation
  function handleNav(direction: 'prev' | 'next') {
    const d = new Date(currentDate);
    if (calendarGranularity === 'month') {
      d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(d);
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4 pb-20">
      {/* ===================================================================== */}
      {/* 1. TOP HEADER BAR: "Publish" (H1) + Mode Switcher + New Post         */}
      {/* ===================================================================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div className="flex items-center gap-2.5">
          {/* Calendar Icon in Squircle */}
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-800 shadow-2xs">
            <CalendarIcon className="h-4.5 w-4.5 text-slate-700" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Publish</h1>
          <button
            type="button"
            title="Save current view"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <Bookmark className="h-4 w-4" />
          </button>
        </div>

        {/* Top-Right Controls: Feedback, Mode Toggle [List | Calendar], + New Post */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            title="Share Feedback"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <MessageCircle className="h-4 w-4" />
          </button>

          {/* View Mode Toggle: [List] [Calendar] */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'list'
                  ? 'bg-white text-slate-950 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-950 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          {/* Primary CTA: + New Post */}
          <button
            type="button"
            onClick={() => {
              setComposerPrefill({});
              setComposerOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-4 py-2 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#16a34a] hover:text-white cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Post</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. SECOND BAR: UNIFIED BASELINE SUBNAV & FILTERS                      */}
      {/* ===================================================================== */}
      <div className="flex items-center justify-between border-b border-slate-200">
        {/* LEFT SIDE CONTROLS */}
        {viewMode === 'list' ? (
          /* List Mode Sub-Tabs: Queue | Drafts | Approvals | Sent */
          <div className="flex items-center gap-6 text-xs font-semibold">
            {/* Queue Tab */}
            <button
              type="button"
              onClick={() => setSubTab('queue')}
              className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
                subTab === 'queue'
                  ? 'border-[#22c55e] text-slate-950 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Queue</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                {queuePosts.length}
              </span>
            </button>

            {/* Drafts Tab */}
            <button
              type="button"
              onClick={() => setSubTab('drafts')}
              className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
                subTab === 'drafts'
                  ? 'border-[#22c55e] text-slate-950 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Drafts</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                {draftPosts.length}
              </span>
            </button>

            {/* Posts whose publishing result is unclear (not client approval, see /dashboard/approvals) */}
            <button
              type="button"
              onClick={() => setSubTab('approvals')}
              className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
                subTab === 'approvals'
                  ? 'border-[#22c55e] text-slate-950 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Needs checking</span>
              <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[#8b5cf6] text-white">
                <Zap className="h-2.5 w-2.5 fill-white" />
              </span>
            </button>

            {/* Sent Tab */}
            <button
              type="button"
              onClick={() => setSubTab('sent')}
              className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
                subTab === 'sent'
                  ? 'border-[#22c55e] text-slate-950 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Sent</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                {sentPosts.length}
              </span>
            </button>
          </div>
        ) : (
          /* Calendar Mode Controls: < > Month Year | Today | Month ˅ */
          <div className="flex items-center gap-2.5 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleNav('prev')}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleNav('next')}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <span className="text-sm font-bold text-slate-900">{monthName}</span>

            <button
              type="button"
              onClick={handleToday}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              Today
            </button>

            {/* Granularity Dropdown: Month vs Week */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setGranularityDropdownOpen(!granularityDropdownOpen)}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 capitalize"
              >
                <span>{calendarGranularity}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {granularityDropdownOpen && (
                <div className="absolute left-0 top-9 z-30 w-32 rounded-2xl border border-slate-200 bg-white p-1 shadow-xl text-xs font-semibold text-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarGranularity('month');
                      setGranularityDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    <span>Month</span>
                    {calendarGranularity === 'month' && <Check className="h-3 w-3 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarGranularity('week');
                      setGranularityDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    <span>Week</span>
                    {calendarGranularity === 'week' && <Check className="h-3 w-3 text-emerald-600" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RIGHT SIDE CONTROLS (Unified on the exact same baseline) */}
        <div className="flex items-center gap-2 pb-2 text-xs font-semibold">
          {/* Channels Filter Popover (Icon is 4-dots grid :: ) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setChannelsPopoverOpen(!channelsPopoverOpen);
                setTagsPopoverOpen(false);
                setTimezonePopoverOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              <div className="grid grid-cols-2 gap-0.5">
                <span className="h-1 w-1 rounded-full bg-slate-500" />
                <span className="h-1 w-1 rounded-full bg-slate-500" />
                <span className="h-1 w-1 rounded-full bg-slate-500" />
                <span className="h-1 w-1 rounded-full bg-slate-500" />
              </div>
              <span>Channels</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {channelsPopoverOpen && (
              <div className="absolute right-0 top-9 z-30 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search channels"
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] px-1 text-slate-500">
                  <span>Channels</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedChannels(
                        selectedChannels.length === accounts.length ? [] : accounts.map((a) => a.id)
                      )
                    }
                    className="font-bold text-blue-600 hover:underline"
                  >
                    {selectedChannels.length === accounts.length ? 'Deselect All' : 'Select all'}
                  </button>
                </div>

                {accounts.length === 0 ? (
                  <div className="py-4 text-center space-y-2">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      <div className="grid grid-cols-2 gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold">No channels found</p>
                    <a
                      href="/dashboard/accounts"
                      className="inline-block rounded-xl bg-[#22c55e] px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-2xs hover:bg-[#16a34a] hover:text-white"
                    >
                      + Connect a Channel
                    </a>
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {accounts.map((acc) => {
                      const Icon = PLATFORM_ICONS[acc.platform] || Layers;
                      const isChecked = selectedChannels.includes(acc.id);
                      return (
                        <div
                          key={acc.id}
                          onClick={() =>
                            setSelectedChannels((prev) =>
                              isChecked ? prev.filter((x) => x !== acc.id) : [...prev, acc.id]
                            )
                          }
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Icon size={14} />
                            <span className="text-xs text-slate-800 font-medium">
                              {acc.accountName}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Filter (Calendar Mode: All Posts ˅ / Drafts ˅ / Sent ˅) */}
          {viewMode === 'calendar' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setStatusFilterOpen(!statusFilterOpen)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs hover:bg-slate-50 capitalize"
              >
                <span>{calendarStatusFilter === 'all' ? 'All Posts' : calendarStatusFilter}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {statusFilterOpen && (
                <div className="absolute right-0 top-9 z-30 w-36 rounded-2xl border border-slate-200 bg-white p-1 shadow-xl text-xs font-semibold text-slate-700">
                  {(['all', 'scheduled', 'sent', 'drafts'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setCalendarStatusFilter(st);
                        setStatusFilterOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-slate-50 capitalize"
                    >
                      <span>{st === 'all' ? 'All Posts' : st}</span>
                      {calendarStatusFilter === st && <Check className="h-3 w-3 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tags Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setTagsPopoverOpen(!tagsPopoverOpen);
                setChannelsPopoverOpen(false);
                setTimezonePopoverOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              <span>Tags</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {tagsPopoverOpen && (
              <div className="absolute right-0 top-9 z-30 w-44 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl text-xs text-slate-600 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTag('all');
                    setTagsPopoverOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                >
                  <span>All Tags</span>
                  {selectedTag === 'all' && <Check className="h-3 w-3 text-emerald-600" />}
                </button>
              </div>
            )}
          </div>

          {/* No Date Drawer Toggle Button (Calendar Mode) */}
          {viewMode === 'calendar' && (
            <button
              type="button"
              onClick={() => setNoDateDrawerOpen(!noDateDrawerOpen)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 shadow-2xs transition ${
                noDateDrawerOpen
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <PanelRight className="h-3.5 w-3.5 text-slate-400" />
              <span>No Date</span>
            </button>
          )}

          {/* Timezone Selector (e.g. Kolkata) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setTimezonePopoverOpen(!timezonePopoverOpen);
                setChannelsPopoverOpen(false);
                setTagsPopoverOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <span>{selectedTimezone.label}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {timezonePopoverOpen && (
              <div className="absolute right-0 top-9 z-30 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl text-xs font-semibold text-slate-700 space-y-0.5">
                {TIMEZONES.map((tz) => (
                  <button
                    key={tz.value}
                    type="button"
                    onClick={() => {
                      setSelectedTimezone(tz);
                      setTimezonePopoverOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    <span>{tz.label}</span>
                    {selectedTimezone.value === tz.value && (
                      <Check className="h-3 w-3 text-emerald-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3-dots Options Menu Icon in Calendar mode */}
          {viewMode === 'calendar' && (
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
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
      {/* 3. VIEW MODE 1: LIST / QUEUE TIMELINE                                 */}
      {/* ===================================================================== */}
      {viewMode === 'list' && (
        <div className="space-y-8 pt-2">
          {/* QUEUE TAB: CHRONOLOGICAL POSTING SLOTS & QUEUED POSTS */}
          {subTab === 'queue' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {[
                { titlePrefix: 'Tomorrow,', titleSuffix: 'November 6', offset: 6 },
                { titlePrefix: 'Saturday,', titleSuffix: 'November 7', offset: 7 },
              ].map(({ titlePrefix, titleSuffix, offset }) => (
                <div key={titlePrefix + titleSuffix} className="space-y-3">
                  {/* Day Header (Tomorrow, bold + date regular) */}
                  <h3 className="text-sm text-slate-900">
                    <strong className="font-bold">{titlePrefix}</strong>{' '}
                    <span className="text-slate-700">{titleSuffix}</span>
                  </h3>

                  {/* Preconfigured Time Slots */}
                  <div className="space-y-2.5">
                    {DEFAULT_SCHEDULE_SLOTS.map((slot) => {
                      const Icon = PLATFORM_ICONS[slot.platform] || Layers;
                      const queuedPost = queuePosts.find((p) =>
                        p.jobs.some(
                          (j) =>
                            j.platform === slot.platform &&
                            j.status === 'PENDING' &&
                            p.scheduledAt?.includes(`-0${offset}`)
                        )
                      );

                      return (
                        <div
                          key={slot.time + slot.platform}
                          className="flex items-center gap-4 text-xs"
                        >
                          {/* Time Label on Left */}
                          <div className="w-16 text-right font-medium text-slate-500 shrink-0">
                            {slot.time}
                          </div>

                          {/* Slot Container on Right */}
                          {queuedPost ? (
                            /* Scheduled Post Card */
                            <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-emerald-400 hover:shadow-xs transition space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Icon size={16} />
                                  <span className="font-bold text-slate-900">
                                    {queuedPost.title || 'Scheduled Post'}
                                  </span>
                                </div>
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  Queued
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 line-clamp-2">
                                {queuedPost.caption}
                              </p>
                            </div>
                          ) : (
                            /* Empty Slot: Exactly Platform Icon + "+ New" */
                            <div
                              onClick={() =>
                                handleOpenComposerFromSlot(
                                  `2026-11-0${offset}`,
                                  slot.time,
                                  slot.platform
                                )
                              }
                              className="flex-1 flex items-center rounded-2xl border border-slate-200/90 bg-slate-50/50 px-3.5 py-3 hover:bg-white hover:border-slate-300 hover:shadow-2xs cursor-pointer transition"
                            >
                              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                                <Icon size={16} />
                                <span>+ New</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* + More Recommended Times (Centered link) */}
              <div className="text-center pt-3">
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                >
                  + More Recommended Times
                </button>
              </div>
            </div>
          )}

          {/* DRAFTS TAB */}
          {subTab === 'drafts' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              {draftPosts.length === 0 ? (
                <div className="py-20 text-center space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No drafts yet</h3>
                  <p className="text-xs text-slate-400">Posts saved as drafts will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {draftPosts.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2"
                    >
                      <h4 className="font-bold text-xs text-slate-900">{p.title || 'Draft'}</h4>
                      <p className="text-xs text-slate-600">{p.caption}</p>
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setComposerPrefill({ title: p.title, caption: p.caption });
                            setComposerOpen(true);
                          }}
                          className="rounded-lg bg-[#22c55e] px-3 py-1 text-xs font-bold text-slate-950"
                        >
                          Schedule
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* APPROVALS TAB */}
          {subTab === 'approvals' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              {approvalPosts.length === 0 ? (
                <div className="py-20 text-center space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <Zap className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">All caught up!</h3>
                  <p className="text-xs text-slate-400">
                    No posts with an unclear publishing result. Client approvals are on the Approvals page.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {approvalPosts.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-amber-200 bg-amber-50/20 p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-slate-900">{p.title}</h4>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Check if it went live
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{p.caption}</p>
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-100">
                        {p.jobs.map((j) => (
                          <button
                            key={j.id}
                            type="button"
                            onClick={() => actOnJob(j, 'resolve')}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            It is live: mark published
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SENT TAB */}
          {subTab === 'sent' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              {sentPosts.length === 0 ? (
                <div className="py-20 text-center space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <Check className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No sent posts yet</h3>
                  <p className="text-xs text-slate-400">
                    Posts successfully published to your accounts will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentPosts.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-slate-900">{p.title || 'Published Post'}</h4>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          Published
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{p.caption}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-400 text-[11px]">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          {p.jobs[0]?.externalUrl && (
                            <a
                              href={p.jobs[0].externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 font-bold text-blue-600 hover:underline"
                            >
                              <span>View Live</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setComposerPrefill({ title: p.title, caption: p.caption });
                              setComposerOpen(true);
                            }}
                            className="rounded-lg bg-slate-100 px-3 py-1 font-bold text-slate-700 hover:bg-slate-200"
                          >
                            Post again
                          </button>
                        </div>
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
      {/* 4. VIEW MODE 2: CALENDAR VIEW (MONTH & WEEK)                          */}
      {/* ===================================================================== */}
      {viewMode === 'calendar' && (
        <div className="flex gap-4 pt-1">
          {/* Main Calendar Grid Container */}
          <div className="flex-1 overflow-x-auto">
            {calendarGranularity === 'month' ? (
              /* MONTH VIEW (7x5 Grid) */
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                {/* Weekday Names Header */}
                <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-semibold text-slate-500 py-2.5">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
                  {monthDays.map(({ date, isCurrentMonth }, idx) => {
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    const dateNum = date.getDate();

                    return (
                      <div
                        key={idx}
                        onClick={() =>
                          handleOpenComposerFromSlot(date.toISOString().split('T')[0])
                        }
                        className={`min-h-[110px] p-2.5 hover:bg-slate-50/80 cursor-pointer transition flex flex-col justify-between ${
                          isCurrentMonth ? 'bg-white' : 'bg-slate-50/40 opacity-40'
                        }`}
                      >
                        {/* Date Number on Top Left (Plain text number) */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold ${
                              isToday ? 'text-emerald-600 font-bold' : 'text-slate-800'
                            }`}
                          >
                            {dateNum}
                          </span>
                        </div>

                        {/* Slot Badges for Connected Channels */}
                        <div className="space-y-1 pt-1">
                          {isCurrentMonth && (
                            <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/80 px-2 py-1 text-[11px] text-slate-700 font-medium">
                              <InstagramIcon size={12} />
                              <span>9:00 AM</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* WEEK VIEW (7 Columns with Hours Scale) */
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                {/* Week Header with Active Emerald Day Bar */}
                <div className="grid grid-cols-7 border-b border-slate-200 text-center">
                  {weekDays.map((d) => {
                    const isToday = d.toDateString() === new Date().toDateString();
                    return (
                      <div
                        key={d.toISOString()}
                        className={`py-2.5 text-xs font-bold transition border-b-2 ${
                          isToday
                            ? 'border-[#22c55e] text-emerald-700'
                            : 'border-transparent text-slate-700'
                        }`}
                      >
                        {d.toLocaleDateString('default', { weekday: 'long' })} {d.getDate()}
                      </div>
                    );
                  })}
                </div>

                {/* Vertical Hourly Scale */}
                <div className="divide-y divide-slate-100">
                  {['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM'].map(
                    (hr) => (
                      <div
                        key={hr}
                        className="grid grid-cols-7 min-h-[64px] divide-x divide-slate-100 relative"
                      >
                        <span className="absolute left-1 top-1 text-[10px] text-slate-400 font-medium">
                          {hr}
                        </span>
                        {weekDays.map((d) => (
                          <div
                            key={d.toISOString() + hr}
                            onClick={() =>
                              handleOpenComposerFromSlot(d.toISOString().split('T')[0], hr)
                            }
                            className="p-1 hover:bg-slate-50/80 cursor-pointer transition flex items-center justify-center text-[10px] text-slate-400"
                          >
                            <span className="opacity-0 hover:opacity-100 font-semibold">+ Add</span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* "No Date" Complementary Drawer */}
          {noDateDrawerOpen && (
            <div className="w-80 shrink-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 animate-in slide-in-from-right">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-900">No Date</h4>
                <button
                  type="button"
                  onClick={() => setNoDateDrawerOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {draftPosts.length === 0 ? (
                /* Empty state */
                <div className="py-16 text-center space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-slate-900">No drafts without a date</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Drafts and approvals without a scheduled date will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
                  {draftPosts.map((dp) => (
                    <div
                      key={dp.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1.5"
                    >
                      <h6 className="font-bold text-slate-900 leading-snug">{dp.title || 'Draft'}</h6>
                      <p className="text-[11px] text-slate-600 line-clamp-2">{dp.caption}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setComposerPrefill({ title: dp.title, caption: dp.caption });
                          setComposerOpen(true);
                        }}
                        className="w-full rounded-lg bg-[#22c55e] py-1 text-[11px] font-bold text-slate-950"
                      >
                        Schedule Onto Calendar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Post Composer Modal Bridge */}
      <PostComposerModal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSuccess={loadData}
        initialTitle={composerPrefill.title}
        initialCaption={composerPrefill.caption}
        initialBrief={composerPrefill.title || composerPrefill.caption}
      />
    </div>
  );
}
