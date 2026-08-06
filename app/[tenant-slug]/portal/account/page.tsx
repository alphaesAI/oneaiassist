import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, getTenantPrisma } from '@/lib/db';

export default async function CustomerAccountPage({
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

  const db = getTenantPrisma(tenant.id, 'ADMIN');

  const customer = await db.customer.findFirst({
    where: { id: customerId, tenantId: tenant.id },
  });

  if (!customer) {
    redirect(`/${slug}/portal/login`);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans pb-16">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 sm:px-6">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
          <Link
            href={`/${slug}/portal`}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Dashboard
          </Link>
          <span className="text-xs font-bold text-slate-400">Account & Privacy</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Account & Data Rights</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage your personal profile, export your customer record, or request GDPR data deletion.
          </p>
        </div>

        {/* Profile Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004ac6]">person</span>
            Profile Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Full Name</span>
              <span className="text-sm font-bold text-slate-900">{customer.displayName}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Primary Phone</span>
              <span className="text-sm font-semibold text-slate-800">{customer.primaryPhone}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Email Address</span>
              <span className="text-sm font-semibold text-slate-800">{customer.email || 'Not provided'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Marketing Consent Status</span>
              <span className="inline-block mt-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded">
                {customer.optedIn ? 'Opted In' : 'Opted Out'}
              </span>
            </div>
          </div>
        </div>

        {/* Data Rights & Privacy Controls */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004ac6]">shield_lock</span>
            Privacy & GDPR Data Rights
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Export Card */}
            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#004ac6] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">download</span>
              </div>
              <h4 className="font-bold text-sm text-slate-900">Export Personal Data</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Download a complete copy of your customer profile, active policy contracts, and support conversation logs in JSON format.
              </p>
              <a
                href={`/api/tenant/${slug}/portal/account/export`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#004ac6] hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow"
              >
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                <span>Download My Data (JSON)</span>
              </a>
            </div>

            {/* Anonymize / Delete Card */}
            <div className="bg-rose-50/50 border border-rose-200/70 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">delete_forever</span>
              </div>
              <h4 className="font-bold text-sm text-slate-900">Request Data Deletion</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Anonymize your personal identifiable information (PII) from our active database per GDPR standards.
              </p>
              <form action={`/api/tenant/${slug}/portal/account/delete`} method="POST">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs shadow"
                >
                  <span className="material-symbols-outlined text-[16px]">no_accounts</span>
                  <span>Anonymize & Delete Account</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
