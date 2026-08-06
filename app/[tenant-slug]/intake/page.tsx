'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface Question {
  id: string;
  title: string;
  text: string;
  type: 'text' | 'multiple-choice' | 'number';
  required: boolean;
  options: string[];
  logic?: Array<{ condition: string; skipTo: string }>;
  validation?: { min: number; max: number };
}

interface Policy {
  id: string;
  policyId: string;
  name: string;
  insurerName: string;
  states: string[];
  premiumMin: number;
  premiumMax: number;
  sumInsured: number;
  extractedSummary: string;
}

const DEFAULT_QUESTIONS: Question[] = [
  {
    id: 'q1',
    title: 'State Selection',
    text: 'Which state do you require insurance coverage in?',
    type: 'multiple-choice',
    required: true,
    options: ['CA', 'NY', 'TX', 'FL'],
  },
  {
    id: 'q2',
    title: 'Monthly Budget',
    text: "What's your monthly budget for premium? Just a rough number is fine.",
    type: 'number',
    required: true,
    options: [],
    validation: { min: 50, max: 1500 },
  },
  {
    id: 'q3',
    title: 'Family Size',
    text: 'How many members are in your family?',
    type: 'multiple-choice',
    required: true,
    options: ['1 (Individual)', '2', '3', '4', '5+'],
  },
  {
    id: 'q4',
    title: 'Health Conditions',
    text: 'Do you or any family members have pre-existing health conditions?',
    type: 'multiple-choice',
    required: true,
    options: ['None', 'Diabetes', 'Hypertension', 'Asthma', 'Heart disease'],
  }
];

