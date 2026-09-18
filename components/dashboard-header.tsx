'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useTenantInfo } from '@/hooks/useTenantInfo';
import { useSidebar } from '@/lib/sidebar-context';
import NotificationBell from '@/components/notification-bell';
import { signOut } from 'next-auth/react';
import { 
  Menu, 
  PanelLeftClose, 
  PanelLeft, 
  BarChart2, 
  LogOut,
  User
} from 'lucide-react';

export default function DashboardHeader() {
  const pathname = usePathname();
  const { data: info, isLoading } = useTenantInfo();
  const { setIsMobileOpen, isCollapsed, toggleCollapsed } = useSidebar();

  // Descriptive page titles for professional enterprise look
  const getPageTitle = () => {
    if (pathname === '/dashboard') return 'Dashboard Overview';
    if (pathname.startsWith('/dashboard/inbox')) return 'Unified Multi-Channel Inbox';
    if (pathname.startsWith('/dashboard/leads')) return 'Leads & Pipeline CRM';
    if (pathname.startsWith('/dashboard/customers')) return 'Customer Directory';
    if (pathname.startsWith('/dashboard/campaigns')) return 'Broadcast Campaigns Hub';
    if (pathname.startsWith('/dashboard/sequences')) return 'Automated Sequences & Drips';
    if (pathname.startsWith('/dashboard/marketing')) return 'Marketing & ROI Attribution';
    if (pathname.startsWith('/dashboard/analytics')) return 'Performance Analytics';
    if (pathname.startsWith('/dashboard/ai-bot')) return 'AI Bot & Autonomous Controls';
    if (pathname.startsWith('/dashboard/templates')) return 'Message Templates';
    if (pathname.startsWith('/dashboard/settings')) return 'Enterprise Admin Settings';
    if (pathname.startsWith('/superadmin')) return 'Superadmin Master Console';

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const pageName = parts[1];
      return pageName.charAt(0).toUpperCase() + pageName.slice(1).replace(/-/g, ' ');
    }
    return 'Dashboard';
  };

  const userInitial = info?.email ? info.email.charAt(0).toUpperCase() : 'U';

  return (
    <header className="h-16 border-b border-[#c3c6d7] bg-white px-4 sm:px-6 flex items-center justify-between z-10 shrink-0 font-sans text-[#1c1b1f]">
      {/* Left: Mobile Drawer Trigger + Desktop Rail Toggle + Title */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          className="lg:hidden p-2 rounded-lg text-[#49454f] hover:text-[#1c1b1f] hover:bg-slate-100 transition-colors"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Desktop Sidebar Collapse Toggle */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden lg:flex p-2 rounded-lg text-[#49454f] hover:text-[#1c1b1f] hover:bg-slate-100 transition-colors"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        {/* Page Title */}
        <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#1c1b1f] truncate">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right: Usage Meter, Notifications, User Profile & Sign Out */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {/* Usage-Meter Pill */}
        <div className="hidden md:flex items-center gap-2 bg-[#f4f3f6] border border-[#c3c6d7] px-3 py-1 rounded-full text-xs font-medium text-[#49454f]">
          <BarChart2 className="w-3.5 h-3.5 text-[#004ac6]" />
          <span>WhatsApp API: <strong className="text-[#1c1b1f]">342 / 1,000</strong> msgs</span>
        </div>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User Info & Profile */}
        {isLoading ? (
          <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
        ) : (
          <div className="flex items-center gap-2.5 pl-1">
            {/* User Avatar Circle */}
            <div className="w-8 h-8 rounded-full bg-[#1B4B91] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
              {userInitial}
            </div>

            <div className="hidden sm:block text-right">
              <p className="text-xs text-[#1c1b1f] font-semibold leading-none truncate max-w-[140px]">
                {info?.email || 'User'}
              </p>
              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#004ac6]/10 border border-[#004ac6]/20 text-[#004ac6] uppercase tracking-wider leading-none">
                {info?.role || 'AGENT'}
              </span>
            </div>
          </div>
        )}

        {/* Clean Light-Theme Sign Out Button */}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="px-2.5 sm:px-3 py-1.5 border border-[#c3c6d7] hover:border-rose-300 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors text-[#49454f] hover:text-rose-700 flex items-center gap-1.5"
          title="Sign out of OneAIAssist"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
