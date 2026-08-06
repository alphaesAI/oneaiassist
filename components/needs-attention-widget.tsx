'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, UserX, MessageSquare, ArrowRight, ShieldAlert } from 'lucide-react';

interface AttentionItem {
  id: string;
  type: 'UNASSIGNED' | 'ESCALATION' | 'FAILED_BROADCAST';
  title: string;
  subtitle: string;
  timeAgo: string;
  href: string;
}

interface NeedsAttentionWidgetProps {
  items?: AttentionItem[];
}

export default function NeedsAttentionWidget({ items }: NeedsAttentionWidgetProps) {
  const defaultItems: AttentionItem[] = [
    {
      id: 'att-1',
      type: 'UNASSIGNED',
      title: 'Unassigned High-Intent Lead',
      subtitle: 'Marcus Thorne requested Apex Family Gold quote',
      timeAgo: '12m ago',
      href: '/dashboard/inbox',
    },
    {
      id: 'att-2',
      type: 'ESCALATION',
      title: 'Bot Escalation Requested',
      subtitle: 'Complex Medicare Out-of-State Dental inquiry',
      timeAgo: '45m ago',
      href: '/dashboard/inbox',
    },
    {
      id: 'att-3',
      type: 'FAILED_BROADCAST',
      title: 'Marketing Compliance Review',
      subtitle: 'Q3 Individual Health Promo needs compliance audit',
      timeAgo: '2h ago',
      href: '/dashboard/marketing',
    },
  ];

  const displayItems = items && items.length > 0 ? items : defaultItems;

  return (
    <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-[#1c1b1f]">Needs Attention</h3>
        </div>
        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
          {displayItems.length} Pending
        </span>
      </div>

      <div className="space-y-3">
        {displayItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-start justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/60 transition group"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-[#004ac6] shrink-0 mt-0.5">
                {item.type === 'UNASSIGNED' && <UserX className="w-3.5 h-3.5 text-blue-600" />}
                {item.type === 'ESCALATION' && <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                {item.type === 'FAILED_BROADCAST' && <MessageSquare className="w-3.5 h-3.5 text-purple-600" />}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#1c1b1f] group-hover:text-[#004ac6] transition truncate">
                  {item.title}
                </h4>
                <p className="text-[11px] text-[#49454f] truncate">{item.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-gray-400 shrink-0 ml-2">
              <span>{item.timeAgo}</span>
              <ArrowRight className="w-3 h-3 text-gray-400 group-hover:text-[#004ac6] group-hover:translate-x-0.5 transition-all" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
