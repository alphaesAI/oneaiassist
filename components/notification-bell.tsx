'use client';

import React, { useState, useRef, useEffect } from 'react';

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'info' | 'warning' | 'success';
  read: boolean;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'New Lead Captured',
      description: 'Marcus Thorne has completed WhatsApp intake profiling.',
      time: '5m ago',
      type: 'success',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'AI Trial Cap Warning',
      description: 'You are using platform trial keys. Connect custom keys to lift limits.',
      time: '1h ago',
      type: 'warning',
      read: false,
    },
    {
      id: 'notif-3',
      title: 'WhatsApp Disconnected',
      description: 'WhatsApp number integration is currently inactive.',
      time: '3h ago',
      type: 'info',
      read: false,
    },
  ]);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const toggleDropdown = () => setIsOpen(!isOpen);

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative font-sans text-left" ref={dropdownRef}>
      {/* Bell Icon Trigger */}
      <button
        suppressHydrationWarning
        onClick={toggleDropdown}
        className="h-10 w-10 hover:bg-slate-100 rounded-full flex items-center justify-center text-[#49454f] relative transition-colors focus:outline-none"
      >
        <span className="material-symbols-outlined text-[22px]">
          notifications
        </span>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-[#004ac6] border-2 border-white rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Container */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-[#c3c6d7] rounded-2xl shadow-xl z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-[#c3c6d7] flex items-center justify-between">
            <span className="text-xs font-bold text-[#1c1b1f]">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] font-bold text-[#004ac6] hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="divide-y divide-[#c3c6d7]/60 max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#737686]">
                No notifications found.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`p-4 flex gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors ${
                    !n.read ? 'bg-slate-50/30' : ''
                  }`}
                >
                  {/* Status Indicator Dot */}
                  <div className="shrink-0 mt-1">
                    {n.type === 'success' && (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 block" />
                    )}
                    {n.type === 'warning' && (
                      <span className="h-2 w-2 rounded-full bg-amber-500 block animate-pulse" />
                    )}
                    {n.type === 'info' && (
                      <span className="h-2 w-2 rounded-full bg-blue-500 block" />
                    )}
                  </div>

                  {/* Body Text */}
                  <div className="flex-1 space-y-0.5">
                    <div className="flex justify-between items-baseline">
                      <h4 className={`text-xs ${!n.read ? 'font-bold text-[#1c1b1f]' : 'font-medium text-[#49454f]'}`}>
                        {n.title}
                      </h4>
                      <span className="text-[9px] text-[#737686] font-medium">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-[#49454f] leading-relaxed">
                      {n.description}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-slate-50 border-t border-[#c3c6d7] text-center">
            <span className="text-[9px] font-extrabold text-[#737686] uppercase tracking-wide">
              Recent Alerts
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
