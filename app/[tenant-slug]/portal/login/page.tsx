'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CustomerPortalLoginPage({
  params,
}: {
  params: { 'tenant-slug': string } | Promise<{ 'tenant-slug': string }>;
}) {
  const tenantSlug = (params as any)['tenant-slug'] || 'pme';
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setErrorMsg('Please enter your phone number.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/portal/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      setStep('OTP');
      setInfoMsg(`Verification code sent! (Dev OTP: ${data.mockOtp || '123456'})`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/portal/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otpCode: otpCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      router.push(`/${tenantSlug}/portal`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-50 text-[#004ac6] rounded-2xl flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[28px]">lock_person</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Customer Self-Service Portal</h2>
          <p className="text-xs text-slate-500">
            Access active insurance policies, documents, coverage details & support.
          </p>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-[#004ac6] text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">info</span>
            <span>{infoMsg}</span>
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Phone Number (WhatsApp)
              </label>
              <input
                type="tel"
                required
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#004ac6] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#004ac6] hover:bg-blue-700 text-white font-bold rounded-xl shadow transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  <span>Sending OTP...</span>
                </>
              ) : (
                <span>Request Verification Code</span>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Enter 6-Digit Code sent to {phone}
              </label>
              <input
                type="text"
                maxLength={6}
                required
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center font-mono text-lg tracking-widest focus:ring-2 focus:ring-[#004ac6] focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('PHONE')}
                className="w-1/3 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50"
              >
                Change Phone
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-2.5 bg-[#004ac6] hover:bg-blue-700 text-white font-bold rounded-xl shadow transition text-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : (
                  <span>Verify & Login</span>
                )}
              </button>
            </div>
          </form>
        )}

        <div className="pt-4 border-t border-slate-100 text-center">
          <Link href={`/${tenantSlug}`} className="text-xs font-medium text-slate-500 hover:text-slate-800">
            Back to Public Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
