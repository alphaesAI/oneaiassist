'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Calendar,
  Send,
  Save,
  RotateCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sliders,
  DollarSign,
  Layers,
} from 'lucide-react';

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
  </svg>
);

const YoutubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

export default function DigitalMarketingSuitePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'compose' | 'integrations' | 'history'>('compose');

  // COMPOSE TAB STATE
  const [campaignName, setCampaignName] = useState('');
  const [campaignType, setCampaignType] = useState<'ORGANIC' | 'PAID'>('ORGANIC');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Paid options state
  const [budget, setBudget] = useState('250');
  const [ageRange, setAgeRange] = useState('25-64');
  const [location, setLocation] = useState('United States (All States)');
  const [interestTags, setInterestTags] = useState<string[]>(['Health Insurance', 'Family Wellness', 'Medicare']);
  const [newTagInput, setNewTagInput] = useState('');

  // AI Pre-Flight Audit state
  const [auditData, setAuditData] = useState<{
    complianceScore: number;
    ctrPrediction: 'LOW' | 'MEDIUM' | 'HIGH';
    auditResult: 'PASS' | 'REVIEW' | 'BLOCK';
    checklist: { rule: string; pass: boolean }[];
    recommendations: string[];
  } | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  // Schedule modal / date state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  // HISTORY TAB STATE
  const [historyPlatformFilter, setHistoryPlatformFilter] = useState('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');
  const [expandedAbTestId, setExpandedAbTestId] = useState<string | null>(null);

  // 1. Fetch History Campaigns
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['marketing-campaigns', historyPlatformFilter, historyStatusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/campaigns?platform=${historyPlatformFilter}&status=${historyStatusFilter}`);
      if (!res.ok) throw new Error('Failed to load marketing history');
      return res.json();
    },
  });

  // 2. Fetch Platform Connections
  const { data: integrationsData, isLoading: integrationsLoading } = useQuery({
    queryKey: ['marketing-integrations'],
    queryFn: async () => {
      const res = await fetch('/api/marketing/integrations');
      if (!res.ok) throw new Error('Failed to load integrations');
      return res.json();
    },
  });

  // 3. Platform Connect/Disconnect Mutation
  const toggleConnectionMutation = useMutation({
    mutationFn: async ({ platform, action }: { platform: string; action: 'CONNECT' | 'DISCONNECT' }) => {
      const res = await fetch('/api/marketing/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, action }),
      });
      if (!res.ok) throw new Error('Failed to update integration');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-integrations'] });
    },
  });

  // 4. Publish / Retry Mutation
  const publishMutation = useMutation({
    mutationFn: async ({ campaignId, action = 'publish' }: { campaignId: string; action?: string }) => {
      const res = await fetch('/api/marketing/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, action }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to publish campaign');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
    },
  });

  // Handle Platform Toggle Selection
  const togglePlatform = (plat: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(plat) ? prev.filter((p) => p !== plat) : [...prev, plat]
    );
  };

  // Handle Media File Drag/Drop or Select
  const handleMediaUpload = async (file: File) => {
    setMediaFileName(file.name);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/marketing/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setMediaUrl(data.url);
      }
    } catch {
      setMediaUrl(URL.createObjectURL(file));
    }
  };

  // Handle AI Caption Optimization
  const handleAiOptimize = async () => {
    if (!caption.trim()) return;
    setIsOptimizing(true);
    try {
      const res = await fetch('/api/marketing/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          platform: selectedPlatforms.join(', '),
          campaignType,
        }),
      });
      const data = await res.json();
      if (data.optimizedCaption) {
        setCaption(data.optimizedCaption);
      }
    } catch (err) {
      console.error('AI Caption Optimize Failed:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Handle AI Pre-Flight Audit
  const handleRunAudit = async () => {
    if (!caption.trim()) return;
    setIsAuditing(true);
    try {
      const res = await fetch('/api/marketing/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          platforms: selectedPlatforms,
          mediaUrl,
          type: campaignType,
        }),
      });
      const data = await res.json();
      setAuditData(data);
    } catch (err) {
      console.error('Pre-Flight Audit Error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  // Handle Create / Save Campaign (Draft, Schedule, Publish Now)
  const handleSaveCampaign = async (status: 'DRAFT' | 'SCHEDULED' | 'PENDING') => {
    if (!campaignName.trim() || !caption.trim()) {
      alert('Please enter a campaign name and caption.');
      return;
    }

    try {
      const payload = {
        name: campaignName,
        type: campaignType,
        platforms: selectedPlatforms,
        mediaUrl,
        caption,
        status: status === 'PENDING' ? 'PENDING' : status,
        scheduledAt: status === 'SCHEDULED' && scheduleDateTime ? scheduleDateTime : null,
        budget: campaignType === 'PAID' ? parseFloat(budget) || null : null,
        audienceTargeting: campaignType === 'PAID' ? { ageRange, location, interests: interestTags } : null,
        complianceScore: auditData?.complianceScore || null,
        ctrPrediction: auditData?.ctrPrediction || null,
        auditResult: auditData?.auditResult || null,
        auditDetails: auditData ? { checklist: auditData.checklist, recommendations: auditData.recommendations } : null,
      };

      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.campaign) throw new Error(data.error || 'Failed to save campaign');

      const createdCampaignId = data.campaign.id;

      if (status === 'PENDING' && createdCampaignId) {
        // Trigger background publishing job
        await publishMutation.mutateAsync({ campaignId: createdCampaignId });
      }

      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      setActiveTab('history');
      setShowScheduleModal(false);
    } catch (err: any) {
      alert(err.message || 'Error saving campaign');
    }
  };

  // Add Interest Tag Chip
  const addInterestTag = () => {
    if (newTagInput.trim() && !interestTags.includes(newTagInput.trim())) {
      setInterestTags([...interestTags, newTagInput.trim()]);
      setNewTagInput('');
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#c3c6d7]/40 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#1B4B91] tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004ac6]">ads_click</span>
            Digital Marketing Suite
          </h1>
          <p className="text-sm text-[#44474e]">
            Compose multi-channel healthcare social campaigns, run AI Pre-Flight compliance audits, and publish across connected platforms.
          </p>
        </div>
      </div>

      {/* Top 3 Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[#c3c6d7]">
        <button
          onClick={() => setActiveTab('compose')}
          className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'compose'
              ? 'border-[#004ac6] text-[#004ac6] bg-white rounded-t-lg'
              : 'border-transparent text-gray-600 hover:text-[#1B4B91]'
          }`}
        >
          <Sparkles className="w-4 h-4 text-[#004ac6]" />
          Compose
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'integrations'
              ? 'border-[#004ac6] text-[#004ac6] bg-white rounded-t-lg'
              : 'border-transparent text-gray-600 hover:text-[#1B4B91]'
          }`}
        >
          <Layers className="w-4 h-4 text-[#004ac6]" />
          Integrations
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-[#004ac6] text-[#004ac6] bg-white rounded-t-lg'
              : 'border-transparent text-gray-600 hover:text-[#1B4B91]'
          }`}
        >
          <Calendar className="w-4 h-4 text-[#004ac6]" />
          History
        </button>
      </div>

      {/* TAB 1: COMPOSE TAB */}
      {activeTab === 'compose' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-[#c3c6d7] p-6 shadow-sm space-y-6">
            {/* Campaign Name & Type Toggle */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q3 Individual Health Plan Enrollment Campaign"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:bg-white focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6] outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                  Campaign Type
                </label>
                <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-lg border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setCampaignType('ORGANIC')}
                    className={`py-1.5 text-xs font-semibold rounded-md transition ${
                      campaignType === 'ORGANIC'
                        ? 'bg-white text-[#1B4B91] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Organic Post
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignType('PAID')}
                    className={`py-1.5 text-xs font-semibold rounded-md transition ${
                      campaignType === 'PAID'
                        ? 'bg-[#1B4B91] text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Paid Ad
                  </button>
                </div>
              </div>
            </div>

            {/* Platform Selector Row (Multi-select) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                Target Social Platforms (Multi-Select)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'facebook', name: 'Facebook', icon: FacebookIcon, color: 'text-blue-600' },
                  { id: 'instagram', name: 'Instagram', icon: InstagramIcon, color: 'text-pink-600' },
                  { id: 'linkedin', name: 'LinkedIn', icon: LinkedinIcon, color: 'text-blue-700' },
                  { id: 'youtube', name: 'YouTube', icon: YoutubeIcon, color: 'text-red-600' },
                ].map((item) => {
                  const isSelected = selectedPlatforms.includes(item.id);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => togglePlatform(item.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-semibold transition ${
                        isSelected
                          ? 'border-[#004ac6] bg-[#004ac6]/10 text-[#004ac6] ring-1 ring-[#004ac6]'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${item.color}`} />
                      <span>{item.name}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-[#004ac6] ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Media Upload Area */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                Campaign Media & Creative Assets
              </label>
              <label className="border-2 border-dashed border-gray-300 hover:border-[#1B4B91] bg-gray-50/50 hover:bg-gray-50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition text-center group">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => e.target.files?.[0] && handleMediaUpload(e.target.files[0])}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-gray-400 group-hover:text-[#1B4B91] mb-2 transition" />
                <p className="text-sm font-medium text-gray-700">
                  Drag and drop campaign images, videos, or reels here
                </p>
                <p className="text-xs text-gray-500 mt-1">Supports PNG, JPG, MP4, MOV (Max 50MB)</p>
              </label>

              {mediaFileName && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs text-blue-900 font-medium">
                  <span className="truncate">Attached: {mediaFileName}</span>
                  <span className="text-[#004ac6] font-semibold">Ready for R2 Storage</span>
                </div>
              )}
            </div>

            {/* Caption Writer & AI Optimize */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Caption & Copy Writer
                </label>
                <button
                  type="button"
                  onClick={handleAiOptimize}
                  disabled={isOptimizing || !caption.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50 transition"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
                  {isOptimizing ? 'Rewriting with AI...' : 'AI Optimize Copy'}
                </button>
              </div>
              <textarea
                rows={5}
                placeholder="Write your campaign caption or promotional message here..."
                value={caption}
                onChange={(e) => {
                  setCaption(e.target.value);
                  setAuditData(null); // Reset audit when caption changes
                }}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:bg-white focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6] outline-none transition"
              />
            </div>

            {/* Paid Options Panel (Conditional) */}
            {campaignType === 'PAID' && (
              <div className="p-5 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 rounded-xl border border-blue-200 space-y-4">
                <h3 className="text-sm font-bold text-[#1B4B91] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#004ac6]" />
                  Paid Advertising & Audience Targeting Controls
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Campaign Budget ($)
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="w-full pl-8 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:border-[#004ac6]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Target Age Range
                    </label>
                    <input
                      type="text"
                      value={ageRange}
                      onChange={(e) => setAgeRange(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:border-[#004ac6]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Geographic Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:border-[#004ac6]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Audience Interest Chips
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {interestTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-blue-200 text-blue-900 text-xs font-semibold rounded-full shadow-sm"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setInterestTags(interestTags.filter((t) => t !== tag))}
                          className="hover:text-red-600 text-gray-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add interest tag (e.g. Wellness)..."
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInterestTag())}
                      className="flex-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:border-[#004ac6]"
                    />
                    <button
                      type="button"
                      onClick={addInterestTag}
                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold rounded-lg transition"
                    >
                      Add Tag
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Run Pre-Flight Audit Button */}
            {!auditData && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRunAudit}
                  disabled={isAuditing}
                  className="w-full py-3 bg-[#1B4B91] hover:bg-[#14376c] text-white font-semibold text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition cursor-pointer"
                >
                  <ShieldCheck className={`w-4 h-4 ${isAuditing ? 'animate-spin' : ''}`} />
                  {isAuditing ? 'Running Healthcare & Insurance Compliance Audit...' : 'Run AI Pre-Flight Audit'}
                </button>
              </div>
            )}
          </div>

          {/* AI Pre-Flight Audit Results Card */}
          {auditData && (
            <div className="bg-white rounded-xl border border-[#c3c6d7] p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#004ac6]" />
                  AI Pre-Flight Compliance Audit Report
                </h3>
                <span className="text-xs text-gray-500 font-mono">Policy Spec: Healthcare & Insurance Ad Standards v2.4</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Circular Compliance Score Gauge */}
                <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Compliance Score
                  </span>
                  <div className="relative w-24 h-24 flex items-center justify-center rounded-full border-4 border-[#004ac6] bg-white shadow-inner">
                    <span className="text-3xl font-extrabold text-[#1B4B91]">{auditData.complianceScore}</span>
                    <span className="text-xs text-gray-400 font-bold font-mono">/100</span>
                  </div>
                  <span className="mt-3 text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-0.5 rounded-full">
                    High Ad Quality
                  </span>
                </div>

                {/* CTR Prediction & Recommendations */}
                <div className="md:col-span-2 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      CTR Prediction:
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        auditData.ctrPrediction === 'HIGH'
                          ? 'bg-green-100 text-green-800'
                          : auditData.ctrPrediction === 'MEDIUM'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {auditData.ctrPrediction} EXPECTED CLICK-THROUGH
                    </span>
                  </div>

                  {/* Checklist */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Healthcare Insurance Content Policy Check:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {auditData.checklist.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-50 p-2 rounded-lg border border-gray-200">
                          {item.pass ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                          )}
                          <span className="truncate">{item.rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Recommendations */}
                  <div>
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">
                      AI Compliance Recommendations:
                    </span>
                    <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                      {auditData.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Large Status Verdict Banner */}
              <div
                className={`p-4 rounded-xl text-center font-extrabold text-lg flex items-center justify-center gap-3 ${
                  auditData.auditResult === 'PASS'
                    ? 'bg-green-600 text-white'
                    : auditData.auditResult === 'REVIEW'
                    ? 'bg-amber-500 text-white'
                    : 'bg-red-600 text-white'
                }`}
              >
                {auditData.auditResult === 'PASS' && <CheckCircle2 className="w-6 h-6" />}
                {auditData.auditResult === 'REVIEW' && <AlertTriangle className="w-6 h-6" />}
                {auditData.auditResult === 'BLOCK' && <XCircle className="w-6 h-6" />}
                <span>PRE-FLIGHT AUDIT VERDICT: {auditData.auditResult}</span>
              </div>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="bg-white rounded-xl border border-[#c3c6d7] p-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => handleSaveCampaign('DRAFT')}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save as Draft
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg transition flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </button>

              <button
                type="button"
                disabled={publishMutation.isPending}
                onClick={() => handleSaveCampaign('PENDING')}
                className="px-6 py-2.5 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-lg shadow-md disabled:opacity-40 transition flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                {publishMutation.isPending ? 'Publishing...' : 'Publish Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTEGRATIONS TAB */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-[#c3c6d7] p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1B4B91] mb-2">Connected Marketing & Ad Platforms</h2>
            <p className="text-xs text-gray-600 mb-6">
              Connect your official agency social media pages and ad accounts to enable automated publishing and lead tracking.
            </p>

            {integrationsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  {
                    platform: 'FACEBOOK',
                    title: 'Facebook Page',
                    desc: 'Publish posts & healthcare promo campaigns',
                    icon: FacebookIcon,
                    color: 'text-blue-600',
                  },
                  {
                    platform: 'INSTAGRAM',
                    title: 'Instagram Business',
                    desc: 'Share image carousels & video reels',
                    icon: InstagramIcon,
                    color: 'text-pink-600',
                  },
                  {
                    platform: 'LINKEDIN',
                    title: 'LinkedIn Profile/Company',
                    desc: 'B2B small business group health posts',
                    icon: LinkedinIcon,
                    color: 'text-blue-700',
                  },
                  {
                    platform: 'YOUTUBE',
                    title: 'YouTube Channel',
                    desc: 'Publish video guides & plan explainer shorts',
                    icon: YoutubeIcon,
                    color: 'text-red-600',
                  },
                  {
                    platform: 'META_ADS',
                    title: 'Meta Ads Manager',
                    desc: 'Run paid Facebook & Instagram ad campaigns',
                    icon: Sliders,
                    color: 'text-purple-600',
                  },
                ].map((item) => {
                  const conn = integrationsData?.connections?.find(
                    (c: any) => c.platform === item.platform
                  );
                  const isConnected = conn?.status === 'CONNECTED';
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.platform}
                      className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-gray-50 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm">
                            <Icon className={`w-6 h-6 ${item.color}`} />
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              isConnected
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {isConnected ? 'Connected' : 'Not Connected'}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{item.desc}</p>

                        {isConnected && conn?.accountName && (
                          <div className="mt-3 p-2 bg-white rounded-md border border-gray-200 text-xs font-medium text-gray-700 truncate">
                            Account: <span className="font-semibold text-gray-900">{conn.accountName}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 pt-3 border-t border-gray-200 flex items-center justify-between">
                        {isConnected ? (
                          <button
                            type="button"
                            onClick={() =>
                              toggleConnectionMutation.mutate({
                                platform: item.platform,
                                action: 'DISCONNECT',
                              })
                            }
                            className="text-xs font-semibold text-red-600 hover:text-red-800 transition"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              toggleConnectionMutation.mutate({
                                platform: item.platform,
                                action: 'CONNECT',
                              })
                            }
                            className="w-full py-2 bg-[#1B4B91] hover:bg-[#14376c] text-white text-xs font-bold rounded-lg transition"
                          >
                            Connect Account
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* History Filter Bar */}
          <div className="bg-white rounded-xl border border-[#c3c6d7] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={historyPlatformFilter}
                onChange={(e) => setHistoryPlatformFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:border-[#004ac6]"
              >
                <option value="ALL">All Platforms</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="linkedin">LinkedIn</option>
                <option value="youtube">YouTube</option>
              </select>

              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:border-[#004ac6]"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Published (SUCCESS)</option>
                <option value="PENDING">Pending</option>
                <option value="PUBLISHING">Publishing</option>
                <option value="FAILED">Failed</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            <span className="text-xs text-gray-500 font-medium">
              Total Campaigns: {historyData?.campaigns?.length || 0}
            </span>
          </div>

          {/* Published Posts Table */}
          <div className="bg-white rounded-xl border border-[#c3c6d7] overflow-hidden shadow-sm">
            {historyLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading campaign history...</div>
            ) : historyData?.campaigns?.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No campaigns found. Compose one to get started!</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Campaign Name</th>
                      <th className="p-4">Platforms</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Est. Reach</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-medium">
                    {historyData?.campaigns?.map((item: any) => {
                      const isExpanded = expandedAbTestId === item.id;
                      const hasAbVariants = item.abTestVariants && item.abTestVariants.length > 0;

                      return (
                        <React.Fragment key={item.id}>
                          <tr className="hover:bg-gray-50/80 transition">
                            <td className="p-4 font-bold text-gray-900">
                              <div className="flex items-center gap-2">
                                {hasAbVariants && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedAbTestId(isExpanded ? null : item.id)}
                                    className="p-1 text-gray-500 hover:text-gray-900"
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                )}
                                <span>{item.name}</span>
                              </div>
                              <p className="text-[11px] text-gray-500 font-normal truncate max-w-md mt-0.5">
                                {item.caption}
                              </p>
                            </td>

                            <td className="p-4">
                              <div className="flex items-center gap-1.5">
                                {item.platforms?.map((p: string) => (
                                  <span
                                    key={p}
                                    className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-semibold text-[10px] uppercase"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td className="p-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                  item.type === 'PAID'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {item.type}
                              </span>
                            </td>

                            <td className="p-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                  item.status === 'SUCCESS'
                                    ? 'bg-green-100 text-green-800'
                                    : item.status === 'PUBLISHING'
                                    ? 'bg-blue-100 text-blue-800 animate-pulse'
                                    : item.status === 'FAILED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {item.status === 'PUBLISHING' && <RotateCw className="w-3 h-3 animate-spin" />}
                                {item.status}
                              </span>
                            </td>

                            <td className="p-4 text-gray-600">
                              {item.publishedAt
                                ? new Date(item.publishedAt).toLocaleDateString()
                                : item.createdAt
                                ? new Date(item.createdAt).toLocaleDateString()
                                : 'Draft'}
                            </td>

                            <td className="p-4 font-semibold text-gray-900">
                              {item.reach ? item.reach.toLocaleString() : '0'}
                            </td>

                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {item.status === 'FAILED' && (
                                  <button
                                    type="button"
                                    onClick={() => publishMutation.mutate({ campaignId: item.id, action: 'retry' })}
                                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold transition flex items-center gap-1"
                                  >
                                    <RotateCw className="w-3 h-3" />
                                    Retry
                                  </button>
                                )}
                                <a
                                  href={`/dashboard/marketing`}
                                  className="p-1.5 text-gray-500 hover:text-[#004ac6] transition"
                                  title="View Post Details"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                            </td>
                          </tr>

                          {/* A/B Test Variant Expandable Row */}
                          {isExpanded && hasAbVariants && (
                            <tr className="bg-blue-50/40">
                              <td colSpan={7} className="p-4">
                                <div className="p-4 bg-white rounded-lg border border-blue-200 space-y-3">
                                  <h4 className="text-xs font-bold text-[#1B4B91] uppercase tracking-wider">
                                    A/B Test Variant Performance Comparison
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {item.abTestVariants.map((varItem: any, idx: number) => (
                                      <div key={varItem.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                                        <div className="flex justify-between font-bold text-gray-900 mb-1">
                                          <span>Variant {String.fromCharCode(65 + idx)}</span>
                                          <span className="text-[#004ac6]">Reach: {varItem.reach?.toLocaleString()}</span>
                                        </div>
                                        <p className="text-gray-600 line-clamp-2">{varItem.caption}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCHEDULE DATE/TIME MODAL */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl border border-[#c3c6d7] max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-[#1B4B91] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#004ac6]" />
              Schedule Campaign Release
            </h3>
            <p className="text-xs text-gray-600">
              Select the date and time when this pre-audited campaign should automatically publish.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Date and Time</label>
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#004ac6]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!scheduleDateTime}
                onClick={() => handleSaveCampaign('SCHEDULED')}
                className="px-4 py-2 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50"
              >
                Confirm Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
