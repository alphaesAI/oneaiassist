'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantInfo } from '@/hooks/useTenantInfo';
import { io } from 'socket.io-client';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  status: 'OPEN' | 'CLOSED' | 'PENDING';
  lastMessageAt: string;
  needsEscalation: boolean;
  assignedAgentId: string | null;
  lastMessagePreview: string;
  lastInboundMessageAt: string | null;
  customer: {
    id: string;
    displayName: string;
    phone: string;
    pipelineStage: string;
    intake: {
      age: number | null;
      state: string | null;
      budgetMin: number | null;
      budgetMax: number | null;
      familySize: number | null;
      healthConditions: string;
    } | null;
  };
}

interface Message {
  id: string;
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'CUSTOMER' | 'BOT' | 'AGENT';
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const { data: info } = useTenantInfo();
  const tenantId = info?.tenantId;

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD' | 'AI' | 'ESCALATED' | 'PENDING' | 'CLOSED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
  const [isIntakeExpanded, setIsIntakeExpanded] = useState(true);

  const messageEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Fetch conversations via TanStack Query
  const { data: conversations, isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ['conversations', tenantId],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/conversations');
      if (!res.ok) throw new Error('Failed to load conversations');
      return res.json();
    },
    enabled: !!tenantId,
  });

  // 2. Fetch messages for selected conversation
  const { data: messages, isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ['messages', selectedConvId],
    queryFn: async () => {
      if (!selectedConvId) return [];
      const res = await fetch(`/api/chat/messages?conversationId=${selectedConvId}`);
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json();
    },
    enabled: !!selectedConvId,
  });

  // 3. Fetch pre-approved templates
  const { data: templates } = useQuery<Template[]>({
    queryKey: ['templates', tenantId],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/templates');
      if (!res.ok) throw new Error('Failed to load templates');
      return res.json();
    },
    enabled: !!tenantId,
  });

  // 4. Send reply mutation
  const sendReplyMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedConvId || !tenantId) return;
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedConvId, to: selectedConv?.customer.phone, text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to send message');
      }
      return res.json();
    },
    onSuccess: () => {
      setReplyText('');
      setShowTemplatesDropdown(false);
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', tenantId] });
    },
  });

  // 5. Toggle AI Handling vs Agent Takeover mutation
  const toggleHandlerMutation = useMutation({
    mutationFn: async (needsEscalation: boolean) => {
      if (!selectedConvId) return;
      const res = await fetch('/api/dashboard/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedConvId, needsEscalation }),
      });
      if (!res.ok) {
        throw new Error('Failed to toggle AI/Agent handling.');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', tenantId] });
    },
  });

  // 6. Socket.io Live Setup
  useEffect(() => {
    if (!tenantId) return;

    const socketInstance = io('http://localhost:3001', {
      query: { tenantId },
    });

    socketInstance.on('new_message', (data: { conversationId: string; message: Message }) => {
      console.log('[Socket] New message event received:', data);

      if (data.conversationId === selectedConvId) {
        queryClient.setQueryData<Message[]>(['messages', selectedConvId], (old = []) => {
          if (old.some((m) => m.id === data.message.id)) return old;
          return [...old, data.message];
        });
      }

      queryClient.invalidateQueries({ queryKey: ['conversations', tenantId] });
    });

    socketInstance.on('whatsapp_status_update', () => {
      queryClient.invalidateQueries({ queryKey: ['tenantInfo'] });
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [tenantId, selectedConvId, queryClient]);

  // Click outside listener for templates dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTemplatesDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll message stream to bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sendReplyMutation.isPending) return;
    sendReplyMutation.mutate(replyText);
  };

  const selectedConv = conversations?.find((c) => c.id === selectedConvId);

  // Time remaining helper for WhatsApp 24h Customer Service Window
  const getSessionWindowData = (lastInboundMessageAt: string | null) => {
    if (!lastInboundMessageAt) return { isClosed: true, text: 'Expired', hoursRemaining: 0, msRemaining: 0 };
    const lastInboundTime = new Date(lastInboundMessageAt).getTime();
    const elapsedMs = Date.now() - lastInboundTime;
    const windowMs = 24 * 60 * 60 * 1000; // 24 hours
    const remainingMs = windowMs - elapsedMs;

    if (remainingMs <= 0) {
      return { isClosed: true, text: 'Expired', hoursRemaining: 0, msRemaining: 0 };
    }

    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      isClosed: false,
      text: `${hours}h ${mins}m`,
      hoursRemaining: hours,
      msRemaining: remainingMs,
    };
  };

  // Format relative timestamp helper
  const getRelativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTimeString = (dateInput: string | Date) => {
    const date = new Date(dateInput);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours.toString().padStart(2, '0');
    return `${hoursStr}:${minutes} ${ampm}`;
  };

  // Client-Side Tab & Search Filtering
  const filteredConversations = conversations?.filter((conv) => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const nameMatch = conv.customer.displayName.toLowerCase().includes(query);
      const phoneMatch = conv.customer.phone.toLowerCase().includes(query);
      if (!nameMatch && !phoneMatch) return false;
    }

    // 2. Tab selection
    if (activeTab === 'CLOSED') return conv.status === 'CLOSED';
    if (conv.status === 'CLOSED') return false; // Hide closed from active lists

    if (activeTab === 'UNREAD') {
      // Unread means the last message in the thread is inbound (from the customer)
      return conv.lastInboundMessageAt === conv.lastMessageAt;
    }
    if (activeTab === 'AI') return !conv.needsEscalation;
    if (activeTab === 'ESCALATED') return conv.needsEscalation;
    if (activeTab === 'PENDING') return conv.status === 'PENDING';

    return true;
  });

  const sessionWindow = selectedConv ? getSessionWindowData(selectedConv.lastInboundMessageAt) : null;
  const isSessionClosed = sessionWindow?.isClosed ?? true;
  const showWarningBanner = !isSessionClosed && sessionWindow!.msRemaining < 6 * 60 * 60 * 1000;

  return (
    <div className="h-[calc(100vh-140px)] border border-[#c3c6d7] bg-white rounded-2xl overflow-hidden flex font-sans text-[#1c1b1f] shadow-sm">
      {/* COLUMN 2: Conversation List */}
      <section className="w-[340px] flex flex-col border-r border-[#c3c6d7] bg-white shrink-0">
        {/* Search */}
        <div className="p-4 border-b border-[#c3c6d7]/60 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#1c1b1f]">Inbox</h2>
            <span className="text-[10px] bg-slate-100 text-[#49454f] font-bold px-2 py-0.5 rounded-full border border-[#c3c6d7]/50">
              {conversations?.length || 0} chats
            </span>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686] text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-[#c3c6d7] rounded-lg focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 text-xs"
            />
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex px-2 border-b border-[#c3c6d7]/60 overflow-x-auto shrink-0 scrollbar-none">
          {(['ALL', 'UNREAD', 'AI', 'ESCALATED', 'PENDING', 'CLOSED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-3 text-xs font-semibold border-b-2 capitalize whitespace-nowrap transition-colors',
                activeTab === tab
                  ? 'border-[#004ac6] text-[#004ac6]'
                  : 'border-transparent text-[#737686] hover:text-[#1c1b1f]'
              )}
            >
              {tab === 'AI' ? 'AI Handling' : tab.toLowerCase()}
            </button>
          ))}
        </div>

        {/* Conversation List Stream */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#c3c6d7]/40">
          {convsLoading ? (
            <div className="space-y-4 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-slate-100 rounded-full animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                    <div className="h-2.5 w-32 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : !filteredConversations || filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-[#737686] text-xs">
              No conversations matched.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === selectedConvId;
              const initials = conv.customer.displayName.substring(0, 2).toUpperCase();
              const winData = getSessionWindowData(conv.lastInboundMessageAt);
              const timerIsRed = !winData.isClosed && winData.msRemaining < 2 * 60 * 60 * 1000;

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={cn(
                    'w-full p-4 text-left flex items-start gap-3 transition-colors border-l-4 relative',
                    isSelected
                      ? 'bg-[#004ac6]/5 border-[#004ac6] text-[#004ac6]'
                      : 'hover:bg-slate-50/50 border-transparent text-[#49454f]'
                  )}
                >
                  {/* Status Badge in corner */}
                  <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    <span className={cn(
                      "px-1.5 py-0.5 text-[9px] rounded font-bold uppercase tracking-wider",
                      conv.needsEscalation 
                        ? "bg-amber-100 text-amber-800 border border-amber-200" 
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    )}>
                      {conv.needsEscalation ? 'Agent' : 'AI'}
                    </span>
                  </div>

                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                    isSelected ? "bg-[#004ac6]/10 text-[#004ac6]" : "bg-slate-100 text-[#49454f] border border-[#c3c6d7]/50"
                  )}>
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1 pr-12">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "font-bold text-xs truncate",
                        isSelected ? "text-[#004ac6]" : "text-[#1c1b1f]"
                      )}>
                        {conv.customer.displayName}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#49454f] truncate mt-0.5 font-medium">
                      {conv.lastMessagePreview || "No messages yet"}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] text-[#737686] font-medium">
                        +{conv.customer.phone}
                      </span>
                      <span className="text-[#c3c6d7] text-[10px]">•</span>
                      <span className="text-[9px] text-[#737686] font-medium">
                        {getRelativeTime(conv.lastMessageAt)}
                      </span>
                      <span className="text-[#c3c6d7] text-[10px]">•</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-0.5 border",
                        winData.isClosed 
                          ? "bg-slate-100 border-slate-200 text-slate-400"
                          : timerIsRed 
                          ? "bg-rose-50 border-rose-200 text-rose-700 animate-pulse" 
                          : "bg-emerald-50 border-emerald-250 text-emerald-800"
                      )}>
                        <span className="material-symbols-outlined text-[10px]">schedule</span>
                        {winData.isClosed ? 'Expired' : winData.text}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* COLUMN 3: Chat Thread */}
      <section className="flex-1 flex flex-col bg-slate-50/10 min-w-0">
        {selectedConvId ? (
          <>
            {/* Thread Header */}
            <header className="h-16 flex items-center justify-between px-6 border-b border-[#c3c6d7] bg-white sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[#004ac6]/10 text-[#004ac6] flex items-center justify-center font-bold text-xs shrink-0">
                  {selectedConv?.customer.displayName.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-xs text-[#1c1b1f] leading-none truncate">
                    {selectedConv?.customer.displayName}
                  </h3>
                  <span className="text-[10px] text-[#737686] mt-1 block">
                    +{selectedConv?.customer.phone}
                  </span>
                </div>
              </div>

              {/* AI/Agent Handling Toggle Switch */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-slate-50 border border-[#c3c6d7] p-1 rounded-lg">
                  <button
                    onClick={() => {
                      if (selectedConv?.needsEscalation) toggleHandlerMutation.mutate(false);
                    }}
                    className={cn(
                      "px-3 py-1 rounded text-[9px] font-bold transition-all",
                      !selectedConv?.needsEscalation
                        ? "bg-[#004ac6] text-white shadow-sm"
                        : "text-[#49454f] hover:text-[#1c1b1f]"
                    )}
                  >
                    AI Handling
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedConv?.needsEscalation) toggleHandlerMutation.mutate(true);
                    }}
                    className={cn(
                      "px-3 py-1 rounded text-[9px] font-bold transition-all",
                      selectedConv?.needsEscalation
                        ? "bg-amber-500 text-white shadow-sm"
                        : "text-[#49454f] hover:text-[#1c1b1f]"
                    )}
                  >
                    Agent Takeover
                  </button>
                </div>
              </div>
            </header>

            {/* Warning Session Banner */}
            {showWarningBanner && (
              <div className="bg-amber-50 border-b border-amber-250 text-amber-900 px-6 py-2 flex items-center gap-2 text-xs font-semibold shrink-0">
                <span className="material-symbols-outlined text-[16px] text-amber-700 animate-pulse">report</span>
                <span>Session window expires in {sessionWindow?.text}. Reply using a standard message now to maintain the channel.</span>
              </div>
            )}

            {/* Message Thread logs */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f9f9ff]">
              <div className="flex justify-center mb-2">
                <span className="px-3 py-1 bg-slate-100 text-[#737686] text-[9px] rounded-full font-bold uppercase tracking-wider border border-[#c3c6d7]/30">
                  Today
                </span>
              </div>

              {msgsLoading ? (
                <div className="flex flex-col justify-center items-center h-full text-xs text-[#737686] animate-pulse">
                  Loading message logs...
                </div>
              ) : (
                messages?.map((msg) => {
                  const isOutbound = msg.direction === 'OUTBOUND';
                  return (
                    <div key={msg.id} className="flex flex-col">
                      <div
                        className={cn(
                          'flex flex-col max-w-[70%] rounded-2xl p-4 text-xs leading-relaxed shadow-sm border',
                          isOutbound
                            ? 'ml-auto bg-[#004ac6] border-[#004ac6] text-white rounded-tr-none'
                            : 'bg-white border-[#c3c6d7]/70 text-[#1c1b1f] rounded-tl-none'
                        )}
                      >
                        <p className="break-words font-medium">{msg.content}</p>
                        <div className="flex items-center justify-end gap-1 mt-2">
                          <span
                            suppressHydrationWarning
                            className={cn(
                              "text-[8px] leading-none",
                              isOutbound ? "text-white/70" : "text-[#737686]"
                            )}
                          >
                            {formatTimeString(msg.createdAt)}
                          </span>
                          {isOutbound && (
                            <span className="material-symbols-outlined text-[12px] text-white/70">
                              done_all
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messageEndRef} />
            </div>

            {/* Message Composer */}
            <footer className="p-4 bg-white border-t border-[#c3c6d7] space-y-4 shrink-0">
              <form onSubmit={handleSend} className="flex items-center gap-3">
                <button
                  type="button"
                  className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-[#49454f]"
                >
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                </button>
                <button
                  type="button"
                  className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-[#49454f]"
                >
                  <span className="material-symbols-outlined text-[20px]">mood</span>
                </button>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    required
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={sendReplyMutation.isPending || (isSessionClosed && !showTemplatesDropdown)}
                    placeholder={
                      isSessionClosed
                        ? 'WhatsApp session is closed. Select a Template to reply...'
                        : 'Type your reply here...'
                    }
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-[#c3c6d7] rounded-full focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 text-xs disabled:opacity-75"
                  />
                  <button
                    type="submit"
                    disabled={sendReplyMutation.isPending || !replyText.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#004ac6] hover:brightness-95 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px] font-bold">send</span>
                  </button>
                </div>
              </form>

              <div className="flex items-center justify-between" ref={dropdownRef}>
                <div className="flex gap-3 relative">
                  {/* Templates Button: active only when session is closed */}
                  <button
                    type="button"
                    onClick={() => setShowTemplatesDropdown(!showTemplatesDropdown)}
                    disabled={!isSessionClosed}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-bold border transition-colors',
                      !isSessionClosed
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-[#004ac6]/5 border-[#004ac6]/20 text-[#004ac6] hover:bg-[#004ac6]/10'
                    )}
                  >
                    <span className="material-symbols-outlined text-[14px]">description</span>
                    Templates
                  </button>

                  {/* Templates Dropdown Overlay */}
                  {showTemplatesDropdown && (
                    <div className="absolute bottom-12 left-0 w-64 bg-white border border-[#c3c6d7] rounded-2xl shadow-xl z-50 overflow-hidden">
                      <div className="px-4 py-2 bg-slate-50 border-b border-[#c3c6d7] text-[10px] font-bold text-[#49454f] uppercase tracking-wide">
                        Approved WhatsApp Templates
                      </div>
                      <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {!templates || templates.length === 0 ? (
                          <div className="p-4 text-center text-xs text-[#737686]">
                            No templates configured.
                          </div>
                        ) : (
                          templates.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setReplyText(t.content);
                                setShowTemplatesDropdown(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-slate-50 text-xs font-semibold text-[#1c1b1f] flex flex-col gap-0.5"
                            >
                              <span>{t.name}</span>
                              <span className="text-[10px] text-[#737686] font-medium truncate w-full">
                                {t.content}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-[#c3c6d7] rounded-xl text-[10px] font-bold text-[#49454f] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">attach_file</span>
                    Internal Note
                  </button>
                </div>
                <div className="text-[9px] text-[#737686] font-semibold italic">
                  Message will be sent as supportive tenant representative
                </div>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <span className="material-symbols-outlined text-[48px] text-[#737686] mb-4">
              forum
            </span>
            <h4 className="text-xs font-bold text-[#1c1b1f]">No Chat Selected</h4>
            <p className="text-[11px] text-[#49454f] max-w-xs mt-1 leading-relaxed">
              Select an active conversation thread from the left menu to view logs, toggle automatic AI filters, and send manual replies.
            </p>
          </div>
        )}
      </section>

      {/* COLUMN 4: Customer Profile */}
      {selectedConvId && selectedConv?.customer && (
        <section className="w-72 border-l border-[#c3c6d7] bg-white flex flex-col shrink-0">
          {/* Avatar & Name */}
          <div className="p-6 flex flex-col items-center text-center border-b border-[#c3c6d7]/60">
            <div className="w-16 h-16 rounded-full bg-[#004ac6]/10 text-[#004ac6] border-2 border-[#004ac6]/20 flex items-center justify-center font-bold text-xl mb-3 shadow-inner">
              {selectedConv.customer.displayName.substring(0, 2).toUpperCase()}
            </div>
            <h4 className="font-bold text-xs text-[#1c1b1f] leading-tight">
              {selectedConv.customer.displayName}
            </h4>
            <p className="text-[10px] text-[#737686] mt-1">
              +{selectedConv.customer.phone}
            </p>
            <span className="inline-block mt-3 px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 text-[8px] font-bold rounded-full uppercase tracking-wider">
              {selectedConv.customer.pipelineStage.replace('_', ' ').toLowerCase()}
            </span>
          </div>

          {/* Collapsible Intake Answers */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="space-y-3">
              <button
                onClick={() => setIsIntakeExpanded(!isIntakeExpanded)}
                className="w-full flex items-center justify-between text-[10px] font-bold text-[#49454f] uppercase tracking-wider"
              >
                <span>Intake Answers</span>
                <span className="material-symbols-outlined text-[16px]">
                  {isIntakeExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                </span>
              </button>

              {isIntakeExpanded && (
                <div className="bg-slate-50 border border-[#c3c6d7]/40 rounded-xl p-4 space-y-4">
                  {selectedConv.customer.intake ? (
                    <>
                      <div>
                        <span className="text-[9px] text-[#737686] font-bold uppercase tracking-wider">Age</span>
                        <p className="text-xs font-semibold text-[#1c1b1f] mt-0.5">
                          {selectedConv.customer.intake.age || 'Not specified'} years
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#737686] font-bold uppercase tracking-wider">State Region</span>
                        <p className="text-xs font-semibold text-[#1c1b1f] mt-0.5">
                          {selectedConv.customer.intake.state || 'Not specified'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#737686] font-bold uppercase tracking-wider">Monthly Budget</span>
                        <p className="text-xs font-semibold text-[#1c1b1f] mt-0.5">
                          {selectedConv.customer.intake.budgetMin && selectedConv.customer.intake.budgetMax
                            ? `$${selectedConv.customer.intake.budgetMin} - $${selectedConv.customer.intake.budgetMax} / mo`
                            : 'Not specified'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#737686] font-bold uppercase tracking-wider">Family size</span>
                        <p className="text-xs font-semibold text-[#1c1b1f] mt-0.5">
                          {selectedConv.customer.intake.familySize || '1'} member(s)
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#737686] font-bold uppercase tracking-wider">Health Conditions</span>
                        <p className="text-xs font-semibold text-[#1c1b1f] mt-0.5 leading-relaxed">
                          {selectedConv.customer.intake.healthConditions}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] text-[#737686] italic text-center py-2">
                      No intake answers logged yet.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Full Profile Link Footer */}
          <div className="p-4 border-t border-[#c3c6d7]/60">
            <a
              href="/dashboard/leads"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-[#004ac6] hover:brightness-105 text-white font-bold rounded-xl text-[10px] transition-colors"
            >
              View Full Profile
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
