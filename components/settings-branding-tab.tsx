'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building2, 
  Upload, 
  Clock, 
  Globe, 
  Moon, 
  Save, 
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface BrandingData {
  name: string;
  logoUrl: string;
  primaryColor: string;
  timezone: string;
  businessHours: Record<string, { open: string; close: string; enabled: boolean }>;
  outOfOfficeEnabled: boolean;
  outOfOfficeGreeting: string;
}

export default function SettingsBrandingTab() {
  const queryClient = useQueryClient();

  const [agencyName, setAgencyName] = useState('Prime Marketing Experts');
  const [logoUrl, setLogoUrl] = useState('/OneAILogo.png');
  const [primaryColor, setPrimaryColor] = useState('#1B4B91');
  const [timezone, setTimezone] = useState('America/New_York');
  const [outOfOfficeEnabled, setOutOfOfficeEnabled] = useState(true);
  const [outOfOfficeGreeting, setOutOfOfficeGreeting] = useState(
    'Thank you for reaching out to Prime Marketing Experts. Our office is currently closed. An advisor will follow up with you on the next business day.'
  );
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string; enabled: boolean }>>({
    mon: { open: '09:00', close: '18:00', enabled: true },
    tue: { open: '09:00', close: '18:00', enabled: true },
    wed: { open: '09:00', close: '18:00', enabled: true },
    thu: { open: '09:00', close: '18:00', enabled: true },
    fri: { open: '09:00', close: '18:00', enabled: true },
    sat: { open: '10:00', close: '16:00', enabled: false },
    sun: { open: '10:00', close: '16:00', enabled: false },
  });

  const { data: initialData } = useQuery<BrandingData>({
    queryKey: ['settings-branding'],
    queryFn: async () => {
      const res = await fetch('/api/settings/branding');
      if (!res.ok) throw new Error('Failed to fetch branding');
      return res.json();
    },
  });

  useEffect(() => {
    if (initialData) {
      if (initialData.name) setAgencyName(initialData.name);
      if (initialData.logoUrl) setLogoUrl(initialData.logoUrl);
      if (initialData.primaryColor) setPrimaryColor(initialData.primaryColor);
      if (initialData.timezone) setTimezone(initialData.timezone);
      if (initialData.businessHours) setBusinessHours(initialData.businessHours);
      if (typeof initialData.outOfOfficeEnabled === 'boolean') setOutOfOfficeEnabled(initialData.outOfOfficeEnabled);
      if (initialData.outOfOfficeGreeting) setOutOfOfficeGreeting(initialData.outOfOfficeGreeting);
    }
  }, [initialData]);

  // Save Branding Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agencyName,
          logoUrl,
          primaryColor,
          timezone,
          businessHours,
          outOfOfficeEnabled,
          outOfOfficeGreeting,
        }),
      });
      if (!res.ok) throw new Error('Failed to save branding settings');
      return res.json();
    },
    onSuccess: () => {
      setSaveSuccessMsg('Branding and Business Hours saved successfully!');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings-branding'] });
    },
  });

  const toggleDay = (dayKey: string) => {
    setBusinessHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        enabled: !prev[dayKey].enabled,
      },
    }));
  };

  const handleTimeChange = (dayKey: string, field: 'open' | 'close', val: string) => {
    setBusinessHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: val,
      },
    }));
  };

  const handleLogoUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/marketing/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) setLogoUrl(data.url);
    } catch {
      setLogoUrl(URL.createObjectURL(file));
    }
  };

  const daysList = [
    { key: 'mon', label: 'Monday' },
    { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' },
    { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' },
    { key: 'sat', label: 'Saturday' },
    { key: 'sun', label: 'Sunday' },
  ];

  return (
    <div className="space-y-6">
      {/* Agency Identity & Branding Card */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2 border-b border-gray-100 pb-3">
          <Building2 className="w-5 h-5 text-[#004ac6]" />
          Agency Identity & Branding Assets
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Agency Name</label>
              <input
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Primary Theme Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded-xl border border-gray-300 cursor-pointer"
                />
                <span className="font-mono text-xs text-gray-700 font-bold">{primaryColor}</span>
                <span className="text-[11px] text-gray-400 font-medium">Deep Blue Stitch Primary</span>
              </div>
            </div>
          </div>

          {/* Logo Uploader */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">Agency Logo Image</label>
            <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="w-16 h-16 rounded-xl bg-white border border-gray-200 flex items-center justify-center p-2 shadow-sm shrink-0">
                <img src={logoUrl} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
              </div>

              <label className="flex-1 border-2 border-dashed border-gray-300 hover:border-[#1B4B91] bg-white rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                  className="hidden"
                />
                <Upload className="w-5 h-5 text-gray-400 mb-1" />
                <span className="text-xs font-bold text-[#004ac6]">Upload New Logo</span>
                <span className="text-[10px] text-gray-400">PNG, SVG, JPG (Max 5MB)</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Business Hours & Operating Schedule */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#004ac6]" />
            Business Hours & Timezone Schedule
          </h3>

          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-400" />
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:border-[#004ac6]"
            >
              <option value="America/New_York">Eastern Standard Time (EST)</option>
              <option value="America/Chicago">Central Standard Time (CST)</option>
              <option value="America/Denver">Mountain Standard Time (MST)</option>
              <option value="America/Los_Angeles">Pacific Standard Time (PST)</option>
            </select>
          </div>
        </div>

        {/* Weekly Day Matrix */}
        <div className="space-y-3">
          {daysList.map((d) => {
            const dayConf = businessHours[d.key] || { open: '09:00', close: '18:00', enabled: true };
            return (
              <div key={d.key} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs">
                <div className="flex items-center gap-3 w-32">
                  <input
                    type="checkbox"
                    checked={dayConf.enabled}
                    onChange={() => toggleDay(d.key)}
                    className="w-4 h-4 text-[#004ac6] rounded focus:ring-[#004ac6]"
                  />
                  <span className={`font-bold ${dayConf.enabled ? 'text-[#1c1b1f]' : 'text-gray-400'}`}>
                    {d.label}
                  </span>
                </div>

                {dayConf.enabled ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={dayConf.open}
                      onChange={(e) => handleTimeChange(d.key, 'open', e.target.value)}
                      className="px-2.5 py-1 bg-white border border-gray-300 rounded-lg outline-none focus:border-[#004ac6] text-xs font-semibold"
                    />
                    <span className="text-gray-400 font-bold">to</span>
                    <input
                      type="time"
                      value={dayConf.close}
                      onChange={(e) => handleTimeChange(d.key, 'close', e.target.value)}
                      className="px-2.5 py-1 bg-white border border-gray-300 rounded-lg outline-none focus:border-[#004ac6] text-xs font-semibold"
                    />
                  </div>
                ) : (
                  <span className="text-xs font-bold text-gray-400 italic">CLOSED</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Out-of-Office AI Auto-Responder */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-[#1c1b1f]">Automated Out-of-Office Auto-Responder</h3>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={outOfOfficeEnabled}
              onChange={(e) => setOutOfOfficeEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#004ac6]" />
          </label>
        </div>

        {outOfOfficeEnabled && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Off-Hours Auto-Response Copy</label>
            <textarea
              rows={3}
              value={outOfOfficeGreeting}
              onChange={(e) => setOutOfOfficeGreeting(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs outline-none focus:bg-white focus:border-[#004ac6]"
            />
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2">
        {saveSuccessMsg ? (
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {saveSuccessMsg}
          </div>
        ) : <div />}

        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-6 py-3 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Saving Settings...' : 'Save Branding & Schedule'}
        </button>
      </div>
    </div>
  );
}
