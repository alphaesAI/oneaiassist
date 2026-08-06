import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, getTenantPrisma } from '@/lib/db';

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ 'tenant-slug': string; policyId: string }>;
}) {
  const { 'tenant-slug': slug, policyId } = await params;
  const cookieStore = await cookies();
  const customerId = cookieStore.get('customer_auth_token')?.value;

  if (!customerId) {
    redirect(`/${slug}/portal/login`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!tenant) {
    redirect(`/${slug}/portal/login`);
  }

  const db = getTenantPrisma(tenant.id, 'ADMIN');

  const policy = await db.policy.findFirst({
    where: { id: policyId, customerId, tenantId: tenant.id },
    select: {
      id: true,
      policyNumber: true,
      status: true,
      effectiveDate: true,
      expiryDate: true,
      policyCatalog: {
        select: {
          name: true,
          insurerName: true,
          extractedSummary: true,
          sumInsured: true,
          premiumMin: true,
        },
      },
    },
  });

  if (!policy) {
    redirect(`/${slug}/portal`);
  }

  const item = policy.policyCatalog;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans pb-16">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 sm:px-6">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
          <Link
            href={`/${slug}/portal`}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Dashboard
          </Link>
          <span className="text-xs font-bold text-slate-400">Policy Details</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-[#004ac6] bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded uppercase">
                {item?.insurerName || 'HEALTH'}
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-2">
                {item?.name || 'Health Policy'}
              </h2>
              <span className="text-xs font-mono text-slate-500 block mt-1">
                Policy Reference: {policy.policyNumber}
              </span>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs rounded-full self-start sm:self-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Status: {policy.status}</span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
            {item?.extractedSummary || 'Comprehensive coverage for health and medical expenses.'}
          </p>
        </div>

        {/* Coverage Details Grid */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Coverage & Terms Summary
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">Sum Insured Limit</span>
              <span className="text-xl font-bold text-slate-900">
                ${item?.sumInsured.toLocaleString() || '100,000'}
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">Premium Rate</span>
              <span className="text-xl font-bold text-slate-900">
                ${((item?.premiumMin || 0) / 100).toFixed(2)}/mo
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">Effective Start Date</span>
              <span className="text-sm font-semibold text-slate-800">
                {new Date(policy.effectiveDate).toLocaleDateString()}
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">Expiry / Renewal Date</span>
              <span className="text-sm font-semibold text-slate-800">
                {new Date(policy.expiryDate).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Document Download Section */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
              </div>
              <div>
                <h4 className="font-bold text-xs text-slate-900">Official Policy Schedule PDF</h4>
                <span className="text-[10px] text-slate-400">Signed digital certificate of insurance</span>
              </div>
            </div>

            <button
              type="button"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Download PDF Certificate</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between">
          <Link
            href={`/${slug}/portal`}
            className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
          <Link
            href={`/${slug}/portal/policy/${policy.id}/renew`}
            className="px-5 py-2.5 bg-[#004ac6] hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow"
          >
            Renew Coverage Online
          </Link>
        </div>
      </main>
    </div>
  );
}
