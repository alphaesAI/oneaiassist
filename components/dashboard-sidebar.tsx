'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTenantInfo } from '@/hooks/useTenantInfo';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  roles?: string[]; // If undefined, accessible by all roles
  icon: string; // Material symbol name
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { data: info, isLoading } = useTenantInfo();

  const userRole = info?.role || '';

  const sections: NavSection[] = [
    {
      title: 'MAIN',
      items: [
        {
          name: 'Dashboard',
          href: '/dashboard',
          icon: 'dashboard',
        },
        {
          name: 'Inbox',
          href: '/dashboard/inbox',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
          icon: 'inbox',
        },
        {
          name: 'Leads',
          href: '/dashboard/leads',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
          icon: 'group',
        },
        {
          name: 'Customers',
          href: '/dashboard/customers',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
          icon: 'person',
        },
        {
          name: 'Campaigns',
          href: '/dashboard/campaigns',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
          icon: 'campaign',
        },
        {
          name: 'Sequences',
          href: '/dashboard/sequences',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER'],
          icon: 'schedule',
        },
        {
          name: 'Marketing',
          href: '/dashboard/marketing',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER'],
          icon: 'ads_click',
        },
        {
          name: 'Analytics',
          href: '/dashboard/analytics',
          icon: 'monitoring',
        },
      ],
    },
    {
      title: 'AI & CONTENT',
      items: [
        {
          name: 'AI & Bot',
          href: '/dashboard/ai-bot',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
          icon: 'smart_toy',
        },
        {
          name: 'Knowledge Base',
          href: '/dashboard/knowledge-base',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
          icon: 'book',
        },
        {
          name: 'Templates',
          href: '/dashboard/templates',
          roles: ['PLATFORM_OWNER', 'ADMIN', 'MANAGER', 'AGENT'],
          icon: 'description',
        },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        {
          name: 'Settings',
          href: '/dashboard/settings',
          roles: ['PLATFORM_OWNER', 'ADMIN'],
          icon: 'settings',
        },
        {
          name: 'Superadmin',
          href: '/superadmin',
          roles: ['PLATFORM_OWNER'],
          icon: 'admin_panel_settings',
        },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-[#1B4B91] border-r border-white/10 flex flex-col z-20 shrink-0 font-sans text-white h-screen sticky top-0">
      {/* Brand Logo */}
      <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/OneAILogo.png" alt="OneAIAssist Logo" className="h-8 w-auto object-contain" />
        <span className="font-bold tracking-tight text-white text-lg">
          OneAIAssist
        </span>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-4 py-5 space-y-6 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2.5 px-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-9 w-full bg-white/10 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          sections.map((section) => {
            // Filter section items by user role
            const filteredItems = section.items.filter(
              (item) => !item.roles || item.roles.includes(userRole)
            );

            if (filteredItems.length === 0) return null;

            return (
              <div key={section.title} className="space-y-1.5">
                {/* Section Header */}
                <h5 className="px-4 text-[10px] font-bold text-[#E2E8F0]/40 uppercase tracking-widest text-left">
                  {section.title}
                </h5>

                {/* Section Items */}
                <div className="space-y-1">
                  {filteredItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-[#2563EB] text-white font-semibold shadow-sm'
                            : 'text-[#E2E8F0] hover:text-white hover:bg-white/[0.08]'
                        )}
                      >
                        <span className="material-symbols-outlined text-[20px] shrink-0">
                          {item.icon}
                        </span>
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </nav>

      {/* Bottom Profile / Footer Section */}
      <div className="p-4 border-t border-white/10 text-xs text-[#E2E8F0]/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium text-white/90">System Online</span>
        </div>
        <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">v1.0</span>
      </div>
    </aside>
  );
}
