'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface PolicyCatalogItem {
  id: string;
  name: string;
  policyId: string;
  insurerName: string;
  extractedSummary: string;
  premiumMin: number;
  premiumMax: number;
  sumInsured: number;
}

export default function CheckoutPage({
  params,
  searchParams,
}: {
  params: { 'tenant-slug': string } | Promise<{ 'tenant-slug': string }>;
  searchParams?: { policyId?: string } | Promise<{ policyId?: string }>;
}) {
  const resolvedParams = React.useMemo(() => {
    if (params && typeof (params as any).then === 'function') {
      return (params as any);
    }
    return params;
  }, [params]);

  const tenantSlug = (resolvedParams as any)['tenant-slug'] || 'pme';
  
  const initialPolicyId = React.useMemo(() => {
    if (searchParams && typeof (searchParams as any).then === 'function') {
      return undefined;
    }
    return (searchParams as any)?.policyId;
  }, [searchParams]);

  const [policies, setPolicies] = useState<PolicyCatalogItem[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(initialPolicyId || '');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploaded, setDocUploaded] = useState(false);

  // Result State
  const [orderResult, setOrderResult] = useState<{
    policyNumber: string;
    policyName: string;
    amountPaid: string;
    effectiveDate: string;
    expiryDate: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchPolicies() {
      try {
        const res = await fetch(`/api/tenant/${tenantSlug}/products`);
        if (res.ok) {
          const data = await res.json();
          setPolicies(data.products || []);
          if (!selectedPolicyId && data.products?.length > 0) {
            setSelectedPolicyId(data.products[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load catalog:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchPolicies();
  }, [tenantSlug, selectedPolicyId]);

  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setDocFile(e.target.files[0]);
      setDocUploaded(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicyId) {
      setErrorMsg('Please select a policy catalog item.');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setErrorMsg('Full Name and Phone Number are required.');
      return;
    }
    if (!agreeTerms) {
      setErrorMsg('You must agree to the Terms of Service & Privacy Policy.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/checkout/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyCatalogId: selectedPolicyId,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim(),
          documentUrl: docUploaded ? `https://r2.oneaiassist.internal/docs/${docFile?.name || 'identity.pdf'}` : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Payment failed');
      }

      setOrderResult({
        policyNumber: data.policyNumber,
        policyName: data.policyName,
        amountPaid: data.amountPaid,
        effectiveDate: data.effectiveDate,
        expiryDate: data.expiryDate,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred during checkout');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-600">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          <span>Loading policy details...</span>
        </div>
      </div>
    );
  }

  if (orderResult) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-lg text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[36px]">check_circle</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900">Payment Successful!</h2>
            <p className="text-sm text-slate-500 mt-1">
              Your insurance policy is now active and confirmed.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Policy Number:</span>
              <span className="font-bold text-slate-900">{orderResult.policyNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Policy Name:</span>
              <span className="font-bold text-slate-900">{orderResult.policyName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Amount Paid:</span>
              <span className="font-bold text-emerald-600">${orderResult.amountPaid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Effective Date:</span>
              <span className="text-slate-700">{new Date(orderResult.effectiveDate).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Expiry Date:</span>
              <span className="text-slate-700">{new Date(orderResult.expiryDate).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="pt-2 space-y-3">
            <Link
              href={`/${tenantSlug}/portal`}
              className="w-full py-3 px-4 bg-[#004ac6] text-white font-semibold rounded-xl block shadow hover:bg-blue-700 transition text-sm"
            >
              Go to Customer Portal
            </Link>
            <Link
              href={`/${tenantSlug}`}
              className="w-full py-2.5 px-4 text-slate-600 font-medium block hover:text-slate-900 text-xs"
            >
              Back to Home Page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Secure Policy Checkout</h1>
            <p className="text-sm text-slate-500 mt-1">
              Complete your payment to activate instant health coverage.
            </p>
          </div>
          <Link
            href={`/${tenantSlug}/quote`}
            className="text-xs font-semibold text-[#004ac6] hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Change Quote
          </Link>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Order Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
            {/* Section 1: Customer Info */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-[#004ac6] text-xs flex items-center justify-center font-bold">1</span>
                Policyholder Details
              </h3>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block font-semibold text-slate-700 text-xs mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#004ac6] focus:outline-none text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 text-xs mb-1">Phone Number (WhatsApp) *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+1 (555) 000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#004ac6] focus:outline-none text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 text-xs mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="jane@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#004ac6] focus:outline-none text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Document Verification */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-[#004ac6] text-xs flex items-center justify-center font-bold">2</span>
                Identity Document Verification (Optional)
              </h3>
              <p className="text-xs text-slate-500">
                Upload your government-issued ID or medical history declaration to expedite claim processing.
              </p>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50/50 transition">
                <input
                  type="file"
                  id="doc-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.jpg,.png"
                />
                <label htmlFor="doc-upload" className="cursor-pointer space-y-1 block">
                  <span className="material-symbols-outlined text-[28px] text-slate-400">upload_file</span>
                  <span className="block text-xs font-semibold text-[#004ac6]">
                    {docUploaded ? `Selected: ${docFile?.name}` : 'Click to select ID document or Drag & Drop'}
                  </span>
                  <span className="block text-[10px] text-slate-400">PDF, PNG, JPG up to 10MB</span>
                </label>
              </div>

              {docUploaded && (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>Document encrypted & ready for secure Cloudflare R2 upload</span>
                </div>
              )}
            </div>

            {/* Section 3: Payment Method */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-[#004ac6] text-xs flex items-center justify-center font-bold">3</span>
                Payment Information
              </h3>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block font-semibold text-slate-700 text-xs mb-1">Card Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-[#004ac6] focus:outline-none"
                    />
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 text-[18px]">credit_card</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 text-xs mb-1">Expiration</label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-[#004ac6] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 text-xs mb-1">CVC / CWW</label>
                    <input
                      type="text"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-[#004ac6] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#004ac6] focus:ring-[#004ac6]"
                  />
                  <label htmlFor="terms" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                    I agree to the <span className="underline font-medium text-slate-900">Terms of Service</span>, <span className="underline font-medium text-slate-900">Privacy Policy</span>, and authorize recurring monthly premium processing.
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 px-6 bg-[#004ac6] hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 text-base transition disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  <span>Processing Payment...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">lock</span>
                  <span>Pay ${(selectedPolicy ? selectedPolicy.premiumMin / 100 : 0).toFixed(2)} & Activate Policy</span>
                </>
              )}
            </button>
          </form>

          {/* Policy Order Summary */}
          <div className="lg:col-span-5 space-y-6 sticky top-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                Order Summary
              </h3>

              {/* Policy Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Select Policy Plan</label>
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#004ac6]"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${(p.premiumMin / 100).toFixed(2)}/mo)
                    </option>
                  ))}
                </select>
              </div>

              {selectedPolicy ? (
                <div className="space-y-4 pt-2">
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#004ac6] bg-blue-100 px-2 py-0.5 rounded">
                      {selectedPolicy.insurerName || 'HEALTH'}
                    </span>
                    <h4 className="text-base font-bold text-slate-900">{selectedPolicy.name}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{selectedPolicy.extractedSummary}</p>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Coverage Sum Insured:</span>
                      <span className="font-bold text-slate-900">${(selectedPolicy.sumInsured / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Effective Date:</span>
                      <span className="font-semibold text-slate-700">Immediate Today</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Billing Term:</span>
                      <span className="font-semibold text-slate-700">Monthly Auto-Renew</span>
                    </div>
                    <div className="flex justify-between py-2 text-sm font-bold border-t border-slate-200">
                      <span className="text-slate-900">Total Due Today:</span>
                      <span className="text-[#004ac6]">${(selectedPolicy.premiumMin / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No policy selected.</p>
              )}

              <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5 justify-center">
                <span className="material-symbols-outlined text-[14px]">shield</span>
                <span>256-Bit SSL Encrypted & PCI-DSS Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
