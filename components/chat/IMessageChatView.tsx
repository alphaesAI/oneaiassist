'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChatMessage } from './WhatsAppChatView';

export interface IMessageChatViewProps {
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

export default function IMessageChatView({
  conversationId,
  customerName,
  customerPhone,
  messages,
  replyText,
  setReplyText,
  onSend,
  isSending,
  needsEscalation,
}: IMessageChatViewProps) {
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
    <div className="flex-1 flex flex-col h-full bg-white relative overflow-hidden font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','SF_Pro_Display',sans-serif]">
      {/* Apple iOS Frosted Header */}
      <header className="h-[64px] bg-white/90 backdrop-blur-md border-b border-[#c6c6c8]/50 px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#007AFF] text-[24px]">chevron_left</span>
          <span className="text-[#007AFF] text-[15px] font-medium -ml-1">Messages</span>
        </div>

        {/* Centered Contact Profile */}
        <div className="flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-[#8E8E93] text-white flex items-center justify-center font-semibold text-xs shadow-sm">
            {customerName.charAt(0).toUpperCase()}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="font-semibold text-[13px] text-[#000000] leading-tight">
              {customerName}
            </span>
            <span className="text-[#8E8E93] text-[10px]">⌵</span>
          </div>
          <span className="text-[10px] text-[#007AFF] font-medium leading-none">
            iMessage
          </span>
        </div>

        {/* Apple Header Action Icons */}
        <div className="flex items-center gap-3 text-[#007AFF]">
          <button title="FaceTime Audio" className="p-1 hover:bg-[#F2F2F7] rounded-full transition-colors">
            <span className="material-symbols-outlined text-[20px]">call</span>
          </button>
          <button title="FaceTime Video" className="p-1 hover:bg-[#F2F2F7] rounded-full transition-colors">
            <span className="material-symbols-outlined text-[20px]">videocam</span>
          </button>
        </div>
      </header>

      {/* Message Stream Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-3 z-10">
        {/* Date / Channel Header Pill */}
        <div className="flex justify-center my-2">
          <span className="text-[11px] font-semibold text-[#8E8E93] tracking-wide uppercase">
            iMessage • {customerPhone}
          </span>
        </div>

        {messages.map((msg, index) => {
          const isOutbound = msg.direction === 'OUTBOUND';
          const isLastMessage = index === messages.length - 1;

          return (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col w-full',
                isOutbound ? 'items-end' : 'items-start'
              )}
            >
              {/* iMessage Bubble */}
              <div
                className={cn(
                  'relative max-w-[75%] sm:max-w-[65%] px-4 py-2.5 text-[15.5px] leading-[20px] font-normal transition-all',
                  isOutbound
                    ? 'bg-[#007AFF] text-white rounded-[20px] rounded-br-[4px] shadow-sm'
                    : 'bg-[#E9E9EB] text-[#000000] rounded-[20px] rounded-bl-[4px]'
                )}
              >
                {/* Outbound Tail Curve */}
                {isOutbound && (
                  <span className="absolute bottom-0 -right-1 w-3 h-3 bg-[#007AFF] rounded-bl-[8px]" />
                )}
                {/* Inbound Tail Curve */}
                {!isOutbound && (
                  <span className="absolute bottom-0 -left-1 w-3 h-3 bg-[#E9E9EB] rounded-br-[8px]" />
                )}

                {/* Sender Subtitle (for Bot/Agent clarity) */}
                {isOutbound && (
                  <div className="text-[10px] font-bold text-white/80 uppercase tracking-wider mb-0.5">
                    {msg.senderType === 'BOT' ? 'AI Assistant' : 'Live Agent'}
                  </div>
                )}

                <div className="break-words whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>

              {/* Apple "Delivered" / "Read" Receipt underneath */}
              {isOutbound && isLastMessage && (
                <div className="flex items-center gap-1 text-[11px] font-medium text-[#8E8E93] mt-1 mr-1">
                  <span>Delivered</span>
                  <span>• {formatTime(msg.createdAt)}</span>
                </div>
              )}
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Apple iOS Input Bar */}
      <footer className="h-[64px] bg-white border-t border-[#c6c6c8]/40 px-4 flex items-center gap-3 shrink-0 z-10">
        {/* iOS App Drawer + Button */}
        <button
          type="button"
          className="w-8 h-8 rounded-full bg-[#E5E5EA] hover:bg-[#D1D1D6] text-[#636366] flex items-center justify-center font-bold text-lg transition-colors"
          title="App Drawer"
        >
          +
        </button>

        {/* Pill Input Container */}
        <form onSubmit={onSend} className="flex-1 flex items-center bg-white border border-[#C6C6C8] rounded-full px-3 py-1.5 focus-within:border-[#007AFF] transition-all">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="iMessage"
            className="flex-1 bg-transparent text-[#000000] placeholder-[#8E8E93] text-[15px] focus:outline-none px-2"
          />

          {replyText.trim() ? (
            <button
              type="submit"
              disabled={isSending}
              className="w-7 h-7 rounded-full bg-[#007AFF] hover:bg-[#0062cc] text-white flex items-center justify-center shadow-sm transition-transform active:scale-90 disabled:opacity-50"
              title="Send iMessage"
            >
              <span className="text-[14px] font-bold leading-none">↑</span>
            </button>
          ) : (
            <button
              type="button"
              className="text-[#8E8E93] hover:text-[#007AFF] transition-colors p-1"
              title="Audio Waveform"
            >
              <span className="material-symbols-outlined text-[20px]">graphic_eq</span>
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}
