'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ImpersonationBannerProps {
  tenantName: string;
}

export default function ImpersonationBanner({ tenantName }: ImpersonationBannerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStopImpersonation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/superadmin/impersonate', {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/superadmin');
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to clear impersonation:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-500 border border-amber-600 p-4 rounded-xl flex items-center justify-between shadow-sm animate-fade-in text-white">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[24px]">
          admin_panel_settings
        </span>
        <div>
          <h4 className="font-bold text-sm text-white">Active Session Impersonation</h4>
          <p className="text-xs text-white/90 mt-0.5">
            You are currently viewing the workspace as <span className="font-extrabold underline">{tenantName}</span>.
          </p>
        </div>
      </div>
      <button
        onClick={handleStopImpersonation}
        disabled={loading}
        className="bg-white text-amber-700 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-[#f0f3ff] active:scale-95 transition-all shadow-sm flex items-center gap-1 shrink-0"
      >
        <span className="material-symbols-outlined text-sm font-bold">logout</span>
        Stop Impersonation
      </button>
    </div>
  );
}
