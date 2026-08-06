import React from 'react';
import DashboardSidebar from '@/components/dashboard-sidebar';
import DashboardHeader from '@/components/dashboard-header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#1c1b1f] flex overflow-hidden">
      {/* Dynamic Role-Gated Sidebar */}
      <DashboardSidebar />

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <DashboardHeader />

        {/* Child Page Frame */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
