'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Socket } from 'socket.io-client';
import { getClientSocket } from '@/lib/socket-client';

interface Message {
  id: string;
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'CUSTOMER' | 'BOT' | 'AGENT';
  createdAt: string;
}

export default function WebChatWidget() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantSlug = params['tenant-slug'] as string;
  const isEmbed = searchParams.get('embed') === 'true';

  // Branding & Configuration
  const [tenantName, setTenantName] = useState('Insurance Partner');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#004ac6');
  const [tenantId, setTenantId] = useState('');

  // Conversation State
  const [step, setStep] = useState<'consent' | 'phone' | 'otp' | 'chat'>('consent');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'greet-1',
      content: "Hello! Welcome to our virtual intake assistant. Let's find the best cover options for you.",
      direction: 'OUTBOUND',
      senderType: 'BOT',
      createdAt: new Date().toISOString(),
    }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [botTyping, setBotTyping] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch tenant details on mount
  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch(`/api/tenant/onboarding?slug=${tenantSlug}`);
        if (res.ok) {
          const info = await res.json();
          setTenantId(info.tenantId);
          setTenantName(info.tenantName || 'Insurance Partner');
          setLogoUrl(info.logoUrl);
          setPrimaryColor(info.primaryColor || '#004ac6');
        }
      } catch (err) {
        console.error('Failed to load dynamic branding:', err);
      }
    }
    if (tenantSlug) {
      fetchBranding();
    }
  }, [tenantSlug]);

  // Connect Socket.io when conversation is initialized
  useEffect(() => {
    if (!tenantId || !conversationId) return;

    // Connect to Unified WebSocket on current origin
    const socket = getClientSocket(tenantId);

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Webchat connected successfully.');
    });

    socket.on('new_message', (data: { conversationId: string; message: Message }) => {
      if (data.conversationId === conversationId) {
        // Prevent appending duplicates if we sent it
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        setBotTyping(false);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId, conversationId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, botTyping]);

  const handleSendConsent = () => {
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
        setErrorMsg(errData.error || 'Failed to send verification code.');
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
        setConversationId(data.conversationId);
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
        setStep('chat');
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'Invalid verification code.');
      }
    } catch {
      setErrorMsg('Verification failed. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const text = inputValue;
    setInputValue('');
    setBotTyping(true);

    // Create temporary optimistic message
    const tempId = `temp-${Date.now()}`;
    const newMsg: Message = {
      id: tempId,
      content: text,
      direction: 'INBOUND',
      senderType: 'CUSTOMER',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);

    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/webchat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          conversationId,
          content: text,
        }),
      });

      if (!res.ok) {
        console.error('Failed to dispatch client message.');
      }
    } catch (err) {
      console.error('Network dispatch error:', err);
    }
  };

  return (
    <div 
      style={{
        '--brand-primary': primaryColor,
      } as React.CSSProperties}
      className={`font-sans antialiased text-[#111c2d] flex flex-col ${isEmbed ? 'w-full h-full' : 'max-w-[420px] mx-auto h-[600px] mt-12 rounded-2xl border border-[#c3c6d7] shadow-2xl overflow-hidden'}`}
    >
      {/* Header Panel */}
      <header className="bg-primary-container p-4 flex items-center justify-between text-white shrink-0" style={{ backgroundColor: 'var(--brand-primary)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden border border-white/20">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenantName} className="w-8 h-8 object-contain" />
            ) : (
              <span className="material-symbols-outlined text-[#004ac6] text-2xl font-bold">health_and_safety</span>
            )}
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">{tenantName}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              <span className="text-[9px] uppercase font-bold tracking-wider opacity-90">Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body (Transitions by step) */}
      <div className="flex-1 bg-[#f9f9ff] flex flex-col p-4 min-h-0 overflow-y-auto">
        {step === 'consent' && (
          <div className="my-auto space-y-6 text-center px-4">
            <div className="w-16 h-16 bg-[#e7eeff] rounded-full flex items-center justify-center mx-auto" style={{ color: 'var(--brand-primary)' }}>
              <span className="material-symbols-outlined text-[32px]">security</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[#111c2d]">Consent Agreement</h2>
              <p className="text-xs text-[#434655] leading-relaxed">
                By entering this conversation, you agree to our Terms of Service and consent to automated AI profiling to match quote options.
              </p>
            </div>
            <button 
              onClick={handleSendConsent}
              className="w-full text-white py-3 rounded-lg text-sm font-bold shadow hover:opacity-95 transition-opacity"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              I Agree &amp; Connect
            </button>
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={handleSendPhone} className="my-auto space-y-6 px-4">
            <div className="w-16 h-16 bg-[#e7eeff] rounded-full flex items-center justify-center mx-auto" style={{ color: 'var(--brand-primary)' }}>
              <span className="material-symbols-outlined text-[32px]">phone_iphone</span>
            </div>
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-bold text-[#111c2d]">Verify Phone Number</h2>
              <p className="text-xs text-[#434655]">
                Input your phone number to unify your chat history and receive quotes.
              </p>
            </div>

            {errorMsg && <p className="text-xs text-red-600 text-center font-semibold">{errorMsg}</p>}

            <input 
              type="tel" 
              required
              placeholder="e.g. +1 (555) 019-2834"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-sm focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] outline-none"
            />

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 rounded-lg text-sm font-bold shadow hover:opacity-95 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isLoading ? 'Sending Code...' : 'Send Verification OTP'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleSendOTP} className="my-auto space-y-6 px-4">
            <div className="w-16 h-16 bg-[#e7eeff] rounded-full flex items-center justify-center mx-auto" style={{ color: 'var(--brand-primary)' }}>
              <span className="material-symbols-outlined text-[32px]">pin</span>
            </div>
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-bold text-[#111c2d]">Enter OTP</h2>
              <p className="text-xs text-[#434655]">
                We sent a 6-digit code to {phoneNumber}. Check the system terminal console!
              </p>
            </div>

            {errorMsg && <p className="text-xs text-red-600 text-center font-semibold">{errorMsg}</p>}

            <input 
              type="text" 
              required
              maxLength={6}
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-sm text-center font-bold tracking-widest focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] outline-none"
            />

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 rounded-lg text-sm font-bold shadow hover:opacity-95 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isLoading ? 'Verifying...' : 'Verify OTP Code'}
            </button>
          </form>
        )}

        {step === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {messages.map((msg) => {
                const isUser = msg.direction === 'INBOUND';
                return (
                  <div 
                    key={msg.id}
                    className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'ml-auto items-end' : 'items-start'}`}
                  >
                    <div 
                      className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                        isUser 
                          ? 'bg-primary-container border-primary text-white rounded-tr-none'
                          : 'bg-white border-[#c3c6d7]/40 text-[#111c2d] rounded-tl-none'
                      }`}
                      style={isUser ? { backgroundColor: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' } : {}}
                    >
                      <p>{msg.content}</p>
                    </div>
                    <span className="text-[9px] text-[#737686] font-medium ml-1">
                      {msg.senderType === 'BOT' ? 'Bot' : msg.senderType === 'AGENT' ? 'Agent' : 'You'} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}

              {botTyping && (
                <div className="flex flex-col gap-1 max-w-[85%] items-start">
                  <div className="bg-white border border-[#c3c6d7]/40 p-3.5 rounded-xl rounded-tl-none">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                  <span className="text-[9px] text-[#737686] font-medium ml-1">Bot is typing...</span>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Composer Footer */}
            <form onSubmit={handleSendMessage} className="mt-4 pt-3 border-t border-[#c3c6d7]/50 flex items-center relative gap-2 shrink-0">
              <input 
                type="text"
                placeholder="Type your message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-white border border-[#c3c6d7] rounded-xl py-3 pl-4 pr-12 text-xs focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] outline-none"
              />
              <button 
                type="submit"
                className="absolute right-2 p-2 bg-primary-container text-white rounded-lg hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <div className="bg-white py-2 border-t border-[#c3c6d7]/45 text-center flex justify-center items-center gap-1 shrink-0">
        <span className="text-[9px] text-[#c3c6d7] font-bold uppercase tracking-tight">Powered by</span>
        <span className="text-[9px] text-[#737686] font-extrabold uppercase tracking-wider">OneAIAssist</span>
      </div>
    </div>
  );
}