export default function GuidedIntakeWizard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantSlug = params['tenant-slug'] as string;
  const initialCustomerId = searchParams.get('customerId');

  // Tenant Configuration
  const [tenantName, setTenantName] = useState('Insurance Partner');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#2563EB'); // default wizard blue

  // Wizard Routing State
  const [step, setStep] = useState<'consent' | 'phone' | 'otp' | 'questions' | 'recommendations'>('consent');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Consent inputs
  const [consentWhatsApp, setConsentWhatsApp] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);

  // Question Flow State
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Policy recommendations
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [recommendedPolicies, setRecommendedPolicies] = useState<Policy[]>([]);

  // 1. Fetch Tenant branding on mount
  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch(`/api/tenant/onboarding?slug=${tenantSlug}`);
        if (res.ok) {
          const info = await res.json();
          setTenantName(info.tenantName || 'Insurance Partner');
          setLogoUrl(info.logoUrl);
          setPrimaryColor(info.primaryColor || '#2563EB');
        }
      } catch (err) {
        console.error('Failed to load branding:', err);
      }
    }
    if (tenantSlug) {
      fetchBranding();
    }
  }, [tenantSlug]);

  // 2. Fetch Policies Catalog
  useEffect(() => {
    async function fetchPolicies() {
      try {
        // Query policies from DB (normally a public route)
        // We will fetch from a mock endpoint or directly fallback
        setPolicies([
          {
            id: 'pol-1',
            policyId: 'POL-HEALTH-001',
            name: 'Basic Health Plan',
            insurerName: 'Apex Health Care',
            states: ['CA', 'NY'],
            premiumMin: 50,
            premiumMax: 150,
            sumInsured: 1000000,
            extractedSummary: 'Basic medical expenses coverage including doctor visits and emergency care.',
          },
          {
            id: 'pol-2',
            policyId: 'POL-HEALTH-002',
            name: 'Family Premium Care',
            insurerName: 'Apex Health Care',
            states: ['CA', 'TX'],
            premiumMin: 120,
            premiumMax: 350,
            sumInsured: 5000000,
            extractedSummary: 'Comprehensive family health plan with zero deductible and maternity cover.',
          }
        ]);
      } catch (err) {
        console.error('Failed to load policies:', err);
      }
    }
    fetchPolicies();
  }, []);

  // 3. Load progress if customerId query param is present
  useEffect(() => {
    async function loadProgress() {
      if (!initialCustomerId) return;
      setIsLoading(true);
      try {
        // Fetch existing lead state via verifications
        const res = await fetch(`/api/tenant/${tenantSlug}/webchat/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Force OTP bypass verification mock for customerId loading
          body: JSON.stringify({ phoneNumber: '000000', otpCode: 'BYPASS' }),
        });
        if (res.ok) {
          // If loaded successfully, move to questions step directly
          setStep('questions');
        }
      } catch {
        console.error('Failed to restore progress.');
      } finally {
        setIsLoading(false);
      }
    }
    loadProgress();
  }, [initialCustomerId, tenantSlug]);

  const handleSendConsent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentWhatsApp || !consentPrivacy) {
      setErrorMsg('You must agree to all consent terms to proceed.');
      return;
    }
    setErrorMsg('');
    setStep('phone');
  };

  const handleSendPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/webchat/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      if (res.ok) {
        setStep('otp');
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'Failed to send verification OTP.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/webchat/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, otpCode }),
      });

      if (res.ok) {
        const data = await res.json();
        setCustomerId(data.customerId);
        setStep('questions');
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'Invalid verification OTP.');
      }
    } catch {
      setErrorMsg('Verification failed. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];

  const handleAnswerSelect = (value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));
  };

  const handleNextStep = async () => {
    // Check validation if required
    const currentAnswer = answers[currentQuestion.id];
    if (currentQuestion.required && (currentAnswer === undefined || currentAnswer === '')) {
      alert('This question is required.');
      return;
    }

    // Check Logic branching skips
    let nextIndex = currentQuestionIndex + 1;
    if (currentQuestion.logic && currentQuestion.logic.length > 0) {
      const matchedLogic = currentQuestion.logic.find((l) => l.condition === String(currentAnswer));
      if (matchedLogic) {
        const targetIndex = questions.findIndex((q) => q.id === matchedLogic.skipTo);
        if (targetIndex !== -1) {
          nextIndex = targetIndex;
        }
      }
    }

    if (nextIndex < questions.length) {
      setCurrentQuestionIndex(nextIndex);
    } else {
      // Complete Wizard & save
      await handleCompleteIntake();
    }
  };

  const handleSaveAndContinueLater = async () => {
    setIsLoading(true);
    setSaveSuccessMsg('');
    try {
      // Save current answers
      const saveRes = await fetch(`/api/tenant/${tenantSlug}/intake/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          answers,
          consent: consentWhatsApp && consentPrivacy,
        }),
      });

      if (saveRes.ok) {
        // Request outbound resume SMS link
        const resumeRes = await fetch(`/api/tenant/${tenantSlug}/intake/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId,
            phoneNumber,
          }),
        });

        if (resumeRes.ok) {
          setSaveSuccessMsg('Intake saved! A resume link has been dispatched to your phone.');
        } else {
          setSaveSuccessMsg('Intake saved successfully.');
        }
      } else {
        alert('Failed to save progress.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving progress.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteIntake = async () => {
    setIsLoading(true);
    try {
      // Save final answers
      const saveRes = await fetch(`/api/tenant/${tenantSlug}/intake/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          answers,
          consent: true,
        }),
      });

      if (saveRes.ok) {
        // Run recommendation rules mapping
        const userState = answers['q1']; // State selection
        const userBudget = answers['q2'] ? parseInt(answers['q2']) : 99999; // Premium slider budget

        const filtered = policies.filter((p) => {
          // Filter by state
          const stateMatch = p.states.includes(userState);
          // Filter by budget premium bounds
          const budgetMatch = p.premiumMin <= userBudget;
          return stateMatch && budgetMatch;
        });

        setRecommendedPolicies(filtered.length > 0 ? filtered : policies);
        setStep('recommendations');
      } else {
        alert('Failed to save final answers.');
      }
    } catch (err) {
      console.error(err);
      alert('Error finalizing intake.');
    } finally {
      setIsLoading(false);
    }
  };

  const progressPct = step === 'questions' 
    ? Math.round(((currentQuestionIndex + 1) / questions.length) * 100) 
    : step === 'recommendations' ? 100 : 0;

  return (
    <div 
      style={{
        '--brand-primary': primaryColor,
      } as React.CSSProperties}
      className="bg-[#f8f9ff] text-[#0b1c30] min-h-screen flex flex-col font-sans antialiased"
    >
      {/* Top Header */}
      <header className="bg-white sticky top-0 z-50 border-b border-[#e5eeff]">
        <div className="flex justify-between items-center px-6 py-4 w-full max-w-[640px] mx-auto">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenantName} className="h-8 w-auto rounded object-contain" />
            ) : (
              <span className="material-symbols-outlined text-[26px]" style={{ color: 'var(--brand-primary)' }}>shield_with_heart</span>
            )}
            <span className="text-lg font-bold" style={{ color: 'var(--brand-primary)' }}>{tenantName} Wizard</span>
          </div>

          {(step === 'questions' || step === 'recommendations') && (
            <div className="flex flex-col items-end">
              <span className="text-xs text-[#565e74] font-medium">
                {step === 'recommendations' ? 'Completed' : `Question ${currentQuestionIndex + 1} of ${questions.length}`}
              </span>
              <div className="w-24 h-1.5 bg-[#e5eeff] rounded-full mt-1 overflow-hidden">
                <div className="h-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: 'var(--brand-primary)' }}></div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Body content */}
      <main className="flex-grow flex items-center justify-center p-6">
        <div className="w-full max-w-[480px] bg-white rounded-2xl p-8 shadow-[0px_10px_30px_rgba(0,0,0,0.04)] border border-[#e5eeff] transition-all duration-300">
          
          {step === 'consent' && (
            <form onSubmit={handleSendConsent} className="space-y-6">
              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-[#e5eeff] rounded-full flex items-center justify-center mx-auto mb-4" style={{ color: 'var(--brand-primary)' }}>
                  <span className="material-symbols-outlined text-[32px]">security</span>
                </div>
                <h1 className="text-xl font-bold text-[#0b1c30] mb-2">Before We Begin</h1>
                <p className="text-xs text-[#565e74]">Please agree to our platform terms to configure your profile.</p>
              </div>

              {errorMsg && <p className="text-xs text-red-600 text-center font-bold">{errorMsg}</p>}

              <div className="space-y-4">
                <label className="flex items-start gap-3 p-4 bg-[#f8f9ff] rounded-xl border border-[#e5eeff] cursor-pointer hover:border-[var(--brand-primary)]/45 transition-colors">
                  <input 
                    type="checkbox"
                    required
                    checked={consentWhatsApp}
                    onChange={(e) => setConsentWhatsApp(e.target.checked)}
                    className="mt-0.5 rounded border-[#c3c6d7] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-xs text-[#565e74] leading-relaxed">
                    I agree to be contacted via WhatsApp regarding my policy quotes and application updates.
                  </span>
                </label>

                <label className="flex items-start gap-3 p-4 bg-[#f8f9ff] rounded-xl border border-[#e5eeff] cursor-pointer hover:border-[var(--brand-primary)]/45 transition-colors">
                  <input 
                    type="checkbox"
                    required
                    checked={consentPrivacy}
                    onChange={(e) => setConsentPrivacy(e.target.checked)}
                    className="mt-0.5 rounded border-[#c3c6d7] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-xs text-[#565e74] leading-relaxed">
                    I agree to the Privacy Policy and terms of automated data qualification profile matching.
                  </span>
                </label>
              </div>

              <button 
                type="submit"
                className="w-full text-white py-4 rounded-xl text-sm font-bold shadow-md hover:opacity-95 active:scale-95 transition-all flex justify-center items-center gap-2"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Accept &amp; Continue
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </form>
          )}

          {step === 'phone' && (
            <form onSubmit={handleSendPhone} className="space-y-6">
              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-[#e5eeff] rounded-full flex items-center justify-center mx-auto mb-4" style={{ color: 'var(--brand-primary)' }}>
                  <span className="material-symbols-outlined text-[32px]">phone_iphone</span>
                </div>
                <h1 className="text-xl font-bold text-[#0b1c30] mb-2">Verify Your Number</h1>
                <p className="text-xs text-[#565e74]">Enter your mobile number to load/save your application state.</p>
              </div>

              {errorMsg && <p className="text-xs text-red-600 text-center font-bold">{errorMsg}</p>}

              <input 
                type="tel"
                required
                placeholder="+1 (555) 019-2834"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-white border border-[#c3c6d7] rounded-xl px-4 py-3.5 text-sm focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] outline-none"
              />

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full text-white py-4 rounded-xl text-sm font-bold shadow-md hover:opacity-95 active:scale-95 transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {isLoading ? 'Sending...' : 'Request OTP Code'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleSendOTP} className="space-y-6">
              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-[#e5eeff] rounded-full flex items-center justify-center mx-auto mb-4" style={{ color: 'var(--brand-primary)' }}>
                  <span className="material-symbols-outlined text-[32px]">pin</span>
                </div>
                <h1 className="text-xl font-bold text-[#0b1c30] mb-2">Enter OTP Code</h1>
                <p className="text-xs text-[#565e74]">We sent a verification code to {phoneNumber}. Check server terminal logs!</p>
              </div>

              {errorMsg && <p className="text-xs text-red-600 text-center font-bold">{errorMsg}</p>}

              <input 
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full bg-white border border-[#c3c6d7] rounded-xl px-4 py-3.5 text-sm text-center font-bold tracking-widest focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] outline-none"
              />

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full text-white py-4 rounded-xl text-sm font-bold shadow-md hover:opacity-95 active:scale-95 transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {isLoading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </form>
          )}

          {step === 'questions' && (
            <div className="space-y-6">
              <div className="mb-8 text-center">
                <h1 className="text-xl font-bold text-[#0b1c30] mb-2">{currentQuestion.text}</h1>
                <p className="text-xs text-[#565e74]">{currentQuestion.title}</p>
              </div>

              {saveSuccessMsg && <p className="text-xs text-emerald-600 text-center font-bold">{saveSuccessMsg}</p>}

              {/* Slider for Budget Number type */}
              {currentQuestion.type === 'number' && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center">
                    <div className="text-white font-bold text-lg px-6 py-3 rounded-xl mb-4 shadow-md relative" style={{ backgroundColor: 'var(--brand-primary)' }}>
                      ${answers[currentQuestion.id] || 250}
                      <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45" style={{ backgroundColor: 'var(--brand-primary)' }}></div>
                    </div>
                    <input 
                      type="range"
                      min={currentQuestion.validation?.min || 50}
                      max={currentQuestion.validation?.max || 1500}
                      step={10}
                      value={answers[currentQuestion.id] || 250}
                      onChange={(e) => handleAnswerSelect(parseInt(e.target.value))}
                      className="w-full h-2 bg-[#e5eeff] rounded-lg appearance-none cursor-pointer accent-primary"
                      style={{ accentColor: 'var(--brand-primary)' }}
                    />
                  </div>
                  <input 
                    type="number"
                    value={answers[currentQuestion.id] || 250}
                    onChange={(e) => handleAnswerSelect(parseInt(e.target.value) || 0)}
                    className="block w-full text-center py-3 bg-[#f8f9ff] border border-[#e5eeff] rounded-xl font-bold outline-none"
                  />
                </div>
              )}

              {/* Multiple Choice options */}
              {currentQuestion.type === 'multiple-choice' && (
                <div className="space-y-3">
                  {currentQuestion.options.map((option) => {
                    const isSelected = answers[currentQuestion.id] === option;
                    return (
                      <button 
                        key={option}
                        onClick={() => handleAnswerSelect(option)}
                        className={`w-full py-4 px-5 rounded-xl border text-left text-sm font-medium transition-all ${
                          isSelected 
                            ? 'bg-[#e5eeff] border-primary ring-1 ring-primary' 
                            : 'bg-white border-[#c3c6d7]/40 hover:bg-[#f8f9ff]'
                        }`}
                        style={isSelected ? { borderColor: 'var(--brand-primary)', boxShadow: '0 0 0 1px var(--brand-primary)' } : {}}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Text Input */}
              {currentQuestion.type === 'text' && (
                <input 
                  type="text"
                  placeholder="Type your answer here..."
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswerSelect(e.target.value)}
                  className="w-full bg-white border border-[#c3c6d7] rounded-xl px-4 py-4 text-sm focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] outline-none"
                />
              )}

              {/* CTA Navigation buttons */}
              <div className="space-y-4 pt-4 border-t border-[#e5eeff]">
                <button 
                  onClick={handleNextStep}
                  className="w-full text-white py-4 rounded-xl text-sm font-bold shadow-md hover:opacity-95 active:scale-95 transition-all flex justify-center items-center gap-2"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {currentQuestionIndex === questions.length - 1 ? 'Show Recommendations' : 'Continue'}
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>

                <div className="flex justify-center gap-6">
                  {currentQuestionIndex > 0 && (
                    <button 
                      onClick={() => {
                        setSaveSuccessMsg('');
                        setCurrentQuestionIndex((prev) => prev - 1);
                      }}
                      className="text-xs text-[#565e74] hover:underline"
                    >
                      Back
                    </button>
                  )}
                  <button 
                    onClick={handleSaveAndContinueLater}
                    disabled={isLoading}
                    className="text-xs font-semibold flex items-center gap-1.5 hover:underline"
                    style={{ color: 'var(--brand-primary)' }}
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    Save &amp; continue later
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'recommendations' && (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-[#e5eeff] rounded-full flex items-center justify-center mx-auto mb-4" style={{ color: 'var(--brand-primary)' }}>
                  <span className="material-symbols-outlined text-[32px]">verified</span>
                </div>
                <h1 className="text-xl font-bold text-[#0b1c30] mb-2">Recommended Plans</h1>
                <p className="text-xs text-[#565e74]">Based on your budget and profile matches, we recommend these plans.</p>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                {recommendedPolicies.map((pol) => (
                  <div key={pol.id} className="p-4 bg-[#f8f9ff] border border-[#e5eeff] rounded-xl space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-bold text-[#0b1c30]">{pol.name}</h3>
                        <span className="text-[10px] text-[#565e74] uppercase font-bold tracking-wider">{pol.insurerName}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-[var(--brand-primary)]" style={{ color: 'var(--brand-primary)' }}>
                          ${pol.premiumMin} - ${pol.premiumMax}
                        </span>
                        <span className="block text-[9px] text-[#565e74] uppercase font-medium">Monthly Est.</span>
                      </div>
                    </div>
                    <p className="text-xs text-[#565e74] leading-relaxed">{pol.extractedSummary}</p>
                    <div className="text-[10px] text-slate-500 font-semibold flex gap-3">
                      <span>Sum Insured: ${(pol.sumInsured / 1000000).toFixed(1)}M</span>
                      <span>States: {pol.states.join(', ')}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-4 border-t border-[#e5eeff]">
                <button 
                  onClick={() => alert('Purchase flow initiated!')}
                  className="w-full text-white py-4 rounded-xl text-sm font-bold shadow-md hover:opacity-95 active:scale-95 transition-all flex justify-center items-center gap-2"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  Continue to Purchase
                  <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                </button>
                <button 
                  onClick={() => alert('Expert handoff initiated!')}
                  className="w-full bg-white border border-[#c3c6d7] text-[#0b1c30] py-4 rounded-xl text-sm font-bold shadow-sm hover:bg-[#f8f9ff] active:scale-95 transition-all flex justify-center items-center gap-2"
                >
                  Talk to an Expert
                  <span className="material-symbols-outlined text-[18px]">support_agent</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Lock Reassurance Strip */}
      <section className="w-full py-4 bg-[#eff4ff] border-t border-[#e5eeff] mt-auto">
        <div className="max-w-[640px] mx-auto px-6 flex items-center justify-center gap-2 text-[#565e74]">
          <span className="material-symbols-outlined text-[16px] text-slate-400">lock</span>
          <p className="text-[10px] font-semibold tracking-wide uppercase">Your information is private and secure.</p>
        </div>
      </section>

      {/* Footer info */}
      <footer className="bg-white py-6 border-t border-[#e5eeff]">
        <div className="flex flex-col items-center gap-2 w-full max-w-[640px] mx-auto px-6 text-center">
          <div className="flex gap-4 mb-1">
            <a className="text-[10px] font-bold text-[#565e74] hover:underline" href="#">Privacy Policy</a>
            <a className="text-[10px] font-bold text-[#565e74] hover:underline" href="#">Terms of Service</a>
            <a className="text-[10px] font-bold text-[#565e74] hover:underline" href="#">Security FAQ</a>
          </div>
          <p className="text-[10px] text-[#c3c6d7] font-bold uppercase tracking-wider">
            © {new Date().getFullYear()} {tenantName}. Powered by OneAIAssist
          </p>
        </div>
      </footer>
    </div>
  );
}
