import React from 'react';

export default function BillingPage() {
  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
          Billing & Subscriptions
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Review your subscription plan, invoices, and transaction credits.
        </p>
      </div>

      <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[350px]">
        <div className="h-12 w-12 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-400 mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-200">Billing Panel</h3>
        <p className="text-sm text-slate-400 max-w-sm mt-1">
          Manage agency subscriptions, add payment methods, view invoices, and buy WhatsApp API credits.
        </p>
      </div>
    </div>
  );
}
