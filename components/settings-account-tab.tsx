'use client';

import React, { useState } from 'react';
import { 
  CreditCard, 
  Sparkles, 
  CheckCircle2, 
  Receipt, 
  ShieldCheck, 
  Plus, 
  Zap 
} from 'lucide-react';

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: 'PAID' | 'PENDING';
}

export default function SettingsAccountTab() {
  const [plan, setPlan] = useState<'GROWTH' | 'ENTERPRISE'>('GROWTH');
  
  const invoices: Invoice[] = [
    { id: 'INV-0284', date: 'Aug 01, 2026', amount: '$49.00', status: 'PAID' },
    { id: 'INV-0193', date: 'Jul 01, 2026', amount: '$49.00', status: 'PAID' },
    { id: 'INV-0082', date: 'Jun 01, 2026', amount: '$49.00', status: 'PAID' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Plan Overview & Upgrade (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Plan Card */}
          <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-[#1c1b1f]">Active Subscription</h3>
                <p className="text-xs text-gray-500 mt-0.5">Manage your pricing plans and billing cycles.</p>
              </div>
              <span className="px-3.5 py-1 bg-blue-100 text-[#004ac6] text-xs font-bold rounded-full">
                {plan} PLAN
              </span>
            </div>

            <div className="flex items-center gap-4 py-2">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-[#004ac6] shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#1c1b1f]">$49.00 / month</h4>
                <p className="text-xs text-gray-500">Your next billing cycle renews on September 01, 2026.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPlan('ENTERPRISE')}
                className="px-4 py-2 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md transition"
              >
                Upgrade to Enterprise
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-[#1c1b1f] text-xs font-bold rounded-xl transition"
              >
                Cancel Subscription
              </button>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1c1b1f]">Payment Methods</h3>
                <p className="text-xs text-gray-500 mt-0.5">Manage your linked credit cards.</p>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-[#1c1b1f] text-xs font-semibold rounded-lg border border-gray-300 transition">
                <Plus className="w-3.5 h-3.5" />
                <span>Add Card</span>
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-slate-500" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Visa ending in 4242</h4>
                  <p className="text-[10px] text-gray-500">Expires 12/28 • Default Payment Method</p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Invoice Roster (Right 1 col) */}
        <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4 text-left h-fit">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Receipt className="w-5 h-5 text-[#004ac6]" />
            <h3 className="text-base font-bold text-[#1c1b1f]">Invoices</h3>
          </div>

          <div className="space-y-3 divide-y divide-[#c3c6d7]/35">
            {invoices.map((inv, idx) => (
              <div key={inv.id} className={`flex justify-between items-center ${idx > 0 ? 'pt-3' : ''}`}>
                <div>
                  <h4 className="text-xs font-bold text-[#1c1b1f]">{inv.id}</h4>
                  <span className="text-[10px] text-gray-500 block">{inv.date}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-[#1c1b1f] block">{inv.amount}</span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-extrabold rounded-full">
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
}
