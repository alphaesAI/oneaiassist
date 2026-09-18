'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChatMessage } from './WhatsAppChatView';

export interface InstagramChatViewProps {
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

export default function InstagramChatView({
  conversationId,
  customerName,
  customerPhone,
  messages,
  replyText,
  setReplyText,
  onSend,
  isSending,
  needsEscalation,
}: InstagramChatViewProps) {
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
    <div className="flex-1 flex flex-col h-full bg-white relative overflow-hidden font-sans">
      {/* Instagram Header Bar */}
      <header className="h-[60px] bg-white border-b border-[#dbdbdb] px-5 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          {/* Circular Avatar with Gradient Story Ring */}
          <div className="relative p-[2px] rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shadow-sm">
            <div className="w-9 h-9 rounded-full bg-white p-[2px]">
              <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-[#262626]">
                {customerName.charAt(0).toUpperCase()}
              </div>
            </div>
            {/* Active now green dot */}
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#31A24C] border-2 border-white rounded-full" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[14.5px] text-[#262626] leading-tight">
                {customerName.toLowerCase().replace(/\s+/g, '_')}
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gradient-to-r from-purple-100 to-rose-100 text-purple-900 border border-purple-200">
                Instagram Direct
              </span>
            </div>
            <span className="text-[12px] text-[#8e8e8e] leading-tight mt-0.5">
              Active now
            </span>
          </div>
        </div>

        {/* Instagram Header Action Icons */}
        <div className="flex items-center gap-4 text-[#262626]">
          <button title="Audio Call" className="hover:opacity-70 transition-opacity">
            <span className="material-symbols-outlined text-[24px]">call</span>
          </button>
          <button title="Video Call" className="hover:opacity-70 transition-opacity">
            <span className="material-symbols-outlined text-[24px]">videocam</span>
          </button>
          <button title="Details" className="hover:opacity-70 transition-opacity">
            <span className="material-symbols-outlined text-[24px]">info</span>
          </button>
        </div>
      </header>

      {/* Message Stream Area */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-3.5 z-10">
        {/* Instagram Profile Introduction Card */}
        <div className="flex flex-col items-center justify-center my-6 text-center space-y-1.5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2px]">
            <div className="w-full h-full rounded-full bg-white p-1">
              <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-lg font-bold text-[#262626]">
                {customerName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
          <h3 className="font-semibold text-sm text-[#262626]">{customerName}</h3>
          <p className="text-xs text-[#8e8e8e]">Instagram • You both connect on Instagram Direct</p>
        </div>

        {messages.map((msg, index) => {
          const isOutbound = msg.direction === 'OUTBOUND';
          const isLast = index === messages.length - 1;

          return (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col w-full',
                isOutbound ? 'items-end' : 'items-start'
              )}
            >
              {/* Instagram Tailless Bubble */}
              <div
                className={cn(
                  'relative max-w-[75%] sm:max-w-[65%] px-4 py-2.5 text-[14.5px] leading-[19px] shadow-sm transition-all',
                  isOutbound
                    ? 'bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white rounded-[22px] rounded-br-[4px]'
                    : 'bg-[#EFEFEF] text-[#262626] rounded-[22px] rounded-bl-[4px]'
                )}
              >
                {/* Sender badge for automated AI */}
                {isOutbound && (
                  <div className="text-[10px] font-bold text-white/90 uppercase tracking-wider mb-0.5">
                    {msg.senderType === 'BOT' ? 'AI Bot' : 'Instagram Agent'}
                  </div>
                )}

                <div className="break-words whitespace-pre-wrap font-normal">
                  {msg.content}
                </div>

                {/* Optional subtle double-tap heart indicator on first message */}
                {index === 0 && !isOutbound && (
                  <div className="absolute -bottom-2 -right-1 bg-white rounded-full px-1 py-0.5 shadow border border-[#efefef] flex items-center justify-center">
                    <span className="text-[11px] leading-none">❤️</span>
                  </div>
                )}
              </div>

              {/* Instagram "Seen" text underneath */}
              {isOutbound && isLast && (
                <div className="flex items-center gap-1 text-[11px] text-[#8e8e8e] mt-1 mr-1">
                  <span>Seen</span>
                  <span>• {formatTime(msg.createdAt)}</span>
                </div>
              )}
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Instagram Composer Tray */}
      <footer className="h-[60px] bg-white border-t border-[#dbdbdb] px-4 flex items-center gap-3 shrink-0 z-10">
        {/* Blue Camera Icon Button */}
        <button
          type="button"
          className="w-8 h-8 rounded-full bg-[#3797F0] hover:bg-[#2879c9] text-white flex items-center justify-center transition-colors"
          title="Camera"
        >
          <span className="material-symbols-outlined text-[18px]">photo_camera</span>
        </button>

        {/* Pill Input Container */}
        <form onSubmit={onSend} className="flex-1 flex items-center bg-white border border-[#dbdbdb] rounded-full px-4 py-2 focus-within:border-[#8e8e8e] transition-all">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-transparent text-[#262626] placeholder-[#8e8e8e] text-[14px] focus:outline-none"
          />

          {replyText.trim() ? (
            <button
              type="submit"
              disabled={isSending}
              className="text-[#0095F6] hover:text-[#00376b] font-bold text-sm tracking-tight px-1 disabled:opacity-50"
            >
              Send
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[#262626]">
              <button type="button" className="hover:opacity-60 transition-opacity p-0.5" title="Voice note">
                <span className="material-symbols-outlined text-[20px]">mic</span>
              </button>
              <button type="button" className="hover:opacity-60 transition-opacity p-0.5" title="Upload photo">
                <span className="material-symbols-outlined text-[20px]">image</span>
              </button>
              <button type="button" className="hover:opacity-60 transition-opacity p-0.5" title="Like">
                <span className="material-symbols-outlined text-[20px] text-rose-500">favorite</span>
              </button>
            </div>
          )}
        </form>
      </footer>
    </div>
  );
}
