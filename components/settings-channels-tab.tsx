'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { 
  Phone, 
  QrCode, 
  Smartphone, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ShieldCheck, 
  Power,
  Sliders,
  Sparkles
} from 'lucide-react';

type ConnectMethod = 'QR' | 'PHONE';
type EngineType = 'BAILEYS' | 'OPENWA';

interface SettingsChannelsTabProps {
  tenantId?: string;
}

interface WhatsAppStatus {
  status: string;
  phoneNumber?: string;
}

export default function SettingsChannelsTab({ tenantId }: SettingsChannelsTabProps) {
  const queryClient = useQueryClient();

  const [engine, setEngine] = useState<EngineType>('BAILEYS');
  const [connectMethod, setConnectMethod] = useState<ConnectMethod>('QR');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [phoneAlias, setPhoneAlias] = useState('+1 (555) 019-2834 (Prime Marketing Main Line)');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Fetch current WhatsApp status from database
  const { data: waStatus, refetch: refetchStatus } = useQuery<WhatsAppStatus>({
    queryKey: ['whatsappStatus', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenantId');
      const res = await fetch('/api/whatsapp/status');
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 10000,
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll engine for QR code every 2s after initiating
  const startQrPolling = useCallback((tid: string) => {
    stopPolling();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 25) {
        stopPolling();
        setConnecting(false);
        setStatusMsg('Timed out waiting for QR code. Please try again.');
        return;
      }
      try {
        const res = await fetch('/api/whatsapp/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: tid, engine, method: 'QR' }),
        });
        const data = await res.json();
        if (data.qr) {
          setQrCode(data.qr);
          setConnecting(false);
          setStatusMsg('');
          stopPolling();
        }
      } catch {
        // Engine preparing...
      }
    }, 2000);
  }, [engine, stopPolling]);

  // Setup Socket.io listener
  useEffect(() => {
    if (!tenantId) return;

    const socket = io('http://localhost:3001', {
      query: { tenantId },
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('whatsapp_qr', (data: { qr: string }) => {
      setQrCode(data.qr);
      setPairingCode(null);
      setConnecting(false);
      setStatusMsg('');
      stopPolling();
    });

    socket.on('whatsapp_pairing_code', (data: { pairingCode: string }) => {
      setPairingCode(data.pairingCode);
      setQrCode(null);
      setConnecting(false);
      setStatusMsg('');
      stopPolling();
    });

    socket.on('whatsapp_status', (data: { status: string; phoneNumber?: string }) => {
      if (data.status === 'CONNECTED') {
        setQrCode(null);
        setPairingCode(null);
        setConnecting(false);
        stopPolling();
        queryClient.setQueryData<WhatsAppStatus>(['whatsappStatus', tenantId], () => ({
          status: 'CONNECTED',
          phoneNumber: data.phoneNumber,
        }));
        refetchStatus();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      stopPolling();
    };
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Disconnect Mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to disconnect');
      return res.json();
    },
    onSuccess: () => {
      setQrCode(null);
      setPairingCode(null);
      stopPolling();
      queryClient.setQueryData<WhatsAppStatus>(['whatsappStatus', tenantId], () => ({ status: 'DISCONNECTED' }));
    },
  });

  const handleConnect = async () => {
    if (!tenantId) return;

    if (connectMethod === 'PHONE') {
      const clean = phoneInput.replace(/[^0-9]/g, '');
      if (clean.length < 7) {
        setPhoneError('Enter valid phone number with country code (e.g. 15550192834)');
        return;
      }
      setPhoneError('');
      setConnecting(true);
      setStatusMsg('Requesting pairing code from WhatsApp engine...');
      try {
        const res = await fetch('/api/whatsapp/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, engine, method: 'PHONE', phoneNumber: clean }),
        });
        const data = await res.json();
        if (data.pairingCode) {
          setPairingCode(data.pairingCode);
          setConnecting(false);
          setStatusMsg('');
        }
      } catch {
        setConnecting(false);
        setStatusMsg('Engine offline. Please ensure whatsapp-engine service is running.');
      }
      return;
    }

    // QR method
    setConnecting(true);
    setQrCode(null);
    setStatusMsg('Initializing WhatsApp connection engine...');
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, engine, method: 'QR' }),
      });
      startQrPolling(tenantId);
    } catch {
      setConnecting(false);
      setStatusMsg('Failed to connect to engine.');
    }
  };

  const isConnected = waStatus?.status === 'CONNECTED';

  return (
    <div className="space-y-6">
      {/* Top Banner Status */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-2xl ${isConnected ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#1c1b1f]">WhatsApp Business API Channel</h3>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isConnected ? '● CONNECTED' : '○ DISCONNECTED'}
              </span>
            </div>
            <p className="text-xs text-[#49454f] mt-1">
              {isConnected
                ? `Active WhatsApp line: ${waStatus?.phoneNumber || '+1 (555) 019-2834'} • Quality Tier 1 (1,000 msgs/24h)`
                : 'Connect your agency WhatsApp phone number to enable automated sales AI auto-replies.'}
            </p>
          </div>
        </div>

        {isConnected ? (
          <button
            type="button"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 shadow-sm flex items-center gap-2 transition shrink-0"
          >
            <Power className="w-4 h-4" />
            {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect Line'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="px-6 py-2.5 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${connecting ? 'animate-spin' : ''}`} />
            {connecting ? 'Initializing...' : 'Connect WhatsApp'}
          </button>
        )}
      </div>

      {/* Engine Selection & Connection Controls Card */}
      {!isConnected && (
        <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
          <h4 className="text-sm font-bold text-[#1B4B91] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#004ac6]" />
            Engine Selector & Connection Options
          </h4>

          {/* Engine Choice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setEngine('BAILEYS')}
              className={`p-4 rounded-xl border text-left transition ${
                engine === 'BAILEYS'
                  ? 'border-[#004ac6] bg-blue-50/50 ring-2 ring-[#004ac6]/20'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#1c1b1f]">Baileys (Direct WebSockets)</span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Recommended</span>
              </div>
              <p className="text-[11px] text-[#49454f]">High performance, lightweight socket engine. No Chromium overhead.</p>
            </button>

            <button
              type="button"
              onClick={() => setEngine('OPENWA')}
              className={`p-4 rounded-xl border text-left transition ${
                engine === 'OPENWA'
                  ? 'border-[#004ac6] bg-blue-50/50 ring-2 ring-[#004ac6]/20'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#1c1b1f]">OpenWA (Chromium Engine)</span>
                <span className="text-[10px] font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded-full">Browser Mode</span>
              </div>
              <p className="text-[11px] text-[#49454f]">Headless Chromium browser session with full web features.</p>
            </button>
          </div>

          {/* Connect Method Toggles */}
          <div className="flex items-center gap-4 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setConnectMethod('QR')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                connectMethod === 'QR' ? 'bg-[#1B4B91] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              QR Code Scanner
            </button>

            <button
              type="button"
              onClick={() => setConnectMethod('PHONE')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                connectMethod === 'PHONE' ? 'bg-[#1B4B91] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              8-Digit Phone Pairing Code
            </button>
          </div>

          {/* QR Code Container */}
          {connectMethod === 'QR' && qrCode && (
            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center space-y-3">
              <p className="text-xs font-bold text-[#1c1b1f]">Scan QR Code with WhatsApp on your phone:</p>
              <div className="p-3 bg-white rounded-xl shadow-inner border border-gray-200">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-52 h-52 object-contain" />
              </div>
              <p className="text-[11px] text-gray-500">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
            </div>
          )}

          {/* Pairing Code Container */}
          {connectMethod === 'PHONE' && (
            <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-gray-700">Enter WhatsApp Phone Number with Country Code:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 15550192834"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:border-[#004ac6]"
                />
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-4 py-2 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-lg transition"
                >
                  Get Pairing Code
                </button>
              </div>
              {phoneError && <p className="text-xs text-rose-600 font-semibold">{phoneError}</p>}
              {pairingCode && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-1">
                  <p className="text-xs text-emerald-800 font-medium">Enter this pairing code in WhatsApp:</p>
                  <p className="text-2xl font-mono font-extrabold text-emerald-900 tracking-widest">{pairingCode}</p>
                </div>
              )}
            </div>
          )}

          {statusMsg && <p className="text-xs text-blue-800 font-semibold bg-blue-50 p-3 rounded-lg border border-blue-200">{statusMsg}</p>}
        </div>
      )}

      {/* Phone Alias & Display Settings */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4">
        <h4 className="text-sm font-bold text-[#1B4B91] flex items-center gap-2">
          <Phone className="w-4 h-4 text-[#004ac6]" />
          Phone Line Alias & Outbound Messaging Label
        </h4>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Display Alias Label</label>
          <input
            type="text"
            value={phoneAlias}
            onChange={(e) => setPhoneAlias(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:border-[#004ac6]"
          />
          <p className="text-[11px] text-gray-500 mt-1">This label appears on internal lead logs and broadcast headers.</p>
        </div>
      </div>
    </div>
  );
}
