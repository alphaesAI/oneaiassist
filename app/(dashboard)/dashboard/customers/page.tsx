'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

interface Customer {
  id: string;
  displayName: string;
  primaryPhone: string;
  email: string | null;
  location: string | null;
  tags: string[];
  optedIn: boolean;
  activePolicy?: {
    id: string;
    policyNumber: string;
    status: string;
  } | null;
}

export default function CustomersIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch list of customers
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/customers');
      if (!res.ok) throw new Error('Failed to load customers');
      return res.json();
    },
  });

  // Filter customers by display name or phone
  const filteredCustomers = customers.filter(
    (c) =>
      c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.primaryPhone.includes(searchQuery)
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f9f9ff] overflow-y-auto">
      {/* Header bar matching Stitch design */}
      <header className="sticky top-0 z-20 bg-white border-b border-[#c3c6d7] h-16 flex items-center justify-between px-8 shrink-0 shadow-sm">
        <h2 className="text-[18px] font-bold tracking-tight text-[#1c1b1f]">
          Customers Directory
        </h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
              search
            </span>
            <input
              id="customer-search"
              name="customerSearch"
              aria-label="Search customers"
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-[#c3c6d7] rounded-xl pl-9 pr-4 py-2 text-xs text-[#1c1b1f] focus:outline-none focus:border-[#004ac6] w-64 font-semibold"
            />
          </div>
        </div>
      </header>

      {/* Main card list container */}
      <main className="flex-1 p-8 max-w-[1200px] w-full mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-[#c3c6d7] overflow-hidden shadow-sm">
          <div className="p-5 border-b border-[#c3c6d7] flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-xs text-[#1c1b1f] uppercase tracking-wider">
              All Contacts ({filteredCustomers.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
                Loading customers...
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No customers found matching "{searchQuery}"
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-[#c3c6d7]">
                    <th className="px-6 py-3.5 font-bold text-[#49454f] uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3.5 font-bold text-[#49454f] uppercase tracking-wider">Phone / Identifier</th>
                    <th className="px-6 py-3.5 font-bold text-[#49454f] uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3.5 font-bold text-[#49454f] uppercase tracking-wider">Tags</th>
                    <th className="px-6 py-3.5 font-bold text-[#49454f] uppercase tracking-wider">Active Policy</th>
                    <th className="px-6 py-3.5 font-bold text-[#49454f] uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c3c6d7]/60">
                  {filteredCustomers.map((customer) => {
                    const initials = customer.displayName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#004ac6]/10 text-[#004ac6] flex items-center justify-center font-bold text-xs shrink-0">
                              {initials}
                            </div>
                            <div>
                              <Link
                                href={`/dashboard/customers/${customer.id}`}
                                className="font-bold text-xs text-[#004ac6] hover:underline"
                              >
                                {customer.displayName}
                              </Link>
                              <div className="text-[10px] text-slate-500 font-medium">
                                {customer.email || 'No email registered'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-[#1c1b1f]">
                          {customer.primaryPhone}
                          <div className="text-[9px] text-[#737686] flex items-center gap-1 mt-0.5 font-bold">
                            <span className={`w-1.5 h-1.5 rounded-full ${customer.optedIn ? 'bg-green-500' : 'bg-slate-400'}`} />
                            {customer.optedIn ? 'Opted In' : 'No Consent'}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-[#49454f]">
                          {customer.location || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {customer.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-[9px] font-bold text-[#49454f]"
                              >
                                {tag}
                              </span>
                            ))}
                            {customer.tags.length === 0 && <span className="text-slate-400">—</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {customer.activePolicy ? (
                            <div>
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                {customer.activePolicy.policyNumber}
                              </span>
                              <div className="text-[9px] text-slate-500 font-semibold mt-0.5">
                                Status: {customer.activePolicy.status}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-medium">No Active Policy</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/dashboard/customers/${customer.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#004ac6] hover:bg-[#003ca0] text-white rounded-xl text-[10px] font-bold shadow-sm transition-all"
                          >
                            <span className="material-symbols-outlined text-[14px]">visibility</span>
                            View Profile
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
