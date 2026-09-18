'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'CUSTOMER' | 'BOT' | 'AGENT';
  createdAt: string;
  status?: string;
  channel?: string;
}

export interface WhatsAppChatViewProps {
  conversationId: string;
  customerName: string;
  customerPhone: string;
  messages: ChatMessage[];
  replyText: string;
  setReplyText: (text: string) => void;
  onSend: (e: React.FormEvent) => void;
  isSending: boolean;
  needsEscalation: boolean;
  onTakeover?: () => void;
  onResolve?: () => void;
}

export default function WhatsAppChatView({
  conversationId,
  customerName,
  customerPhone,
  messages,
  replyText,
  setReplyText,
  onSend,
  isSending,
  needsEscalation,
  onTakeover,
  onResolve,
}: WhatsAppChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      let h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#efeae2] relative overflow-hidden font-sans">
      {/* WhatsApp Signature Subtle Doodle Background Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.06] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* WhatsApp Header Bar */}
      <header className="h-[60px] bg-[#f0f2f5] border-b border-[#d1d7db] px-4 flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#dfe5e7] flex items-center justify-center text-[#54656f] font-semibold text-sm border border-[#c3c6d7]">
            {customerName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[15px] text-[#111b21] leading-tight">
                {customerName}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                WhatsApp
              </span>
            </div>
            <span className="text-[12px] text-[#667781] leading-tight mt-0.5">
              +{customerPhone} • online
            </span>
          </div>
        </div>

        {/* WhatsApp Header Actions */}
        <div className="flex items-center gap-3 text-[#54656f]">
          {needsEscalation && (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Escalated to Human
            </span>
          )}
          <button title="Search in chat" className="p-1.5 hover:bg-[#e9edef] rounded-full transition-colors">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>
          <button title="Attach file" className="p-1.5 hover:bg-[#e9edef] rounded-full transition-colors">
            <span className="material-symbols-outlined text-[20px]">attach_file</span>
          </button>
          <button title="Options" className="p-1.5 hover:bg-[#e9edef] rounded-full transition-colors">
            <span className="material-symbols-outlined text-[20px]">more_vert</span>
          </button>
        </div>
      </header>

      {/* Message Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 z-10">
        {/* Encrypted Notice Banner */}
        <div className="flex justify-center my-3">
          <div className="bg-[#ffeecd] text-[#54656f] text-[11px] font-medium px-3 py-1 rounded-lg shadow-sm max-w-md text-center border border-[#ffdda6] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px] text-[#d97706]">lock</span>
            Messages and calls are end-to-end encrypted on WhatsApp.
          </div>
        </div>

        {messages.map((msg) => {
          const isOutbound = msg.direction === 'OUTBOUND';
          return (
            <div
              key={msg.id}
              className={cn(
                'flex w-full',
                isOutbound ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'relative max-w-[75%] sm:max-w-[65%] px-3 pt-2 pb-1 text-[14.2px] leading-[19px] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
                  isOutbound
                    ? 'bg-[#d9fdd3] rounded-[7.5px] rounded-tr-none'
                    : 'bg-white rounded-[7.5px] rounded-tl-none'
                )}
              >
                {/* Outbound Top-Right Wedge Tail */}
                {isOutbound && (
                  <span className="absolute -top-0 -right-2 w-0 h-0 border-t-[8px] border-t-[#d9fdd3] border-r-[8px] border-r-transparent" />
                )}
                {/* Inbound Top-Left Wedge Tail */}
                {!isOutbound && (
                  <span className="absolute -top-0 -left-2 w-0 h-0 border-t-[8px] border-t-white border-l-[8px] border-l-transparent" />
                )}

                {/* Sender Indicator */}
                {isOutbound && (
                  <div className="text-[10px] font-bold text-[#008069] uppercase tracking-wider mb-0.5">
                    {msg.senderType === 'BOT' ? 'AI Agent' : 'Support Agent'}
                  </div>
                )}

                {/* Message Body */}
                <div className="break-words whitespace-pre-wrap pr-14">
                  {msg.content}
                </div>

                {/* Inline Floating Timestamp + Double Ticks */}
                <div className="flex items-center justify-end gap-1 text-[11px] text-[#667781] float-right -mt-2 ml-2 select-none">
                  <span>{formatTime(msg.createdAt)}</span>
                  {isOutbound && (
                    <span className="text-[#53bdeb] text-[13px] font-bold tracking-tighter" title="Read">
                      ✓✓
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* WhatsApp Composer Dock */}
      <footer className="h-[62px] bg-[#f0f2f5] border-t border-[#d1d7db] px-4 flex items-center gap-3 shrink-0 z-10">
        <button type="button" className="text-[#54656f] hover:text-[#111b21] transition-colors p-1" title="Emoji">
          <span className="material-symbols-outlined text-[24px]">mood</span>
        </button>
        <button type="button" className="text-[#54656f] hover:text-[#111b21] transition-colors p-1" title="Attach">
          <span className="material-symbols-outlined text-[24px]">attach_file</span>
        </button>

        {/* Input Field */}
        <form onSubmit={onSend} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-white text-[#111b21] placeholder-[#8696a0] rounded-lg px-4 py-2 text-[14px] focus:outline-none border-none shadow-sm"
          />
          {replyText.trim() ? (
            <button
              type="submit"
              disabled={isSending}
              className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white flex items-center justify-center shadow transition-transform active:scale-95 disabled:opacity-50"
              title="Send Message"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          ) : (
            <button
              type="button"
              className="text-[#54656f] hover:text-[#111b21] p-2 rounded-full transition-colors"
              title="Voice Message"
            >
              <span className="material-symbols-outlined text-[24px]">mic</span>
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}
