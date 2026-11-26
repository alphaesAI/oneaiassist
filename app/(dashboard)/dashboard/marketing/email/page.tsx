'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  FileText,
  FlaskConical,
  LayoutTemplate,
  Mail,
  Monitor,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { CampaignReportModal } from '@/components/email/CampaignReportModal';
import AudienceManager from '@/components/email/AudienceManager';

interface EmailDesign {
  headline: string;
  greeting: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  accentColor: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  channel?: string;
  category: string;
  subject?: string | null;
  htmlBody?: string | null;
  jsonDesign?: EmailDesign | null;
  body: string;
  status: string;
  createdAt: string;
}

interface EmailCampaign {
  id: string;
  name: string;
  channel?: string;
  subject?: string | null;
  previewText?: string | null;
  templateId?: string | null;
  status: string;
  scheduledAt?: string | null;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  optedOut: number;
  createdAt: string;
  template?: EmailTemplate | null;
  liveJobs?: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    skippedSuppressed: number;
    skippedInvalid: number;
    cancelled: number;
  };
}

type HubTab = 'campaigns' | 'builder' | 'audience' | 'templates' | 'deliverability';
type BuilderStep = 1 | 2 | 3 | 4 | 5;

const DEFAULT_DESIGN: EmailDesign = {
  headline: 'Important Update for You',
  greeting: 'Hi {{first_name}},',
  message:
    'We wanted to share an important update about your account and upcoming options.\n\nIf you have any questions, simply reply to this email or click below to view your details.',
  ctaLabel: 'View Details',
  ctaUrl: 'https://oneai.drgodly.com',
  accentColor: '#1B4B91',
};

