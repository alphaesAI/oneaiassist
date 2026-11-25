'use client';

import {
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  Check,
  Flag,
  HelpCircle,
  Info,
  Layers,
  Smartphone,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TwitterIcon,
  YouTubeIcon,
} from '@/components/marketing/SocialIcons';
import { BrandLogo } from '@/components/marketing/BrandLogo';
import { api } from '@/lib/api-client';
import { APP_NAME } from '@/lib/marketing/site';

export type SupportedChannel = 'INSTAGRAM' | 'THREADS' | 'FACEBOOK' | 'TWITTER' | 'YOUTUBE';

interface ChannelConfig {
  id: SupportedChannel;
  name: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color: string;
  providerKey?: 'meta' | 'facebook' | 'instagram' | 'threads' | 'twitter' | 'youtube';
  whyTitle: string;
  whyPoints: string[];
  features: string[];
  worksWellWith: string[];
}

const CHANNELS: ChannelConfig[] = [
  {
    id: 'INSTAGRAM',
    name: 'Instagram',
    subtitle: 'Business, Creator, or Personal',
    icon: InstagramIcon,
    color: '#E1306C',
    providerKey: 'instagram',
    whyTitle: 'Why Instagram',
    whyPoints: [
      'Connect with a billion-strong monthly active user base.',
      'Reach shoppers where they discover new products.',
      'Create stories, posts, and reels.',
    ],
    features: ['Image', 'Reels', 'Post Analytics', 'Engagement', 'Stories', 'Audience Insights'],
    worksWellWith: ['Pinterest', 'TikTok', 'YouTube'],
  },
  {
    id: 'THREADS',
    name: 'Threads',
    subtitle: 'Profile',
    icon: ThreadsIcon,
    color: '#000000',
    providerKey: 'threads',
    whyTitle: 'Why Threads',
    whyPoints: [
      'Join 150+ million active users sharing real-time ideas.',
      'Share text updates, media hooks, and quick conversations.',
      'Seamlessly cross-promote from Instagram to expand reach.',
    ],
    features: ['Text Updates', 'Photo & Video', 'Link Previews', 'Analytics'],
    worksWellWith: ['Instagram', 'Twitter / X'],
  },
  {
    id: 'TWITTER',
    name: 'X (Twitter)',
    subtitle: 'Profile',
    icon: TwitterIcon,
    color: '#0F1419',
    providerKey: 'twitter',
    whyTitle: 'Why X (Twitter)',
    whyPoints: [
      'Engage with 500 million active users in real-time conversations.',
      'Participate in trending industry discussions and thought leadership.',
      'Drive fast-paced viral traffic and direct audience engagement.',
    ],
    features: ['Posts (280 chars)', 'Threads', 'Media Uploads', 'Analytics'],
    worksWellWith: ['Threads', 'YouTube', 'LinkedIn'],
  },
  {
    id: 'FACEBOOK',
    name: 'Facebook',
    subtitle: 'Page or Group',
    icon: FacebookIcon,
    color: '#1877F2',
    providerKey: 'facebook',
    whyTitle: 'Why Facebook',
    whyPoints: [
      'Reach 3 billion people monthly on the world’s most popular social network.',
      'Build community around your brand with Groups and Pages.',
      'Expand your organic and paid social footprint with detailed analytics.',
    ],
    features: ['Image', 'Video', 'Stories', 'Page Analytics', 'Scheduling'],
    worksWellWith: ['Instagram', 'Twitter / X'],
  },
  {
    id: 'YOUTUBE',
    name: 'YouTube',
    subtitle: 'Channel',
    icon: YouTubeIcon,
    color: '#FF0000',
    providerKey: 'youtube',
    whyTitle: 'Why YouTube',
    whyPoints: [
      'Engage with a 2 billion-strong audience.',
      'Harness the power of the world’s #2 search engine.',
      'Tap into a billion hours of daily video views with Shorts.',
    ],
    features: ['Shorts', 'Post Analytics', 'Long-form Video'],
    worksWellWith: ['TikTok', 'Instagram', 'Facebook'],
  },
];

