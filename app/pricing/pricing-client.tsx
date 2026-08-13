'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { pricingPlans, addOns, faqs } from '@/config/pricing';

interface PricingClientProps {
  session: {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      role?: string;
      tenantId?: string | null;
    };
  } | null;
  dbConnected: boolean;
  dbError: string | null;
}

export default function PricingClient({ session, dbConnected, dbError }: PricingClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  
  // Sales inquiry modal state
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [salesName, setSalesName] = useState('');
  const [salesEmail, setSalesEmail] = useState('');
  const [salesCompany, setSalesCompany] = useState('');
  const [salesPhone, setSalesPhone] = useState('');
  const [salesMessage, setSalesMessage] = useState('');
  const [salesSubmitted, setSalesSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const handleSalesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesName || !salesEmail || !salesCompany) return;
    
    setSubmitting(true);
    // Simulate API request delay
    setTimeout(() => {
      setSubmitting(false);
      setSalesSubmitted(true);
    }, 800);
  };

  const resetSalesModal = () => {
    setSalesModalOpen(false);
    setSalesName('');
    setSalesEmail('');
    setSalesCompany('');
    setSalesPhone('');
    setSalesMessage('');
    setSalesSubmitted(false);
  };

  return (
    <div className="bg-background text-on-surface selection:bg-primary-fixed min-h-screen flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-surface shadow-sm sticky top-0 z-50 h-16 w-full border-b border-outline-variant/30">
        <div className="flex justify-between items-center px-margin-desktop w-full max-w-[1440px] mx-auto h-full">
          <div className="flex items-center gap-xl">
            <Link href="/" className="text-headline-md font-extrabold text-primary tracking-tight">
              OneAIAssist
            </Link>
            <nav className="hidden md:flex items-center gap-lg">
              {session ? (
                <>
                  <Link href="/dashboard" className="text-on-surface-variant hover:text-primary transition-colors font-body-md">
                    Dashboard
                  </Link>
                  <Link href="/dashboard/ai-bot" className="text-on-surface-variant hover:text-primary transition-colors font-body-md">
                    Agents
                  </Link>
                  <Link href="/dashboard/leads" className="text-on-surface-variant hover:text-primary transition-colors font-body-md">
                    Contacts
                  </Link>
                  <Link href="/dashboard/analytics" className="text-on-surface-variant hover:text-primary transition-colors font-body-md">
                    Analytics
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/#features" className="text-on-surface-variant hover:text-primary transition-colors font-body-md">
                    Features
                  </Link>
                  <Link href="/pricing" className="text-primary border-b-2 border-primary pb-1 font-body-md transition-all duration-200">
                    Pricing
                  </Link>
                  <Link href="/#solutions" className="text-on-surface-variant hover:text-primary transition-colors font-body-md">
                    Solutions
                  </Link>
                  <Link href="/#testimonials" className="text-on-surface-variant hover:text-primary transition-colors font-body-md">
                    Testimonials
                  </Link>
                </>
              )}
            </nav>
          </div>
          
          <div className="flex items-center gap-md">
            {session ? (
              <div className="flex items-center gap-md">
                <Link href="/dashboard" className="hidden sm:inline-flex items-center justify-center bg-primary hover:bg-[#003ea8] text-white px-md py-2 rounded-lg font-label-md transition-all">
                  Go to Dashboard
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="text-on-surface-variant hover:text-error transition-colors font-label-md"
                >
                  Logout
                </button>
                <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant/60">
                  <img 
                    className="w-full h-full object-cover" 
                    alt="Profile Avatar" 
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBnuEbOsCbwFcvVO8wlC-lv1sQwYlUN-uIYERrbmpqZvvw8MNw6GgIfzOg6Byt3GZlR85_xJYobrqkS1c7YpZrYzqCI8hT141z5oxXqCfFeNAtHcyCWAsObziJ24FPNKzbKRng4ipnV7GoSBFB2fXHJWUxaabbr_weM6ue7xgfDeiL0xa8DkY3VmeP4CHgLBrgJdd6H6eV4WaFsOlMMRtinbCocBOzHe7I4q9n57ZDx3dsQdEgTcmeBUbADYvVxnHcJk4O0nUXK94U1" 
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-sm">
                <Link href="/login" className="text-on-surface hover:text-primary px-4 py-2 font-label-md transition-colors">
                  Login
                </Link>
                <Link href="/signup" className="bg-primary hover:bg-[#003ea8] text-white px-md py-2 rounded-lg font-label-md transition-all shadow-sm">
                  Sign Up
                </Link>
              </div>
            )}
            
            {/* Mobile menu toggle */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1 text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined">
                {mobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-surface border-b border-outline-variant/40 px-margin-mobile py-4 flex flex-col gap-sm shadow-md animate-in slide-in-from-top">
            {session ? (
              <>
                <Link href="/dashboard" className="text-on-surface px-2 py-1 font-body-md">Dashboard</Link>
                <Link href="/dashboard/ai-bot" className="text-on-surface px-2 py-1 font-body-md">Agents</Link>
                <Link href="/dashboard/leads" className="text-on-surface px-2 py-1 font-body-md">Contacts</Link>
                <Link href="/dashboard/analytics" className="text-on-surface px-2 py-1 font-body-md">Analytics</Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="text-error text-left px-2 py-1 font-body-md"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/#features" className="text-on-surface px-2 py-1 font-body-md">Features</Link>
                <Link href="/pricing" className="text-primary px-2 py-1 font-body-md font-bold">Pricing</Link>
                <Link href="/#solutions" className="text-on-surface px-2 py-1 font-body-md">Solutions</Link>
                <Link href="/#testimonials" className="text-on-surface px-2 py-1 font-body-md">Testimonials</Link>
                <hr className="border-outline-variant/30 my-1" />
                <Link href="/login" className="text-on-surface px-2 py-1 font-body-md">Login</Link>
                <Link href="/signup" className="text-primary px-2 py-1 font-body-md font-bold">Sign Up</Link>
              </>
            )}
          </div>
        )}
      </header>

      <main className="max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop py-16 flex-1 w-full">
        {/* Header Section */}
        <section className="text-center mb-16">
          <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface mb-6">
            Simple, transparent pricing
          </h1>
          <p className="text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-10">
            Choose the perfect plan for your business needs. Scale up as your conversations grow.
          </p>
          
          {/* Toggle Switch */}
          <div className="flex items-center justify-center gap-4">
            <span className={cn("font-label-md transition-colors", !isAnnual ? "text-primary font-bold" : "text-on-surface-variant")}>
              Monthly
            </span>
            <button 
              className="relative w-14 h-7 bg-surface-container-highest rounded-full p-1 transition-colors focus:outline-none ring-2 ring-transparent focus:ring-primary/20" 
              id="billing-toggle" 
              onClick={() => setIsAnnual(!isAnnual)}
            >
              <div 
                className={cn(
                  "w-5 h-5 bg-primary rounded-full transition-transform duration-200 shadow-sm",
                  isAnnual ? "translate-x-7" : "translate-x-0"
                )} 
              />
            </button>
            <span className={cn("font-label-md transition-colors", isAnnual ? "text-primary font-bold" : "text-on-surface-variant")}>
              Annual
            </span>
            <span className="bg-tertiary-container text-on-tertiary-container text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
              Save 20%
            </span>
          </div>
        </section>

        {/* Pricing Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-24 items-stretch">
          {pricingPlans.map((plan) => {
            const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
            const isEnterprise = plan.customPrice;

            return (
              <div 
                key={plan.id}
                className={cn(
                  "bg-surface-container-lowest border rounded-xl p-8 flex flex-col h-full transition-all relative",
                  plan.isPopular 
                    ? "border-2 border-primary shadow-lg md:scale-105 z-10" 
                    : "border-outline-variant shadow-sm hover:shadow-md"
                )}
              >
                {plan.isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-on-primary text-[11px] font-bold px-4 py-1 rounded-full uppercase tracking-widest shadow-sm">
                    Most Popular
                  </div>
                )}

                <div className="mb-8">
                  <h3 className="font-headline-md text-on-surface mb-2">{plan.name}</h3>
                  
                  {isEnterprise ? (
                    <div className="flex items-baseline gap-1 mb-4 h-12">
                      <span className="text-headline-lg font-bold text-on-surface">Custom</span>
                    </div>
                  ) : (
                    <div className="flex flex-col mb-4 h-12 justify-center">
                      <div className="flex items-baseline gap-1">
                        <span className="text-headline-lg font-bold text-on-surface">$</span>
                        <span className="text-headline-lg font-bold text-on-surface">{price}</span>
                        <span className="text-on-surface-variant font-body-md">/mo</span>
                      </div>
                      {isAnnual && (
                        <span className="text-[10px] text-tertiary font-bold">
                          Billed annually (${price * 12}/yr)
                        </span>
                      )}
                    </div>
                  )}
                  
                  <p className="text-body-sm text-on-surface-variant mt-2">{plan.description}</p>
                </div>

                <ul className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-3 text-body-md text-on-surface-variant">
                      <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">
                        check_circle
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isEnterprise ? (
                  <button 
                    onClick={() => setSalesModalOpen(true)}
                    className="w-full py-3 px-6 rounded-lg border-2 border-on-surface text-on-surface font-label-md hover:bg-surface-variant transition-colors active:scale-95 duration-100"
                  >
                    {plan.ctaText}
                  </button>
                ) : (
                  <Link 
                    href={plan.ctaLink}
                    className={cn(
                      "w-full py-3 px-6 rounded-lg font-label-md transition-all active:scale-95 text-center block",
                      plan.isPopular
                        ? "bg-primary text-on-primary hover:bg-[#003ea8] shadow-md"
                        : "border-2 border-primary text-primary hover:bg-primary-fixed"
                    )}
                  >
                    {plan.ctaText}
                  </Link>
                )}
              </div>
            );
          })}
        </section>

        {/* Add-ons Section */}
        <section className="mb-32">
          <h2 className="font-headline-lg text-center mb-12 text-on-surface">Powerful Add-ons</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {addOns.map((addon) => (
              <div 
                key={addon.id}
                className="bg-surface-container-low p-6 rounded-lg border border-outline-variant text-center group hover:border-primary transition-colors flex flex-col justify-between"
              >
                <div>
                  <span className="material-symbols-outlined text-primary text-3xl mb-4 block">
                    {addon.icon}
                  </span>
                  <h4 className="font-headline-sm font-semibold mb-2 text-on-surface">{addon.name}</h4>
                  <p className="text-body-sm text-on-surface-variant mb-4">{addon.description}</p>
                </div>
                <div>
                  <p className="font-bold text-primary text-body-lg">{addon.price}</p>
                  <button
                    onClick={() => setSalesModalOpen(true)}
                    className="mt-3 text-xs text-primary font-bold hover:underline"
                  >
                    Inquire add-on
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto mb-24">
          <h2 className="font-headline-lg text-center mb-12 text-on-surface">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className="border border-outline-variant rounded-lg overflow-hidden bg-white">
                  <button 
                    className="w-full flex items-center justify-between p-6 bg-white hover:bg-slate-50 transition-colors text-left focus:outline-none" 
                    onClick={() => toggleFaq(idx)}
                  >
                    <span className="font-body-lg font-semibold text-on-surface">{faq.question}</span>
                    <span className={cn("material-symbols-outlined transition-transform duration-250", isOpen && "rotate-180")}>
                      expand_more
                    </span>
                  </button>
                  <div 
                    className={cn(
                      "transition-all duration-300 ease-in-out overflow-hidden bg-white",
                      isOpen ? "max-h-40 border-t border-outline-variant/30" : "max-h-0"
                    )}
                  >
                    <p className="p-6 text-on-surface-variant text-body-md">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-lowest border-t border-outline-variant py-12">
        <div className="max-w-[1440px] mx-auto px-margin-desktop flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start">
            <span className="text-headline-sm font-bold text-primary mb-2">OneAIAssist</span>
            <p className="text-label-sm text-on-surface-variant">© 2024 OneAIAssist. HIPAA Compliant &amp; SOC2 Certified.</p>
          </div>
          <div className="flex items-center gap-lg flex-wrap justify-center">
            {/* Database status widget in footer */}
            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant/30" title={dbError || undefined}>
              <span className="relative flex h-2 w-2">
                {dbConnected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </>
                )}
              </span>
              <span className="text-[10px] text-on-surface-variant font-mono">
                {dbConnected ? 'Neon Connected' : 'Neon Error'}
              </span>
            </div>
            
            <Link className="text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</Link>
            <Link className="text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms of Service</Link>
            <Link className="text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Security</Link>
            <Link className="text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Compliance</Link>
          </div>
        </div>
      </footer>

      {/* Sales Inquiry Modal Dialog */}
      {salesModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#c3c6d7] rounded-xl p-8 max-w-md w-full shadow-2xl relative text-left animate-slide-up">
            <button 
              onClick={resetSalesModal}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-primary"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>

            {salesSubmitted ? (
              <div className="text-center py-8 space-y-4">
                <div className="h-16 w-16 bg-[#004ac6]/10 text-[#004ac6] rounded-full flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[36px]">mark_email_read</span>
                </div>
                <h3 className="font-headline-md text-on-surface font-bold">Request Received!</h3>
                <p className="text-body-md text-on-surface-variant">
                  Thank you, <span className="font-semibold">{salesName}</span>. We&apos;ve registered your interest for <span className="font-semibold">{salesCompany}</span>.
                </p>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Our agency success team will contact you at <span className="font-semibold">{salesEmail}</span> within 24 hours to schedule a custom demonstration.
                </p>
                <button
                  onClick={resetSalesModal}
                  className="mt-6 w-full py-3 bg-[#004ac6] hover:bg-[#003ea8] text-white font-bold rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSalesSubmit} className="space-y-4">
                <div>
                  <h3 className="text-headline-md font-bold text-on-surface">Talk to Agency Sales</h3>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Automate your client onboarding. Enter your details below and we will prepare a customized pilot proposal.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#434655] uppercase tracking-wider block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Marcus Thorne"
                    value={salesName}
                    onChange={(e) => setSalesName(e.target.value)}
                    className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-2 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#434655] uppercase tracking-wider block">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="marcus@agency.com"
                    value={salesEmail}
                    onChange={(e) => setSalesEmail(e.target.value)}
                    className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-2 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#434655] uppercase tracking-wider block">
                      Agency Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Thorne Insurance"
                      value={salesCompany}
                      onChange={(e) => setSalesCompany(e.target.value)}
                      className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-2 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#434655] uppercase tracking-wider block">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={salesPhone}
                      onChange={(e) => setSalesPhone(e.target.value)}
                      className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-2 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#434655] uppercase tracking-wider block">
                    Inquiry Message
                  </label>
                  <textarea
                    rows={3}
                    placeholder="We want to automate client onboarding and need HIPAA compliance..."
                    value={salesMessage}
                    onChange={(e) => setSalesMessage(e.target.value)}
                    className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-2 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-[#004ac6] hover:bg-[#003ea8] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {submitting ? 'Sending Request...' : 'Send Sales Request'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