const STARTER_PRESETS: Array<{ label: string; name: string; subject: string; design: EmailDesign }> = [
  {
    label: 'Newsletter Update',
    name: 'Monthly Newsletter',
    subject: 'Your monthly update & tips',
    design: {
      headline: 'Monthly Highlights & Updates',
      greeting: 'Hi {{first_name}},',
      message:
        'Here is a quick summary of what is new this month and how you can get the most out of your coverage.\n\nOur team is always here if you want a quick review.',
      ctaLabel: 'Read Full Update',
      ctaUrl: 'https://oneai.drgodly.com',
      accentColor: '#1B4B91',
    },
  },
  {
    label: 'Renewal Reminder',
    name: 'Policy Renewal Reminder',
    subject: '{{first_name}}, your renewal options are ready',
    design: {
      headline: 'Time to Review Your Renewal',
      greeting: 'Hello {{first_name}},',
      message:
        'Your policy ({{policy_number}}) is coming up for renewal soon.\n\nReview your plan details early to lock in the best rate with zero interruption.',
      ctaLabel: 'Review Renewal',
      ctaUrl: 'https://oneai.drgodly.com',
      accentColor: '#0F766E',
    },
  },
  {
    label: 'Special Offer',
    name: 'Exclusive Client Offer',
    subject: 'A special offer reserved for you, {{first_name}}',
    design: {
      headline: 'Exclusive Savings Available Now',
      greeting: 'Hi {{first_name}},',
      message:
        'For a limited time, existing clients can unlock additional benefits when upgrading or bundling their plan.\n\nClick below to check your eligibility in under 60 seconds.',
      ctaLabel: 'Claim Offer',
      ctaUrl: 'https://oneai.drgodly.com',
      accentColor: '#7C3AED',
    },
  },
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtmlFromDesign(design: EmailDesign): string {
  const paragraphs = design.message
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:15px;line-height:1.65;color:#475569;margin:0 0 16px 0;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const ctaHtml = design.ctaLabel.trim()
    ? `<div style="margin:28px 0;"><a href="${escapeHtml(design.ctaUrl || '#')}" style="display:inline-block;background:${design.accentColor || '#1B4B91'};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 26px;border-radius:8px;font-size:14px;">${escapeHtml(design.ctaLabel)}</a></div>`
    : '';

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1e293b;background:#ffffff;border-radius:12px;">
  <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">${escapeHtml(design.headline)}</h1>
  <p style="font-size:15px;font-weight:600;color:#1e293b;margin:0 0 12px 0;">${escapeHtml(design.greeting)}</p>
  ${paragraphs}
  ${ctaHtml}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px 0;" />
  <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0;">
    {{sender_address}}<br/>
    <a href="{{unsubscribe_url}}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a> from these emails at any time.
  </p>
</div>`;
}

export default function EmailMarketingHubPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<HubTab>('campaigns');
  const [builderStep, setBuilderStep] = useState<BuilderStep>(1);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Builder state
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [isAbTest, setIsAbTest] = useState(false);
  const [abSubjectB, setAbSubjectB] = useState('');
  const [abSplit, setAbSplit] = useState(50);
  const [abWinnerMetric, setAbWinnerMetric] = useState<'CLICKS' | 'OPENS'>('CLICKS');
  const [abDurationHours, setAbDurationHours] = useState(4);

  // Audience state
  const [recipientType, setRecipientType] = useState<'all' | 'segment' | 'tag' | 'stage' | 'email_engagement'>('all');
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [emailActivity, setEmailActivity] = useState<'OPENED_LAST_30_DAYS' | 'CLICKED_ANY' | 'NEVER_BOUNCED'>('OPENED_LAST_30_DAYS');

  // Content & Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiSubjects, setAiSubjects] = useState<string[]>([]);

  // Schedule state
  const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Plain-English Template Modal (Create or Edit)
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplDesign, setTplDesign] = useState<EmailDesign>(DEFAULT_DESIGN);
  const [showRawHtml, setShowRawHtml] = useState(false);
  const [customHtmlOverride, setCustomHtmlOverride] = useState('');
  const [selectedReportCampaignId, setSelectedReportCampaignId] = useState<string | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  // Queries
  const { data: emailConfig } = useQuery<any>({
    queryKey: ['email-config'],
    queryFn: async () => (await fetch('/api/settings/email/config')).json(),
  });

  const { data: deliverability } = useQuery<any>({
    queryKey: ['email-deliverability'],
    queryFn: async () => (await fetch('/api/channels/email/deliverability')).json(),
  });

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<EmailCampaign[]>({
    queryKey: ['email-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/broadcast?channel=EMAIL');
      if (!res.ok) throw new Error('Failed to load email campaigns');
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as EmailCampaign[] | undefined;
      const hasActive = data?.some((c) => c.status === 'SENDING' || c.status === 'QUEUED');
      return hasActive ? 3000 : false;
    },
  });

  const { data: savedSegments = [] } = useQuery<{ id: string; name: string; description?: string }[]>({
    queryKey: ['saved-segments'],
    queryFn: async () => {
      const res = await fetch('/api/segments');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.segments || []);
    },
  });

  const { data: allTemplates = [], isLoading: loadingTemplates } = useQuery<EmailTemplate[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/templates');
      if (!res.ok) throw new Error('Failed to load templates');
      return res.json();
    },
  });

  const emailTemplates = useMemo(
    () => allTemplates.filter((t) => (t.channel || 'WHATSAPP') === 'EMAIL'),
    [allTemplates]
  );

  const selectedTemplate = useMemo(
    () => emailTemplates.find((t) => t.id === selectedTemplateId) || null,
    [emailTemplates, selectedTemplateId]
  );

  // Audience preview count
  const { data: audiencePreview } = useQuery<{ recipientCount: number; optedOutCount?: number }>({
    queryKey: ['email-audience-preview', recipientType, filterValue, emailActivity, selectedSegmentId],
    queryFn: async () => {
      if (recipientType === 'segment') {
        if (!selectedSegmentId) return { recipientCount: 0, optedOutCount: 0 };
        const res = await fetch(`/api/segments/${selectedSegmentId}/count?channel=EMAIL`);
        if (!res.ok) return { recipientCount: 0, optedOutCount: 0 };
        const data = await res.json();
        return { recipientCount: data.audienceCount || 0, optedOutCount: data.optedOutCount || 0 };
      }
      const params = new URLSearchParams({
        preview: 'true',
        channel: 'EMAIL',
        type: recipientType,
        value: recipientType === 'email_engagement' ? emailActivity : filterValue,
        ...(recipientType === 'email_engagement' ? { emailActivity } : {}),
      });
      const res = await fetch(`/api/dashboard/broadcast?${params.toString()}`);
      if (!res.ok) return { recipientCount: 0, optedOutCount: 0 };
      return res.json();
    },
  });

  // Aggregate KPI metrics
  const kpis = useMemo(() => {
    const totalSent = campaigns.reduce((acc, c) => acc + (c.sent || 0), 0);
    const totalDelivered = campaigns.reduce((acc, c) => acc + (c.delivered || 0), 0);
    const totalOpened = campaigns.reduce((acc, c) => acc + (c.read || 0), 0);
    const totalClicked = campaigns.reduce((acc, c) => acc + (c.replied || 0), 0);
    const openRate = totalDelivered > 0 ? ((totalOpened / totalDelivered) * 100).toFixed(1) : '0.0';
    const ctr = totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100).toFixed(1) : '0.0';
    return { totalSent, totalDelivered, openRate, ctr };
  }, [campaigns]);

  // Usage metrics (100% dynamic from deliverability API)
  const sentToday: number = deliverability?.usage?.sentToday ?? 0;
  const dailyQuota: number = deliverability?.usage?.dailyQuota ?? 100;
  const remainingToday: number = deliverability?.usage?.remainingToday ?? Math.max(0, dailyQuota - sentToday);
  const sentThisMonth: number = deliverability?.usage?.sentThisMonth ?? 0;
  const usagePct = dailyQuota > 0 ? Math.min(100, Math.round((sentToday / dailyQuota) * 100)) : 0;

  // AI Assist mutation
  const aiAssistMutation = useMutation({
    mutationFn: async (payload: { action: 'generate_subject' | 'draft_body'; topic: string }) => {
      const res = await fetch('/api/email/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI assist failed');
      return data;
    },
    onSuccess: (data, vars) => {
      if (vars.action === 'generate_subject' && Array.isArray(data.result)) {
        setAiSubjects(data.result);
      } else if (vars.action === 'draft_body' && typeof data.result === 'string') {
        // Strip HTML tags cleanly into plain English paragraphs for the visual editor
        const plain = data.result
          .replace(/<\/(p|h1|h2|h3|div|li)>/gi, '\n\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        setTplDesign((prev) => ({
          ...prev,
          headline: vars.topic || prev.headline,
          message: plain || prev.message,
        }));
      }
    },
    onError: (err: any) => notify('error', err.message),
  });

  // Test Send mutation
  const testSendMutation = useMutation({
    mutationFn: async () => {
      if (!testEmailAddress.includes('@')) throw new Error('Enter a valid test email address');
      const res = await fetch('/api/email/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: testEmailAddress,
          subject: subject || selectedTemplate?.subject || campaignName || 'Test Email',
          previewText,
          templateId: selectedTemplateId || undefined,
          htmlBody: selectedTemplate
            ? selectedTemplate.htmlBody || selectedTemplate.body
            : buildHtmlFromDesign(DEFAULT_DESIGN),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test send failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-deliverability'] });
      notify('success', `Test email sent to ${testEmailAddress}`);
    },
    onError: (err: any) => notify('error', err.message),
  });

  // Save (Create or Update) Template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!tplName.trim()) throw new Error('Template name is required');
      if (!tplDesign.message.trim() && !customHtmlOverride.trim()) {
        throw new Error('Email message content is required');
      }
      const htmlBody = showRawHtml && customHtmlOverride.trim()
        ? customHtmlOverride
        : buildHtmlFromDesign(tplDesign);

      const url = editingTemplateId
        ? `/api/dashboard/templates/${editingTemplateId}`
        : '/api/dashboard/templates';
      const method = editingTemplateId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplName.trim(),
          channel: 'EMAIL',
          category: 'MARKETING',
          subject: tplSubject.trim() || tplName.trim(),
          htmlBody,
          jsonDesign: tplDesign,
          body: `${tplDesign.headline}\n\n${tplDesign.greeting}\n\n${tplDesign.message}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save template');
      return data;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelectedTemplateId(saved.id);
      if (!subject && saved.subject) setSubject(saved.subject);
      setShowTemplateModal(false);
      setEditingTemplateId(null);
      notify('success', editingTemplateId ? 'Template updated!' : 'Email template created and selected!');
    },
    onError: (err: any) => notify('error', err.message),
  });

  // Delete Template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dashboard/templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete template');
      return data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (selectedTemplateId === id) setSelectedTemplateId('');
      notify('success', 'Template deleted');
    },
    onError: (err: any) => notify('error', err.message),
  });

  // Delete Campaign mutation
  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dashboard/broadcast/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete campaign');
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      notify('success', 'Campaign deleted');
    },
    onError: (err: any) => notify('error', err.message),
  });

  // Launch Campaign mutation
  const launchCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!campaignName.trim()) throw new Error('Campaign name is required');
      if (!selectedTemplateId) throw new Error('Please select or create an email template');
      if (!subject.trim()) throw new Error('Subject line is required');

      let scheduledAt: string | undefined;
      if (scheduleType === 'later') {
        if (!scheduleDate || !scheduleTime) throw new Error('Select both schedule date and time');
        scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      }

      const res = await fetch('/api/dashboard/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          channel: 'EMAIL',
          templateId: selectedTemplateId,
          subject: subject.trim(),
          previewText: previewText.trim() || undefined,
          senderName: emailConfig?.fromName,
          senderEmail: emailConfig?.fromEmail,
          replyTo: emailConfig?.replyToEmail || undefined,
          isAbTest,
          abSubjectB: isAbTest ? abSubjectB.trim() : undefined,
          abTestSplit: isAbTest ? abSplit : undefined,
          abWinnerMetric: isAbTest ? abWinnerMetric : undefined,
          abDurationHours: isAbTest ? abDurationHours : undefined,
          segmentId: recipientType === 'segment' ? selectedSegmentId : undefined,
          recipientFilter: recipientType === 'segment' ? undefined : {
            type: recipientType,
            value: recipientType === 'email_engagement' ? emailActivity : filterValue,
            emailActivity: recipientType === 'email_engagement' ? emailActivity : undefined,
          },
          scheduledAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to launch campaign');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['email-deliverability'] });
      setActiveTab('campaigns');
      setBuilderStep(1);
      setCampaignName('');
      setSubject('');
      setPreviewText('');
      notify('success', scheduleType === 'later' ? 'Email campaign scheduled!' : 'Email campaign launched!');
    },
    onError: (err: any) => notify('error', err.message),
  });

  const openNewTemplateModal = (preset?: (typeof STARTER_PRESETS)[number]) => {
    setEditingTemplateId(null);
    setShowRawHtml(false);
    setCustomHtmlOverride('');
    if (preset) {
      setTplName(preset.name);
      setTplSubject(preset.subject);
      setTplDesign(preset.design);
    } else {
      setTplName('');
      setTplSubject('');
      setTplDesign(DEFAULT_DESIGN);
    }
    setShowTemplateModal(true);
  };

  const openEditTemplateModal = (tpl: EmailTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplName(tpl.name);
    setTplSubject(tpl.subject || '');
    if (tpl.jsonDesign && typeof tpl.jsonDesign === 'object') {
      setTplDesign({ ...DEFAULT_DESIGN, ...tpl.jsonDesign });
      setShowRawHtml(false);
    } else {
      setTplDesign({
        ...DEFAULT_DESIGN,
        headline: tpl.subject || tpl.name,
        message: tpl.body || '',
      });
      setCustomHtmlOverride(tpl.htmlBody || '');
      setShowRawHtml(Boolean(tpl.htmlBody && !tpl.jsonDesign));
    }
    setShowTemplateModal(true);
  };

  const domains: any[] = deliverability?.domains || [];
  const hasVerifiedDomain = domains.some((d) => d.status === 'VERIFIED');
  const senderDomain = emailConfig?.fromEmail?.split('@')[1]?.toLowerCase() || '';
  const senderMatchesDomain = domains.some((d) => d.status === 'VERIFIED' && d.domain.toLowerCase() === senderDomain);

  const renderedPreviewHtml = (
    selectedTemplate?.htmlBody ||
    selectedTemplate?.body ||
    buildHtmlFromDesign(DEFAULT_DESIGN)
  )
    .replace(/\{\{first_name[^}]*\}\}/g, 'Alex')
    .replace(/\{\{name[^}]*\}\}/g, 'Alex Taylor')
    .replace(/\{\{policy_number[^}]*\}\}/g, 'POL-99281')
    .replace(/\{\{sender_address[^}]*\}\}/g, emailConfig?.fromName || 'OneAI Assist')
    .replace(/\{\{unsubscribe_url[^}]*\}\}/g, '#unsubscribe');

  const quotaExceeded = (audiencePreview?.recipientCount ?? 0) > remainingToday;

  return (
    <div className="min-h-screen bg-slate-50/70 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1B4B91] text-white flex items-center justify-center shadow-sm">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Email Marketing</h1>
            <p className="text-xs text-slate-500">
              Plain-English campaign builder, A/B testing &amp; live Resend quota tracking
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dynamic Daily Quota Pill */}
          <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs flex items-center gap-2">
            <span className="text-slate-500">Today:</span>
            <span className={`font-bold ${remainingToday === 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {sentToday} / {dailyQuota}
            </span>
            <span className="text-[11px] text-slate-400">({remainingToday} left)</span>
          </div>

          <Link
            href="/dashboard/settings"
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            Sender &amp; DNS
          </Link>
          <button
            type="button"
            onClick={() => {
              setActiveTab('builder');
              setBuilderStep(1);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#1B4B91] hover:bg-[#153a72] rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Create Email Campaign
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Sender Readiness Alert */}
      {(!emailConfig?.configured || !hasVerifiedDomain || (hasVerifiedDomain && !senderMatchesDomain)) && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-0.5">
              <p className="font-semibold">
                {!emailConfig?.configured
                  ? 'Resend API Key is not configured yet'
                  : !hasVerifiedDomain
                  ? 'Your sending domain is pending DNS verification'
                  : `Sender email (${emailConfig?.fromEmail}) does not match your verified domain`}
              </p>
              <p className="text-amber-700">
                {!emailConfig?.configured
                  ? 'Add your Full Access Resend API key and verify your domain in Settings before sending live campaigns.'
                  : !hasVerifiedDomain
                  ? 'Add the DNS records in your domain provider and click Verify DNS in Settings.'
                  : 'Update your From Sender Email in Settings to match your verified domain so Resend accepts live sends.'}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/settings"
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap self-start sm:self-center"
          >
            Open Settings →
          </Link>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {[
          { id: 'campaigns', label: 'Campaigns & Analytics', icon: BarChart3 },
          { id: 'builder', label: 'Campaign Builder', icon: Send },
          { id: 'audience', label: 'Audience', icon: Users },
          { id: 'templates', label: 'Email Templates', icon: LayoutTemplate },
          { id: 'deliverability', label: 'Quota & Deliverability', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as HubTab)}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
                active
                  ? 'border-[#1B4B91] text-[#1B4B91]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CAMPAIGNS & ANALYTICS */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Emails Sent (All Time)', value: kpis.totalSent.toLocaleString(), sub: `${sentThisMonth} sent this month` },
              { label: 'Avg. Open Rate', value: `${kpis.openRate}%`, sub: 'Tracked via Resend' },
              { label: 'Avg. Click Rate (CTR)', value: `${kpis.ctr}%`, sub: 'Link click tracking' },
              {
                label: 'Daily Resend Quota',
                value: `${sentToday} / ${dailyQuota}`,
                sub: `${remainingToday} emails remaining today`,
              },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{kpi.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
                <p className="text-[11px] text-slate-500 mt-1">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Campaigns Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Email Campaigns</h2>
              <span className="text-xs text-slate-400">{campaigns.length} total</span>
            </div>

            {loadingCampaigns ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading email campaigns...</div>
            ) : campaigns.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-[#1B4B91] flex items-center justify-center mx-auto">
                  <Mail className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No email campaigns yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Launch your first email campaign using plain-English templates, AI subject lines, and live inbox previews.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('builder');
                    setBuilderStep(1);
                  }}
                  className="px-4 py-2 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg"
                >
                  Create First Campaign
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-5 py-3">Campaign</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Sent / Delivered</th>
                      <th className="px-4 py-3">Opens</th>
                      <th className="px-4 py-3">Clicks</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {campaigns.map((c) => {
                      const openPct = c.delivered > 0 ? Math.round((c.read / c.delivered) * 100) : 0;
                      const clickPct = c.delivered > 0 ? Math.round((c.replied / c.delivered) * 100) : 0;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedReportCampaignId(c.id)}
                              className="text-left group block"
                            >
                              <p className="font-semibold text-slate-900 group-hover:text-[#1B4B91] transition flex items-center gap-1.5">
                                {c.name}
                                <span className="opacity-0 group-hover:opacity-100 text-[10px] text-[#1B4B91] font-normal underline">
                                  View Report →
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-500 truncate max-w-xs">
                                {c.subject || c.template?.subject || 'No subject'}
                              </p>
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="space-y-1">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                  c.status === 'COMPLETED'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : c.status === 'SENDING'
                                    ? 'bg-amber-50 text-amber-700 animate-pulse'
                                    : c.status === 'QUEUED'
                                    ? 'bg-blue-50 text-blue-700'
                                    : c.status === 'PAUSED'
                                    ? 'bg-purple-50 text-purple-700'
                                    : c.status === 'FAILED'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {c.status === 'SENDING' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping mr-0.5" />}
                                {c.status}
                              </span>
                              {c.status === 'SENDING' && (c.liveJobs?.total || 0) > 0 && (
                                <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-amber-500 h-full rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(100, Math.round(((c.liveJobs?.sent || 0) / (c.liveJobs?.total || 1)) * 100))}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-medium text-slate-700">
                            {c.status === 'SENDING' || c.status === 'QUEUED' ? (
                              <span>
                                {c.liveJobs?.sent ?? c.sent} / {c.liveJobs?.total ?? (c.sent + (c.liveJobs?.pending ?? 0))}
                                {c.liveJobs?.total ? ` (${Math.round(((c.liveJobs.sent || 0) / c.liveJobs.total) * 100)}%)` : ''}
                              </span>
                            ) : (
                              <span>{c.liveJobs?.sent ?? c.sent} / {c.delivered}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedReportCampaignId(c.id)}
                              className="text-left hover:text-[#1B4B91] transition"
                              title="Click to view opens breakdown"
                            >
                              <span className="font-semibold text-slate-800 hover:text-[#1B4B91]">{openPct}%</span>{' '}
                              <span className="text-[11px] text-slate-400">({c.read})</span>
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedReportCampaignId(c.id)}
                              className="text-left hover:text-[#1B4B91] transition"
                              title="Click to view clicks breakdown"
                            >
                              <span className="font-semibold text-slate-800 hover:text-[#1B4B91]">{clickPct}%</span>{' '}
                              <span className="text-[11px] text-slate-400">({c.replied})</span>
                            </button>
                          </td>
                          <td className="px-4 py-3.5 text-slate-500">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                title="View Detailed Campaign Report"
                                onClick={() => setSelectedReportCampaignId(c.id)}
                                className="p-1.5 text-slate-400 hover:text-[#1B4B91] hover:bg-slate-100 rounded transition"
                              >
                                <BarChart3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Duplicate Campaign"
                                onClick={() => {
                                  setCampaignName(`${c.name} (Copy)`);
                                  setSubject(c.subject || '');
                                  setPreviewText(c.previewText || '');
                                  if (c.templateId) setSelectedTemplateId(c.templateId);
                                  setActiveTab('builder');
                                  setBuilderStep(1);
                                }}
                                className="p-1.5 text-slate-400 hover:text-[#1B4B91] hover:bg-slate-100 rounded transition"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Delete Campaign"
                                onClick={() => deleteCampaignMutation.mutate(c.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: 5-STEP CAMPAIGN BUILDER */}
      {activeTab === 'builder' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
            {[
              { step: 1, title: '1. Details' },
              { step: 2, title: '2. Audience' },
              { step: 3, title: '3. Content' },
              { step: 4, title: '4. Review' },
              { step: 5, title: '5. Schedule' },
            ].map((s, i) => (
              <React.Fragment key={s.step}>
                <button
                  type="button"
                  onClick={() => setBuilderStep(s.step as BuilderStep)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    builderStep === s.step
                      ? 'bg-[#1B4B91] text-white'
                      : builderStep > s.step
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {builderStep > s.step && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {s.title}
                </button>
                {i < 4 && <ChevronRight className="w-4 h-4 text-slate-300 hidden sm:block" />}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Setup & Subject */}
          {builderStep === 1 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 max-w-3xl">
              <div>
                <h2 className="text-base font-bold text-slate-900">Campaign Details &amp; Subject Line</h2>
                <p className="text-xs text-slate-500">
                  Sending as <span className="font-semibold text-slate-700">{emailConfig?.fromName || 'OneAI Assist'}</span> ({emailConfig?.fromEmail || 'Not configured'})
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Campaign Name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g., November Policy Renewal Offer"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4B91]/20 focus:border-[#1B4B91]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">Email Subject Line</label>
                    <button
                      type="button"
                      onClick={() => aiAssistMutation.mutate({ action: 'generate_subject', topic: campaignName || subject || 'client update' })}
                      disabled={aiAssistMutation.isPending}
                      className="text-[11px] font-semibold text-[#1B4B91] hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      {aiAssistMutation.isPending ? 'Generating...' : 'AI Subject Ideas'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., {{first_name}}, your 2026 coverage options are ready"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4B91]/20 focus:border-[#1B4B91]"
                  />
                  {aiSubjects.length > 0 && (
                    <div className="mt-2 p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg space-y-1.5">
                      <p className="text-[10px] font-bold text-blue-800 uppercase">AI Suggestions (click to apply):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {aiSubjects.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSubject(s)}
                            className="text-[11px] bg-white border border-blue-200 px-2.5 py-1 rounded-md hover:bg-blue-100 text-slate-700 text-left"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Preview Text (Preheader)</label>
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Short snippet shown next to subject in Gmail / Apple Mail..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAbTest}
                      onChange={(e) => setIsAbTest(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <FlaskConical className="w-3.5 h-3.5 text-purple-600" />
                    Enable A/B Subject Line Test
                  </label>

                  {isAbTest && (
                    <div className="mt-3 p-3.5 bg-purple-50/60 border border-purple-100 rounded-lg space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-purple-900 mb-1">Variant B Subject Line</label>
                        <input
                          type="text"
                          value={abSubjectB}
                          onChange={(e) => setAbSubjectB(e.target.value)}
                          placeholder="Alternative subject line to test..."
                          className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-purple-900 mb-1">Determine Winner By</label>
                          <select
                            value={abWinnerMetric}
                            onChange={(e) => setAbWinnerMetric(e.target.value as 'CLICKS' | 'OPENS')}
                            className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white text-purple-950 font-medium"
                          >
                            <option value="CLICKS">Highest Click Rate (Clicks / Delivered)</option>
                            <option value="OPENS">Highest Open Rate (Opens / Delivered)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-purple-900 mb-1">Test Duration Before Rollout</label>
                          <select
                            value={abDurationHours}
                            onChange={(e) => setAbDurationHours(Number(e.target.value))}
                            className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white text-purple-950 font-medium"
                          >
                            <option value={1}>1 hour</option>
                            <option value={2}>2 hours</option>
                            <option value={4}>4 hours (Recommended)</option>
                            <option value={8}>8 hours</option>
                            <option value={24}>24 hours</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs text-purple-900">
                          <span className="font-semibold">Audience Test Portion: {abSplit}%</span>
                          <span className="text-[11px] text-purple-700">
                            {abSplit === 100
                              ? '50% Variant A / 50% Variant B (No remainder)'
                              : `${Math.round(abSplit / 2)}% A / ${Math.round(abSplit / 2)}% B (Remaining ${100 - abSplit}% held for winner)`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={100}
                          step={10}
                          value={abSplit}
                          onChange={(e) => setAbSplit(Number(e.target.value))}
                          className="w-full accent-purple-600"
                        />
                        <p className="text-[11px] text-purple-800 leading-relaxed bg-white/70 p-2 rounded border border-purple-100">
                          Variant A and B will each be dispatched to {Math.round(abSplit / 2)}% of recipients immediately.
                          {abSplit < 100 ? (
                            <> After {abDurationHours} hour{abDurationHours > 1 ? 's' : ''}, the winning variant (by {abWinnerMetric === 'CLICKS' ? 'click rate' : 'open rate'}) will automatically be dispatched to the remaining {100 - abSplit}% of subscribers.</>
                          ) : (
                            <> Since 100% of the audience is in the test, winner analytics will be finalized once all sends complete.</>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBuilderStep(2)}
                  className="px-4 py-2 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg"
                >
                  Next: Audience →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Audience */}
          {builderStep === 2 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 max-w-3xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Target Audience</h2>
                  <p className="text-xs text-slate-500">
                    {audiencePreview?.optedOutCount
                      ? `${audiencePreview.optedOutCount} bounced/unsubscribed contacts automatically excluded`
                      : 'Bounced and unsubscribed contacts are automatically excluded'}
                  </p>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-100 text-right">
                  <p className="text-[10px] font-bold uppercase text-blue-700">Estimated Recipients</p>
                  <p className="text-lg font-bold text-[#1B4B91]">{audiencePreview?.recipientCount ?? 0}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { id: 'segment', title: 'Saved Segment', desc: 'Target contacts via saved dynamic rule trees' },
                  { id: 'all', title: 'All Email Subscribers', desc: 'All active contacts with a valid email' },
                  { id: 'tag', title: 'Filter by CRM Tag', desc: 'Target specific customer tags' },
                  { id: 'stage', title: 'Filter by Pipeline Stage', desc: 'e.g., NEW, QUALIFIED, PROPOSAL' },
                  { id: 'email_engagement', title: 'Email Engagement', desc: 'Opened or clicked recent emails' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRecipientType(opt.id as any)}
                    className={`p-3.5 rounded-xl border text-left transition ${
                      recipientType === opt.id
                        ? 'border-[#1B4B91] bg-blue-50/50 ring-1 ring-[#1B4B91]'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">{opt.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {recipientType === 'segment' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Saved Segment</label>
                  {savedSegments.length === 0 ? (
                    <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">
                      No saved segments found. You can create segments under Contacts &gt; Segments, or select &quot;All Email Subscribers&quot;.
                    </div>
                  ) : (
                    <select
                      value={selectedSegmentId}
                      onChange={(e) => setSelectedSegmentId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">-- Choose a saved segment --</option>
                      {savedSegments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.description ? `— ${s.description}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {(recipientType === 'tag' || recipientType === 'stage') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {recipientType === 'tag' ? 'Tag Name' : 'Lead / Customer Stage'}
                  </label>
                  <input
                    type="text"
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    placeholder={recipientType === 'tag' ? 'e.g., VIP, Renewal-2026' : 'e.g., QUALIFIED'}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {recipientType === 'email_engagement' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Engagement Segment</label>
                  <select
                    value={emailActivity}
                    onChange={(e) => setEmailActivity(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="OPENED_LAST_30_DAYS">Opened an email in the last 30 days</option>
                    <option value="CLICKED_ANY">Clicked a link in any campaign</option>
                    <option value="NEVER_BOUNCED">Never bounced (clean list)</option>
                  </select>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setBuilderStep(1)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderStep(3)}
                  className="px-4 py-2 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg"
                >
                  Next: Content &amp; Test →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Design & Test */}
          {builderStep === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Choose Email Template</h2>
                  <button
                    type="button"
                    onClick={() => openNewTemplateModal()}
                    className="text-xs font-semibold text-[#1B4B91] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Template
                  </button>
                </div>

                {emailTemplates.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 space-y-3">
                    <p className="text-xs text-slate-600 text-center">Start from a plain-English preset:</p>
                    <div className="space-y-1.5">
                      {STARTER_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => openNewTemplateModal(p)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 hover:border-[#1B4B91] rounded-lg text-left text-xs font-semibold text-slate-800 flex items-center justify-between"
                        >
                          <span>{p.label}</span>
                          <span className="text-[10px] text-[#1B4B91]">Customize →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {emailTemplates.map((t) => (
                      <div
                        key={t.id}
                        className={`w-full p-3 rounded-lg border flex items-center justify-between gap-2 transition ${
                          selectedTemplateId === t.id
                            ? 'border-[#1B4B91] bg-blue-50/50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedTemplateId(t.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-xs font-bold text-slate-900 truncate">{t.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{t.subject || 'No subject'}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditTemplateModal(t)}
                          title="Edit in Plain English"
                          className="p-1.5 text-slate-400 hover:text-[#1B4B91] rounded"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Send Test Email */}
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">Send a Test Email</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmailAddress}
                      onChange={(e) => setTestEmailAddress(e.target.value)}
                      placeholder="you@domain.com"
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => testSendMutation.mutate()}
                      disabled={testSendMutation.isPending}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                    >
                      {testSendMutation.isPending ? 'Sending...' : 'Send Test'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setBuilderStep(2)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuilderStep(4)}
                    className="px-4 py-2 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg"
                  >
                    Next: Review Checklist →
                  </button>
                </div>
              </div>

              {/* Right: Live Inbox Preview */}
              <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Eye className="w-3.5 h-3.5" /> Inbox Preview
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`p-1.5 rounded ${previewDevice === 'desktop' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`p-1.5 rounded ${previewDevice === 'mobile' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="px-5 py-3 border-b border-slate-100 text-xs space-y-1 bg-white">
                  <p><span className="text-slate-400">From:</span> <span className="font-medium text-slate-800">{emailConfig?.fromName || 'OneAI Assist'} &lt;{emailConfig?.fromEmail || 'care@domain.com'}&gt;</span></p>
                  <p><span className="text-slate-400">Subject:</span> <span className="font-bold text-slate-900">{subject || selectedTemplate?.subject || '(No subject set)'}</span></p>
                </div>

                <div className="p-4 bg-slate-100 flex-1 flex justify-center overflow-auto">
                  <div
                    className={`bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden transition-all ${
                      previewDevice === 'mobile' ? 'w-[360px]' : 'w-full'
                    }`}
                  >
                    <iframe
                      title="Email Preview"
                      srcDoc={renderedPreviewHtml}
                      className="w-full min-h-[420px] border-0"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Pre-Flight Review Checklist */}
          {builderStep === 4 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 max-w-3xl">
              <div>
                <h2 className="text-base font-bold text-slate-900">Pre-Flight Review &amp; Checklist</h2>
                <p className="text-xs text-slate-500">
                  Verify critical deliverability requirements before scheduling your campaign.
                </p>
              </div>

              <div className="space-y-2.5 text-xs">
                {[
                  {
                    ok: !!emailConfig?.configured,
                    label: 'Email Provider Configured',
                    desc: emailConfig?.configured
                      ? `Connected to ${emailConfig.provider} provider`
                      : 'Missing email provider credentials. Configure in Settings > Email.',
                  },
                  {
                    ok: hasVerifiedDomain && senderMatchesDomain,
                    label: 'Verified Sending Domain',
                    desc: hasVerifiedDomain && senderMatchesDomain
                      ? `From address domain is verified via DKIM/SPF DNS`
                      : `Sender email (${emailConfig?.fromEmail || 'none'}) does not match a verified sending domain.`,
                  },
                  {
                    ok: !!subject.trim(),
                    label: 'Subject Line Set',
                    desc: subject.trim() ? `Subject: "${subject}"` : 'Missing email subject line.',
                  },
                  {
                    ok: !!selectedTemplateId,
                    label: 'Content Template Selected',
                    desc: selectedTemplate ? `Template: ${selectedTemplate.name}` : 'No email template selected.',
                  },
                  {
                    ok: (audiencePreview?.recipientCount ?? 0) > 0 && !quotaExceeded,
                    label: 'Audience Available & Within Quota',
                    desc: quotaExceeded
                      ? `Exceeds quota: ${audiencePreview?.recipientCount ?? 0} recipients > ${remainingToday} daily quota remaining`
                      : `Target audience: ${audiencePreview?.recipientCount ?? 0} valid subscribers (${remainingToday} remaining quota today)`,
                  },
                  {
                    ok: true,
                    label: 'Compliance Footer & Unsubscribe Included',
                    desc: 'Physical postal address and working one-click unsubscribe links are automatically injected into every email before sending.',
                  },
                  ...(isAbTest
                    ? [
                        {
                          ok: !!abSubjectB.trim(),
                          label: 'A/B Testing Configuration',
                          desc: abSubjectB.trim()
                            ? `Testing Variant A vs Variant B across ${abSplit}% test audience (${abDurationHours}h window evaluated by ${abWinnerMetric})`
                            : 'Variant B subject line is empty. Please enter Variant B subject in Step 1.',
                        },
                      ]
                    : []),
                ].map((chk, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    {chk.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className={chk.ok ? 'text-slate-900 font-semibold' : 'text-amber-900 font-semibold'}>
                        {chk.label}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{chk.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-3">
                <button
                  type="button"
                  onClick={() => setBuilderStep(3)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  ← Back to Content
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderStep(5)}
                  className="px-4 py-2 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg"
                >
                  Next: Schedule &amp; Launch →
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Schedule & Launch */}
          {builderStep === 5 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 max-w-3xl">
              <div>
                <h2 className="text-base font-bold text-slate-900">Campaign Schedule &amp; Final Launch</h2>
                <p className="text-xs text-slate-500">Choose when this campaign should begin dispatching to recipients.</p>
              </div>

              {/* Campaign Summary Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Campaign Summary</p>
                <div className="grid grid-cols-2 gap-3 text-slate-700">
                  <div>
                    <span className="text-slate-400">Campaign Name:</span>
                    <p className="font-semibold text-slate-900">{campaignName || 'Untitled Campaign'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Sender:</span>
                    <p className="font-semibold text-slate-900">{emailConfig?.fromName} &lt;{emailConfig?.fromEmail}&gt;</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Subject:</span>
                    <p className="font-semibold text-slate-900">{subject || '(No subject)'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Audience:</span>
                    <p className="font-semibold text-slate-900">{audiencePreview?.recipientCount ?? 0} recipients</p>
                  </div>
                  {isAbTest && (
                    <div className="col-span-2 pt-2 border-t border-slate-200">
                      <span className="text-purple-700 font-bold flex items-center gap-1">
                        <FlaskConical className="w-3.5 h-3.5 text-purple-600" /> A/B Split Test Enabled
                      </span>
                      <p className="text-slate-700 mt-0.5">
                        Variant A: &quot;{subject}&quot; vs Variant B: &quot;{abSubjectB}&quot; &bull; {abSplit}% test split &bull; Evaluated by {abWinnerMetric} after {abDurationHours}h
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-700">Delivery Schedule</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setScheduleType('now')}
                    className={`px-4 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                      scheduleType === 'now' ? 'border-[#1B4B91] bg-blue-50 text-[#1B4B91]' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" /> Send Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType('later')}
                    className={`px-4 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                      scheduleType === 'later' ? 'border-[#1B4B91] bg-blue-50 text-[#1B4B91]' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" /> Schedule for Later
                  </button>
                </div>

                {scheduleType === 'later' && (
                  <div className="flex gap-3">
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-3">
                <button
                  type="button"
                  onClick={() => setBuilderStep(4)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  ← Back to Review
                </button>
                <button
                  type="button"
                  onClick={() => launchCampaignMutation.mutate()}
                  disabled={launchCampaignMutation.isPending || !subject.trim() || !selectedTemplateId || (audiencePreview?.recipientCount ?? 0) === 0}
                  className="px-5 py-2.5 bg-[#1B4B91] hover:bg-[#153a72] disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {launchCampaignMutation.isPending
                    ? 'Launching...'
                    : scheduleType === 'later'
                    ? 'Schedule Campaign'
                    : 'Launch Email Campaign'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EMAIL TEMPLATES */}
      {activeTab === 'audience' && <AudienceManager />}

      {activeTab === 'templates' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Write templates in plain English — responsive layout and unsubscribe links are built automatically
            </p>
            <button
              type="button"
              onClick={() => openNewTemplateModal()}
              className="px-3.5 py-2 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> New Email Template
            </button>
          </div>

          {/* Starter Presets Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Quick Starter Templates</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {STARTER_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => openNewTemplateModal(preset)}
                  className="p-3 rounded-lg border border-slate-200 hover:border-[#1B4B91] hover:bg-blue-50/40 text-left transition flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900">{preset.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{preset.subject}</p>
                  </div>
                  <Plus className="w-4 h-4 text-[#1B4B91] shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {loadingTemplates ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading templates...</div>
          ) : emailTemplates.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No saved templates yet</p>
              <p className="text-xs text-slate-500">Pick a quick starter above or create your own in plain English.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {emailTemplates.map((tpl) => (
                <div key={tpl.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="h-44 bg-slate-100 border-b border-slate-200 overflow-hidden pointer-events-none">
                    <iframe
                      title={tpl.name}
                      srcDoc={tpl.htmlBody || tpl.body}
                      className="w-[200%] h-[200%] origin-top-left scale-50 border-0"
                      sandbox="allow-same-origin"
                    />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">{tpl.name}</h3>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{tpl.subject || 'No subject'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTemplateId(tpl.id);
                          if (!subject && tpl.subject) setSubject(tpl.subject);
                          setActiveTab('builder');
                          setBuilderStep(1);
                        }}
                        className="flex-1 py-1.5 bg-slate-100 hover:bg-[#1B4B91] hover:text-white text-slate-700 text-xs font-semibold rounded-lg transition"
                      >
                        Use in Campaign
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditTemplateModal(tpl)}
                        title="Edit Template"
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-[#1B4B91]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplateMutation.mutate(tpl.id)}
                        title="Delete Template"
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: QUOTA & DELIVERABILITY */}
      {activeTab === 'deliverability' && (
        <div className="space-y-5">
          {/* Dynamic Daily & Monthly Quota Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Resend Sending Quota (Live Usage)</h3>
                <p className="text-xs text-slate-500">
                  {deliverability?.warmup?.recommendedStage || 'Resend Free (100/day)'} • {sentThisMonth} sent this month
                </p>
              </div>
              <span className="text-xs font-bold text-[#1B4B91]">
                {sentToday} / {dailyQuota} used today ({remainingToday} remaining)
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-[#1B4B91]'
                }`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">Sender Health</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">{deliverability?.healthStatus || 'HEALTHY'}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Auto-pause threshold: {deliverability?.metrics?.thresholds?.autoPause ?? 0.3}% complaints
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">Bounce &amp; Unsubscribe</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {deliverability?.metrics?.totalBounces ?? 0} bounces • {deliverability?.metrics?.totalUnsubscribes ?? 0} unsubs
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Auto-suppressed from future sends</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">Sending Domains</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{domains.length} registered</p>
              <Link href="/dashboard/settings" className="text-[11px] font-semibold text-[#1B4B91] hover:underline">
                Manage DNS in Settings →
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Recent Deliverability &amp; Suppression Events
              </h3>
            </div>
            {!deliverability?.recentEvents?.length ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No bounces, unsubscribes, or spam complaints recorded yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Event</th>
                    <th className="px-4 py-2.5">Recipient / Detail</th>
                    <th className="px-4 py-2.5">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliverability.recentEvents.map((ev: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-5 py-2.5 font-semibold text-slate-800">{ev.type || ev.eventType}</td>
                      <td className="px-4 py-2.5 text-slate-600">{ev.email || ev.detail || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* PLAIN-ENGLISH EMAIL TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingTemplateId ? 'Edit Email Template' : 'Create Email Template'}
                </h3>
                <p className="text-xs text-slate-500">Write in plain English — your layout updates live on the right</p>
              </div>
              <button type="button" onClick={() => setShowTemplateModal(false)} className="text-xs text-slate-400 hover:text-slate-700">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Plain English Form */}
              <div className="lg:col-span-6 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Template Name</label>
                    <input
                      type="text"
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      placeholder="e.g., Monthly Newsletter"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Subject</label>
                    <input
                      type="text"
                      value={tplSubject}
                      onChange={(e) => setTplSubject(e.target.value)}
                      placeholder="e.g., Your Monthly Update"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* AI Plain English Assistant */}
                <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg flex gap-2">
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="Ask AI to write this email (e.g., Policy renewal reminder)..."
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => aiAssistMutation.mutate({ action: 'draft_body', topic: aiTopic || tplName || 'client update' })}
                    disabled={aiAssistMutation.isPending}
                    className="px-3 py-1.5 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg flex items-center gap-1 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {aiAssistMutation.isPending ? 'Writing...' : 'AI Write'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Headline</label>
                  <input
                    type="text"
                    value={tplDesign.headline}
                    onChange={(e) => setTplDesign((d) => ({ ...d, headline: e.target.value }))}
                    placeholder="Main email heading"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Greeting</label>
                  <input
                    type="text"
                    value={tplDesign.greeting}
                    onChange={(e) => setTplDesign((d) => ({ ...d, greeting: e.target.value }))}
                    placeholder="Hi {{first_name}},"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">Message (Plain English)</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTplDesign((d) => ({ ...d, message: `${d.message} {{first_name}}` }))}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-medium text-slate-700"
                      >
                        + First Name
                      </button>
                      <button
                        type="button"
                        onClick={() => setTplDesign((d) => ({ ...d, message: `${d.message} {{policy_number}}` }))}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-medium text-slate-700"
                      >
                        + Policy #
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={6}
                    value={tplDesign.message}
                    onChange={(e) => setTplDesign((d) => ({ ...d, message: e.target.value }))}
                    placeholder="Write your email message in plain English..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Button Text</label>
                    <input
                      type="text"
                      value={tplDesign.ctaLabel}
                      onChange={(e) => setTplDesign((d) => ({ ...d, ctaLabel: e.target.value }))}
                      placeholder="View Details"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Button Link</label>
                    <input
                      type="url"
                      value={tplDesign.ctaUrl}
                      onChange={(e) => setTplDesign((d) => ({ ...d, ctaUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Color</label>
                    <input
                      type="color"
                      value={tplDesign.accentColor}
                      onChange={(e) => setTplDesign((d) => ({ ...d, accentColor: e.target.value }))}
                      className="w-full h-8 p-0.5 border border-slate-300 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!showRawHtml && !customHtmlOverride) {
                      setCustomHtmlOverride(buildHtmlFromDesign(tplDesign));
                    }
                    setShowRawHtml((v) => !v);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                >
                  {showRawHtml ? 'Hide Advanced HTML' : 'Advanced: Edit Raw HTML'}
                </button>

                {showRawHtml && (
                  <textarea
                    rows={5}
                    value={customHtmlOverride}
                    onChange={(e) => setCustomHtmlOverride(e.target.value)}
                    className="w-full px-3 py-2 text-[11px] font-mono border border-slate-300 rounded-lg"
                  />
                )}
              </div>

              {/* Live Visual Preview */}
              <div className="lg:col-span-6 bg-slate-100 rounded-xl border border-slate-200 p-3 flex flex-col">
                <p className="text-[11px] font-bold uppercase text-slate-400 mb-2">Live Visual Preview</p>
                <div className="bg-white rounded-lg border border-slate-200 flex-1 overflow-hidden">
                  <iframe
                    title="Template Live Preview"
                    srcDoc={(showRawHtml && customHtmlOverride ? customHtmlOverride : buildHtmlFromDesign(tplDesign))
                      .replace(/\{\{first_name[^}]*\}\}/g, 'Alex')
                      .replace(/\{\{policy_number[^}]*\}\}/g, 'POL-10001')
                      .replace(/\{\{sender_address[^}]*\}\}/g, emailConfig?.fromName || 'OneAI Assist')
                      .replace(/\{\{unsubscribe_url[^}]*\}\}/g, '#')}
                    className="w-full h-full min-h-[380px] border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveTemplateMutation.mutate()}
                disabled={saveTemplateMutation.isPending}
                className="px-4 py-2 bg-[#1B4B91] text-white text-xs font-semibold rounded-lg"
              >
                {saveTemplateMutation.isPending ? 'Saving...' : editingTemplateId ? 'Update Template' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAMPAIGN DETAILED REPORT & CONTACT DRILLDOWN MODAL */}
      <CampaignReportModal
        campaignId={selectedReportCampaignId}
        isOpen={!!selectedReportCampaignId}
        onClose={() => setSelectedReportCampaignId(null)}
      />
    </div>
  );
}
