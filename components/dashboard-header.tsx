'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useTenantInfo } from '@/hooks/useTenantInfo';
import LogoutButton from '@/components/logout-button';
import NotificationBell from '@/components/notification-bell';

export default function DashboardHeader() {
  const pathname = usePathname();
  const { data: info, isLoading } = useTenantInfo();

  // Map route to title
  const getPageTitle = () => {
    if (pathname === '/dashboard') return 'Dashboard Overview';
    const parts = pathname.split('/');
    if (parts.length > 2) {
      const pageName = parts[2];
      return pageName.charAt(0).toUpperCase() + pageName.slice(1).replace('-', ' ');
    }
    return 'Dashboard';
  };

  return (
    <header className="h-16 border-b border-[#c3c6d7] bg-white px-6 flex items-center justify-between z-10 shrink-0 font-sans text-[#1c1b1f]">
      {/* Left: Dynamic Title Slot */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight text-[#1c1b1f]">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right: Usage Meter, Notifications, Profile, Logout */}
      <div className="flex items-center gap-4">
        {/* Usage-Meter Pill (BRD §4.2 spec dummy data) */}
        <div className="hidden sm:flex items-center gap-2 bg-[#f4f3f6] border border-[#c3c6d7] px-3 py-1 rounded-full text-xs font-medium text-[#49454f]">
          <span className="material-symbols-outlined text-[14px] text-[#004ac6]">
            bar_chart
          </span>
          <span>WhatsApp API: <strong>342 / 1,000</strong> msgs</span>
        </div>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User Info & Profile */}
        {isLoading ? (
          <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-[#1c1b1f] font-semibold leading-none">
                {info?.email}
              </p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#004ac6]/10 border border-[#004ac6]/15 text-[#004ac6] uppercase tracking-wider leading-none">
                {info?.role}
              </span>
            </div>
          </div>
        )}

        <LogoutButton />
      </div>
    </header>
  );
}
