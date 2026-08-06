import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, getTenantPrisma } from '@/lib/db';

export default async function CustomerPortalDashboardPage({
  params,
}: {
  params: Promise<{ 'tenant-slug': string }>;
}) {
  const { 'tenant-slug': slug } = await params;
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

  const tenantId = tenant.id;
  const db = getTenantPrisma(tenantId, 'ADMIN');

  const customer = await db.customer.findFirst({
    where: { id: customerId, tenantId },
    select: {
      id: true,
      displayName: true,
      primaryPhone: true,
      policies: {
        select: {
          id: true,
          policyNumber: true,
          status: true,
          effectiveDate: true,
          expiryDate: true,
          policyCatalogId: true,
          policyCatalog: {
            select: {
              name: true,
              insurerName: true,
              sumInsured: true,
              premiumMin: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) {
    redirect(`/${slug}/portal/login`);
  }

  const policies = customer.policies || [];
  const activePolicies = policies.filter((p) => p.status === 'ACTIVE');

  // Compute metrics
  let totalCoverage = 0;
  let totalSpentCents = 0;

  policies.forEach((p) => {
    if (p.policyCatalog) {
      totalCoverage += p.policyCatalog.sumInsured || 0;
      totalSpentCents += p.policyCatalog.premiumMin || 0;
    }
  });

  const getDaysUntilExpiry = (expiryDate: Date) => {
    const diffMs = new Date(expiryDate).getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans pb-16">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#004ac6] text-white flex items-center justify-center font-bold text-base">
              {tenant.name.charAt(0)}
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-sm">{tenant.name} Customer Portal</h1>
              <span className="text-[10px] text-slate-500 block">Self-Service & Policy Dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/${slug}/portal/account`}
              className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">account_circle</span>
              <span>{customer.displayName || customer.primaryPhone}</span>
            </Link>
            <Link
              href={`/${slug}/portal/login`}
              className="text-xs text-rose-600 hover:underline font-medium"
            >
              Logout
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Welcome & Overview */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {customer.displayName || 'Valued Customer'}!
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Here is your insurance coverage summary and active policy status.
          </p>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Card 1: Active Policies */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Policies</span>
              <h3 className="text-3xl font-extrabold text-slate-900">{activePolicies.length}</h3>
              <span className="text-[11px] text-emerald-600 font-semibold">Fully covered</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#004ac6] flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">verified_user</span>
            </div>
          </div>

          {/* Card 2: Total Sum Insured Coverage */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Coverage</span>
              <h3 className="text-3xl font-extrabold text-slate-900">${totalCoverage.toLocaleString()}</h3>
              <span className="text-[11px] text-slate-500 font-medium">Sum Insured Limit</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">shield</span>
            </div>
          </div>

          {/* Card 3: Total Premium Investment */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Premium Paid</span>
              <h3 className="text-3xl font-extrabold text-slate-900">${(totalSpentCents / 100).toFixed(2)}</h3>
              <span className="text-[11px] text-slate-500 font-medium">Historical premiums</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">payments</span>
            </div>
          </div>
        </div>

        {/* Section: Your Insurance Policies */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Your Insurance Policies</h3>
            <Link
              href={`/${slug}/quote`}
              className="text-xs font-bold text-[#004ac6] hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>Get New Policy Quote</span>
            </Link>
          </div>

          {policies.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <span className="material-symbols-outlined text-[36px] text-slate-300">folder_off</span>
              <h4 className="font-bold text-slate-700 text-sm">No Policies Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                You do not have any active insurance policies yet. Browse our policy catalog to protect your health and family today.
              </p>
              <Link
                href={`/${slug}/quote`}
                className="inline-block mt-2 px-4 py-2 bg-[#004ac6] text-white font-semibold rounded-xl text-xs shadow hover:bg-blue-700"
              >
                Browse Plans & Get Quote
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {policies.map((p) => {
                const daysLeft = getDaysUntilExpiry(p.expiryDate);
                const isRenewalWindow = daysLeft <= 30;

                return (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-[#004ac6] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded uppercase">
                            {p.policyCatalog?.insurerName || 'HEALTH'}
                          </span>
                          <h4 className="text-base font-bold text-slate-900 mt-1.5">
                            {p.policyCatalog?.name || 'Health Insurance Plan'}
                          </h4>
                          <span className="text-xs font-mono text-slate-500">Policy #{p.policyNumber}</span>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.status}
                        </span>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block">Coverage Sum Insured</span>
                          <span className="font-bold text-slate-900">
                            ${p.policyCatalog?.sumInsured.toLocaleString() || '100,000'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Expiry Date</span>
                          <span className="font-semibold text-slate-700">
                            {new Date(p.expiryDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-3">
                      <Link
                        href={`/${slug}/portal/policy/${p.id}`}
                        className="text-xs font-bold text-[#004ac6] hover:underline flex items-center gap-1"
                      >
                        <span>View Details & Docs</span>
                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                      </Link>

                      {isRenewalWindow && (
                        <Link
                          href={`/${slug}/portal/policy/${p.id}/renew`}
                          className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs shadow"
                        >
                          Renew Policy ({daysLeft} days left)
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section: Support & Quick Actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#004ac6]">support_agent</span>
              Need Help or Have Questions?
            </h3>
            <p className="text-xs text-slate-500">
              Chat directly with our AI assistant or request assistance from an insurance agent.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Link
              href={`/${slug}/chat`}
              className="w-full md:w-auto px-5 py-2.5 bg-[#004ac6] hover:bg-blue-700 text-white font-semibold rounded-xl text-xs text-center shadow"
            >
              Open Live Assistant Chat
            </Link>
            <Link
              href={`/${slug}/portal/account`}
              className="w-full md:w-auto px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs text-center hover:bg-slate-50"
            >
              Account & Privacy
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