interface ConnectChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export function ConnectChannelModal({ isOpen, onClose, onConnected }: ConnectChannelModalProps) {
  // Views: 'grid' | 'facebook_type' | 'instagram_type' | 'detail' | 'prompt_handle'
  const [view, setView] = useState<'grid' | 'facebook_type' | 'instagram_type' | 'detail' | 'prompt_handle'>('grid');
  const [selectedChannel, setSelectedChannel] = useState<ChannelConfig>(CHANNELS[0]);
  const [facebookType, setFacebookType] = useState<'PAGE' | 'GROUP' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState<{ id: string; configured: boolean; missing: string[] }[]>([]);

  useEffect(() => {
    if (isOpen) {
      setView('grid');
      setFacebookType(null);
      setError('');
      setBusy(false);
      api<{ providers: { id: string; configured: boolean; missing: string[] }[] }>('/api/accounts')
        .then((res) => setProviders(res.providers || []))
        .catch(() => undefined);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        if (view !== 'grid') {
          setView('grid');
        } else {
          onClose();
        }
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
  }, [isOpen, view, onClose]);

  if (!isOpen) return null;

  function handleSelectPlatform(channel: ChannelConfig) {
    setSelectedChannel(channel);
    setError('');
    if (channel.id === 'FACEBOOK') {
      setFacebookType(null);
      setView('facebook_type');
    } else if (channel.id === 'INSTAGRAM') {
      setView('instagram_type');
    } else {
      setView('detail');
    }
  }

  // Every connection goes through the platform's own login. The start route reports a channel
  // that is not set up, so this also works before the provider list has loaded.
  function executeConnect() {
    const providerKey = selectedChannel.providerKey;
    const provider = providers.find((p) => p.id === providerKey);
    if (provider && !provider.configured) {
      setError(`${selectedChannel.name} is not set up yet. Missing in the server environment: ${provider.missing.join(', ')}`);
      return;
    }
    setBusy(true);
    setError('');
    window.location.href = `/api/oauth/${providerKey}/start`;
  }

  const ActiveIcon = selectedChannel.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative z-10 flex flex-col bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* ============================================================== */}
        {/* VIEW 1: Main Overview Grid (Exact 3-Column Squircle Tiles)     */}
        {/* ============================================================== */}
        {view === 'grid' && (
          <div className="flex flex-col h-full">
            {/* Top Bar with Centered Title & Close Button */}
            <div className="relative flex items-center justify-between px-6 pt-6 pb-2">
              <div className="w-8" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Connect a New Channel</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 3-Column Grid of Vertical Squircle Tiles */}
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {CHANNELS.map((channel) => {
                  const Icon = channel.icon;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => handleSelectPlatform(channel)}
                      className="group flex flex-col items-center justify-center rounded-3xl border border-slate-200/80 bg-slate-50/50 p-6 text-center transition hover:border-slate-400 hover:bg-white hover:shadow-md"
                    >
                      {/* Squircle Brand App Icon (iOS Style) */}
                      <div
                        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xs transition group-hover:scale-105"
                        style={{ backgroundColor: channel.color }}
                      >
                        <Icon size={28} />
                      </div>

                      {/* Centered Platform Name */}
                      <h4 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-slate-950">
                        {channel.name}
                      </h4>

                      {/* Centered Subtitle */}
                      <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                        {channel.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Bottom Subtle Note */}
              <div className="mt-8 text-center">
                <p className="text-xs text-slate-400">
                  {APP_NAME} connects directly to official platform APIs. Tokens are encrypted.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: Facebook Account Type Selection                        */}
        {/* ============================================================== */}
        {view === 'facebook_type' && (
          <div className="flex flex-col h-full">
            {/* Top Bar: Back | ⇄ Facebook | Close */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <button
                type="button"
                onClick={() => setView('grid')}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                title="Back to channels"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              {/* Center Breadcrumb Connector */}
              <div className="flex items-center gap-2">
                <BrandLogo variant="icon" size="sm" className="h-5 w-7" />
                <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#1877F2] text-white shadow-2xs">
                  <FacebookIcon size={12} />
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

            {/* Centered Title & Subtitle */}
            <div className="text-center px-6 pt-2 pb-5">
              <h3 className="text-lg font-bold text-slate-900">Select Facebook Account Type</h3>
            </div>

            {/* Option Cards: Page vs Group */}
            <div className="px-6 space-y-3.5 flex-1 overflow-y-auto">
              {/* Option 1: Page */}
              <div
                onClick={() => setFacebookType('PAGE')}
                role="button"
                tabIndex={0}
                className={`flex items-start justify-between rounded-2xl border p-4.5 cursor-pointer transition ${
                  facebookType === 'PAGE'
                    ? 'border-[#22c55e] bg-emerald-50/20 ring-1 ring-[#22c55e]/30 shadow-xs'
                    : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-start gap-3.5 pr-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Flag className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Page</h4>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                      A page is for businesses, brands, organizations and public figures users &ldquo;like&rdquo; or &ldquo;follow&rdquo;.
                      Connecting to personal or professional profiles is not supported by Meta.
                    </p>
                  </div>
                </div>

                {/* Radio Circle */}
                <div className="pt-1 shrink-0">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                      facebookType === 'PAGE'
                        ? 'border-[#22c55e] bg-[#22c55e] text-slate-950'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {facebookType === 'PAGE' && <div className="h-2 w-2 rounded-full bg-slate-950" />}
                  </div>
                </div>
              </div>

              {/* Option 2: Group */}
              <div
                onClick={() => setFacebookType('GROUP')}
                role="button"
                tabIndex={0}
                className={`flex items-start justify-between rounded-2xl border p-4.5 cursor-pointer transition ${
                  facebookType === 'GROUP'
                    ? 'border-[#22c55e] bg-emerald-50/20 ring-1 ring-[#22c55e]/30 shadow-xs'
                    : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-start gap-3.5 pr-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Group</h4>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                      Meta does not allow apps to publish to Facebook Groups, so Groups cannot be connected.
                    </p>
                  </div>
                </div>

                {/* Radio Circle */}
                <div className="pt-1 shrink-0">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                      facebookType === 'GROUP'
                        ? 'border-[#22c55e] bg-[#22c55e] text-slate-950'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {facebookType === 'GROUP' && <div className="h-2 w-2 rounded-full bg-slate-950" />}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Bottom Bar */}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 mt-4 bg-slate-50/50">
              <div />

              <button
                type="button"
                disabled={!facebookType || busy}
                onClick={() => {
                  if (facebookType === 'GROUP') {
                    setError('Meta does not allow apps to connect or post to Facebook Groups. Choose Page instead.');
                  } else {
                    executeConnect();
                  }
                }}
                className={`rounded-xl px-6 py-2.5 text-xs font-bold transition shadow-xs ${
                  facebookType
                    ? 'bg-[#22c55e] text-slate-950 hover:bg-[#16a34a] hover:text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                {busy ? 'Connecting...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 3: Instagram Account Type Selection (Side-by-Side 2 Cards) */}
        {/* ============================================================== */}
        {view === 'instagram_type' && (
          <div className="flex flex-col h-full">
            {/* Top Bar: Back | ⇄ Instagram | Close */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <button
                type="button"
                onClick={() => setView('grid')}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                title="Back to channels"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              {/* Center Breadcrumb Connector */}
              <div className="flex items-center gap-2">
                <BrandLogo variant="icon" size="sm" className="h-5 w-7" />
                <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#E1306C] text-white shadow-2xs">
                  <InstagramIcon size={12} />
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

            {/* Centered Title & Subtitle */}
            <div className="text-center px-6 pt-2 pb-4">
              <h3 className="text-lg font-bold text-slate-900">How would you like to connect your Instagram Account?</h3>
              <p className="mt-1 text-xs text-slate-500">
                Features depend on the type of Instagram account you have and the connection you choose.
              </p>
            </div>

            {/* Side-by-Side 2 Cards Layout */}
            <div className="px-6 flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Left Card: Professional (Business & Creator) */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-900">Professional (Business & Creator)</h4>
                    {/* Green Pill Badge */}
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200/60">
                      <span>🔄</span>
                      <span>Automatic & Notification-based Posting</span>
                    </div>

                    {/* Bullet Checklist */}
                    <ul className="space-y-2 text-xs text-slate-700 pt-1">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong className="text-slate-900">Automatic posting</strong> - You schedule and we&apos;ll post</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong className="text-slate-900">Notifications</strong> - We notify you, then you finish in app</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong className="text-slate-900">Community</strong> - Easily reply to comments</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong className="text-slate-900">Sent Post Metrics</strong> - View past post performance</span>
                      </li>
                    </ul>
                  </div>

                  {/* Connect to Instagram Button */}
                  <div className="mt-5 space-y-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={executeConnect}
                      className="w-full rounded-xl bg-[#22c55e] py-2.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#16a34a] hover:text-white cursor-pointer"
                    >
                      {busy ? 'Connecting...' : 'Connect to Instagram'}
                    </button>
                    <p className="text-[11px] text-slate-400 flex items-start gap-1 leading-snug">
                      <Info className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>Instagram will prompt you to easily convert to a professional account if needed.</span>
                    </p>
                  </div>
                </div>

                {/* Right Card: Personal */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-900">Personal</h4>
                    {/* Gray Pill Badge */}
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      <Smartphone className="h-3 w-3" />
                      <span>Notification-Based Posting Only</span>
                    </div>

                    {/* Bullet Checklist */}
                    <ul className="space-y-2 text-xs text-slate-700 pt-1">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong className="text-slate-900">Notifications</strong> - We notify you, then you finish in app</span>
                      </li>
                    </ul>
                  </div>

                  {/* Setup Personal Account Button */}
                  <div className="mt-5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setError('Meta only allows apps to connect Business and Creator accounts. Switch this account to Professional in the Instagram app, then connect it.')
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                    >
                      Setup a Personal Account
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Helper Line with Facebook Icon */}
              <div className="text-center pt-2">
                <p className="text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline cursor-pointer" onClick={executeConnect}>
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1877F2] text-white">
                      <FacebookIcon size={8} />
                    </span>
                    Connect Instagram through Facebook
                  </span>{' '}
                  if your Instagram account is currently linked to Facebook.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 4: Channel Detail Screen (YouTube, Twitter, Threads)      */}
        {/* ============================================================== */}
        {view === 'detail' && (
          <div className="flex flex-col h-full">
            {/* Top Bar: Back | Close */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <button
                type="button"
                onClick={() => setView('grid')}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                title="Back to channels"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="px-6 flex-1 overflow-y-auto space-y-5">
              {/* Channel Header (Squircle + Title + Subtitle) */}
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-xs"
                  style={{ backgroundColor: selectedChannel.color }}
                >
                  <ActiveIcon size={26} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedChannel.name}</h3>
                  <p className="text-xs text-slate-500">{selectedChannel.subtitle}</p>
                </div>
              </div>

              {/* Section: Why [Platform] */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">{selectedChannel.whyTitle}</h4>
                <ul className="space-y-2 text-xs text-slate-600">
                  {selectedChannel.whyPoints.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Supported Features & Cross-Posting Pill Badges */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100">
                <div>
                  <h5 className="text-xs font-bold text-slate-900 mb-2">Supported Features</h5>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedChannel.features.map((f) => (
                      <span
                        key={f}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-slate-900 mb-2">
                    {selectedChannel.name} works well with
                  </h5>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedChannel.worksWellWith.map((w) => (
                      <span
                        key={w}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Bottom Bar: Help ▾ | Connect [Platform] */}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 mt-4 bg-slate-50/50">
              <div />

              <button
                type="button"
                disabled={busy}
                onClick={executeConnect}
                className="rounded-xl bg-[#22c55e] px-6 py-2.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#16a34a] hover:text-white cursor-pointer"
              >
                {busy ? 'Connecting...' : `Connect ${selectedChannel.name}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
