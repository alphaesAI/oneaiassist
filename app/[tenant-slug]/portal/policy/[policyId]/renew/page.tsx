import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, getTenantPrisma } from '@/lib/db';

export default async function PolicyRenewPage({
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
    select: { id: true },
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
      policyCatalogId: true,
      expiryDate: true,
      policyCatalog: {
        select: { name: true },
      },
    },
  });

  if (!policy) {
    redirect(`/${slug}/portal`);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-md text-center space-y-6">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[36px]">autorenew</span>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Policy Renewal</h2>
          <p className="text-xs text-slate-500 mt-1">
            Renewing policy <span className="font-bold text-slate-800">#{policy.policyNumber}</span> ({policy.policyCatalog?.name || 'Insurance Plan'})
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 leading-relaxed text-left space-y-2">
          <div className="flex items-center gap-2 font-bold text-[#004ac6]">
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span>Online Auto-Renewal Active</span>
          </div>
          <p>
            Your policy is currently set for automatic renewal on{' '}
            <span className="font-semibold">{new Date(policy.expiryDate).toLocaleDateString()}</span>. No further action is required at this time.
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <Link
            href={`/${slug}/checkout?policyId=${policy.policyCatalogId}`}
            className="w-full py-3 bg-[#004ac6] hover:bg-blue-700 text-white font-bold rounded-xl text-xs block shadow"
          >
            Proceed to Immediate Payment Checkout
          </Link>
          <Link
            href={`/${slug}/portal`}
            className="w-full py-2 text-slate-600 font-semibold text-xs block hover:underline"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
