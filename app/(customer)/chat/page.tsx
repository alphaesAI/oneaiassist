'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getClientSocket } from '@/lib/socket-client';

interface Message {
  id: string;
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'CUSTOMER' | 'BOT' | 'AGENT';
  createdAt: string;
}

function ChatWidget() {
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || '';

  // Step state: 'CONSENT' | 'OTP' | 'CHAT'
  const [step, setStep] = useState<'CONSENT' | 'OTP' | 'CHAT'>('CONSENT');
  const [consent, setConsent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const messageEndRef = useRef<HTMLDivElement>(null);

  // 1. Trigger OTP SMS dispatch
  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent || !phoneNumber.trim()) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/chat/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, consent, phoneNumber }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start chat session.');
      }

      setStep('OTP');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Verify OTP Code and load conversation ID
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/chat/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, phoneNumber, code: otpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification code invalid.');
      }

      setConversationId(data.conversationId);
      setTenantId(data.tenantId);
      
      // Load historical logs
      const msgsRes = await fetch(`/api/chat/messages?conversationId=${data.conversationId}`);
      if (msgsRes.ok) {
        const msgsData = await msgsRes.json();
        setMessages(msgsData);
      }

      setStep('CHAT');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Socket.io Client for real-time messages
  useEffect(() => {
    if (step !== 'CHAT' || !tenantId || !conversationId) return;

    const socketInstance = getClientSocket(tenantId);

    socketInstance.on('new_message', (data: { conversationId: string; message: Message }) => {
      console.log('[Widget Socket] Message event:', data);
      if (data.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [step, tenantId, conversationId]);

  // Scroll to chat bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 4. Send Message reply
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !conversationId || !tenantId) return;

    const text = inputText;
    setInputText('');

    try {
      const res = await fetch('/api/chat/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          tenantId,
          content: text,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error('[Widget Chat] Failed to send:', err.error);
      }
    } catch (err) {
      console.error('[Widget Chat] Send error:', err);
    }
  };

  // Guard: require tenant slug
  if (!tenantSlug) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-slate-400 text-xs">
        Error: Tenant query parameter is missing (?tenant=tenant-slug)
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto border-x border-slate-900 shadow-2xl relative">
      {/* Widget Header */}
      <div className="h-14 border-b border-slate-900 px-4 flex items-center gap-3 bg-slate-950/80 backdrop-blur-md sticky top-0 shrink-0">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-bold tracking-tight text-slate-200">
          AI Agent Qualification
        </span>
      </div>

      {/* Widget Content Panel */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold px-3 py-2 rounded-xl mb-4 text-left">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Consent & Consent Check */}
        {step === 'CONSENT' && (
          <form onSubmit={handleInitiate} className="space-y-4 text-left">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Start Lead Qualification</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Connect with our AI intake assistant. Enter your details to retrieve compliant plan recommendations.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Phone Number
              </label>
              <input
                type="tel"
                required
                placeholder="+1 555-555-5555"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 transition-all text-xs"
              />
            </div>

            <div className="flex items-start gap-3 bg-slate-900/30 border border-slate-900 p-4 rounded-xl">
              <input
                type="checkbox"
                required
                id="consent-check"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-3.5 w-3.5 accent-teal-500 cursor-pointer"
              />
              <label htmlFor="consent-check" className="text-[10px] text-slate-400 leading-relaxed cursor-pointer select-none">
                I consent to receive text messages at this number. Msg & data rates may apply. SMS frequency varies.
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !consent || !phoneNumber.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-teal-500/10 transition-all text-xs disabled:opacity-50"
            >
              {loading ? 'Sending Code...' : 'Get Verification SMS'}
            </button>
          </form>
        )}

        {/* STEP 2: OTP Verification check */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOTP} className="space-y-4 text-left">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Enter Verification Code</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                We sent a 6-digit verification code to <span className="text-slate-200 font-bold">{phoneNumber}</span>. Enter it below to start your chat session.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                6-Digit Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 transition-all text-xs text-center font-mono tracking-widest"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('CONSENT')}
                disabled={loading}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold rounded-xl border border-slate-800 transition-all text-xs disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !otpCode.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-teal-500/10 transition-all text-xs disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </div>
            <p className="text-[9px] text-slate-500 text-center">
              (For development: Use mock code <span className="font-bold text-teal-400 font-mono">123456</span>)
            </p>
          </form>
        )}

        {/* STEP 3: Chat logs */}
        {step === 'CHAT' && (
          <div className="h-full flex flex-col justify-end">
            <div className="space-y-4 py-2 flex-1">
              {messages.map((msg) => {
                const isBot = msg.direction === 'OUTBOUND';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[80%] rounded-xl p-3 text-xs leading-relaxed ${
                      isBot
                        ? 'bg-slate-900 border border-slate-850 text-slate-200 mr-auto rounded-bl-none'
                        : 'bg-teal-500/10 border border-teal-500/10 text-slate-200 ml-auto rounded-br-none'
                    }`}
                  >
                    <p className="break-words">{msg.content}</p>
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Input reply form (fixed at bottom in chat step) */}
      {step === 'CHAT' && (
        <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-900 bg-slate-950 flex gap-2 shrink-0">
          <input
            type="text"
            required
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 transition-all text-xs"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

export default function ChatWidgetPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-slate-400 text-xs">
        Loading Chat Widget...
      </div>
    }>
      <ChatWidget />
    </Suspense>
  );
}
