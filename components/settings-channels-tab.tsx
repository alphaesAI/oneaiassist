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

function InstagramIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

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
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaVerifyToken, setMetaVerifyToken] = useState('oneai_meta_verify_secret_123');
  const [metaSaveSuccess, setMetaSaveSuccess] = useState(false);
  const [phoneAlias, setPhoneAlias] = useState('+1 (555) 019-2834 (Prime Marketing Main Line)');

  // Instagram Channel States
  const [igId, setIgId] = useState('');
  const [igUsername, setIgUsername] = useState('');
  const [igPageId, setIgPageId] = useState('');
  const [igAccessToken, setIgAccessToken] = useState('');
  const [igSaveSuccess, setIgSaveSuccess] = useState(false);
  const [igError, setIgError] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Fetch Meta Cloud config on mount
  useEffect(() => {
    if (tenantId) {
      fetch('/api/whatsapp/meta-config')
        .then((res) => res.json())
        .then((data) => {
          if (data.provider === 'META_CLOUD_API') {
            setEngine('META_CLOUD_API' as any);
          }
          if (data.metaPhoneNumberId) setMetaPhoneId(data.metaPhoneNumberId);
          if (data.metaWabaId) setMetaWabaId(data.metaWabaId);
          if (data.metaAccessToken) setMetaAccessToken(data.metaAccessToken);
          if (data.metaVerifyToken) setMetaVerifyToken(data.metaVerifyToken);
        })
        .catch(() => {});
    }
  }, [tenantId]);

  // Mutation to save Meta Cloud credentials
  const saveMetaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/whatsapp/meta-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'META_CLOUD_API',
          metaPhoneNumberId: metaPhoneId,
          metaWabaId,
          metaAccessToken,
          metaVerifyToken,
        }),
      });
      if (!res.ok) throw new Error('Failed to save Meta credentials');
      return res.json();
    },
    onSuccess: () => {
      setMetaSaveSuccess(true);
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['whatsappStatus', tenantId] });
      setTimeout(() => setMetaSaveSuccess(false), 4000);
    },
  });

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

  // Fetch Instagram Channel status
  const { data: igStatus, refetch: refetchIgStatus } = useQuery<{
    connected: boolean;
    instagramId?: string;
    username?: string;
    pageId?: string;
    status: string;
  }>({
    queryKey: ['instagramStatus', tenantId],
    queryFn: async () => {
      const res = await fetch('/api/channels/instagram');
      return res.json();
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (igStatus?.connected) {
      if (igStatus.instagramId) setIgId(igStatus.instagramId);
      if (igStatus.username) setIgUsername(igStatus.username);
      if (igStatus.pageId) setIgPageId(igStatus.pageId);
    }
  }, [igStatus]);

  const saveIgMutation = useMutation({
    mutationFn: async () => {
      setIgError('');
      const res = await fetch('/api/channels/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagramId: igId,
          username: igUsername,
          pageId: igPageId,
          pageAccessToken: igAccessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save Instagram account');
      return data;
    },
    onSuccess: () => {
      setIgSaveSuccess(true);
      refetchIgStatus();
      queryClient.invalidateQueries({ queryKey: ['instagramStatus', tenantId] });
      setTimeout(() => setIgSaveSuccess(false), 4000);
    },
    onError: (err: any) => {
      setIgError(err.message || 'Error saving Instagram credentials');
    },
  });

  const disconnectIgMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/channels/instagram', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect Instagram');
      return res.json();
    },
    onSuccess: () => {
      refetchIgStatus();
      setIgId('');
      setIgUsername('');
      setIgPageId('');
      setIgAccessToken('');
      queryClient.invalidateQueries({ queryKey: ['instagramStatus', tenantId] });
    },
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

          {/* Provider Engine Choice */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <span className="text-xs font-bold text-[#1c1b1f]">Baileys (WebSockets)</span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">QR Web</span>
              </div>
              <p className="text-[11px] text-[#49454f]">High performance, lightweight socket engine. Fast QR pair.</p>
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
                <span className="text-xs font-bold text-[#1c1b1f]">OpenWA (Chromium)</span>
                <span className="text-[10px] font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded-full">Headless</span>
              </div>
              <p className="text-[11px] text-[#49454f]">Headless Chromium session with full web browser features.</p>
            </button>

            <button
              type="button"
              onClick={() => setEngine('META_CLOUD_API' as any)}
              className={`p-4 rounded-xl border text-left transition ${
                (engine as any) === 'META_CLOUD_API'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#1c1b1f]">Meta Cloud API</span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">Official API</span>
              </div>
              <p className="text-[11px] text-[#49454f]">Official Meta Graph REST API (WhatsApp Business Account).</p>
            </button>
          </div>

          {/* Meta Cloud API Form Container */}
          {(engine as any) === 'META_CLOUD_API' ? (
            <div className="space-y-4 p-5 bg-emerald-50/50 rounded-xl border border-emerald-200">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Meta WhatsApp Business Cloud API Credentials
                </h5>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                  Graph API v21.0
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Meta Phone Number ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 109876543210987"
                    value={metaPhoneId}
                    onChange={(e) => setMetaPhoneId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    WhatsApp Business Account ID (WABA ID)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 987654321098765"
                    value={metaWabaId}
                    onChange={(e) => setMetaWabaId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Permanent System User Access Token <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  placeholder="EAAG..."
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Webhook Verification Token <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={metaVerifyToken}
                    onChange={(e) => setMetaVerifyToken(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Webhook Callback URL (Meta App Dashboard)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value="https://oneai.drgodly.com/api/webhook/meta"
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-xs font-mono text-slate-700"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => saveMetaMutation.mutate()}
                  disabled={saveMetaMutation.isPending || !metaPhoneId || !metaAccessToken}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 transition flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {saveMetaMutation.isPending ? 'Saving & Testing...' : 'Save & Connect Meta Cloud Line'}
                </button>

                {metaSaveSuccess && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-300 flex items-center gap-1.5 animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Meta Credentials Saved & Line Connected!
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

          {statusMsg && <p className="text-xs text-blue-800 font-semibold bg-blue-50 p-3 rounded-lg border border-blue-200">{statusMsg}</p>}
        </div>
      )}

      {/* Instagram Direct Messaging Gateway Card */}
      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
              <InstagramIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-[#1c1b1f]">Instagram Direct Messages</h4>
                {igStatus?.connected ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Connected {igStatus.username ? `(@${igStatus.username})` : ''}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-[#49454f] mt-0.5">
                Connect your Instagram Professional / Creator account to let the AI Agent reply to incoming DMs automatically.
              </p>
            </div>
          </div>
          {igStatus?.connected && (
            <button
              type="button"
              onClick={() => disconnectIgMutation.mutate()}
              disabled={disconnectIgMutation.isPending}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 border border-rose-200 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition"
            >
              {disconnectIgMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </div>

        {/* Credentials Form */}
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Instagram Business Account ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={igId}
                onChange={(e) => setIgId(e.target.value)}
                placeholder="e.g. 17841400000000000"
                className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#004ac6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Instagram Handle / Username
              </label>
              <input
                type="text"
                value={igUsername}
                onChange={(e) => setIgUsername(e.target.value)}
                placeholder="e.g. @your_agency_official"
                className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#004ac6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Connected Facebook Page ID
              </label>
              <input
                type="text"
                value={igPageId}
                onChange={(e) => setIgPageId(e.target.value)}
                placeholder="e.g. 102938475610293"
                className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#004ac6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Page Access Token (Encrypted AES-256) <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={igAccessToken}
                onChange={(e) => setIgAccessToken(e.target.value)}
                placeholder={igStatus?.connected ? "••••••••••••••••••••••••" : "EAAB..."}
                className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#004ac6] focus:bg-white"
              />
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-[11px] text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
              Meta Platform Policy & In-App Requirement:
            </p>
            <p>
              1. Inside your Instagram mobile app: <strong>Settings & Privacy ➔ Messages & Story Replies ➔ Message Controls ➔ Connected Tools ➔ Toggle ON "Allow Access to Messages"</strong>.
            </p>
            <p>
              2. Outbound AI responses are strictly permitted within <strong>24 hours</strong> of the customer&apos;s last DM.
            </p>
          </div>

          {igError && <p className="text-xs text-rose-600 font-semibold">{igError}</p>}
          {igSaveSuccess && (
            <p className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 font-bold">
              ✓ Instagram credentials securely saved and encrypted! Inbound DMs are now active.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => saveIgMutation.mutate()}
              disabled={saveIgMutation.isPending || !igId || (!igAccessToken && !igStatus?.connected)}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50"
            >
              {saveIgMutation.isPending ? 'Connecting...' : 'Save & Connect Instagram'}
            </button>
          </div>
        </div>
      </div>

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
