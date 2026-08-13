'use client';

import React, { useState } from 'react';
import SettingsChannelsTab from '@/components/settings-channels-tab';
import SettingsBrandingTab from '@/components/settings-branding-tab';
import { 
  Phone, 
  Users, 
  Building2, 
  Mail, 
  Shield, 
  UserPlus, 
  UserCheck 
} from 'lucide-react';

interface Teammate {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT';
  status: 'ACTIVE' | 'PENDING';
}

export default function SettingsWorkspaceTab({ tenantId }: { tenantId?: string }) {
  const [subTab, setSubTab] = useState<'channels' | 'team' | 'branding'>('channels');
  
  // Teammates mock state for Team & Roles management
  const [teammates, setTeammates] = useState<Teammate[]>([
    { id: '1', name: 'Saran Kumar', email: 'saran@primemarketing.com', role: 'ADMIN', status: 'ACTIVE' },
    { id: '2', name: 'Sarah Miller', email: 'sarah.m@primemarketing.com', role: 'MANAGER', status: 'ACTIVE' },
    { id: '3', name: 'Alex Johnson', email: 'alex.j@primemarketing.com', role: 'AGENT', status: 'ACTIVE' },
    { id: '4', name: 'Devon Carter', email: 'devon@primemarketing.com', role: 'AGENT', status: 'PENDING' },
  ]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MANAGER' | 'AGENT'>('AGENT');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    const newTeammate: Teammate = {
      id: Date.now().toString(),
      name: inviteName,
      email: inviteEmail,
      role: inviteRole,
      status: 'PENDING',
    };

    setTeammates([...teammates, newTeammate]);
    setInviteName('');
    setInviteEmail('');
    setInviteSuccess(true);
    setTimeout(() => setInviteSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Menu */}
      <div className="flex gap-2 border-b border-gray-100 pb-2">
        <button
          onClick={() => setSubTab('channels')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
            subTab === 'channels'
              ? 'bg-[#004ac6]/10 text-[#004ac6]'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>WhatsApp Channels</span>
        </button>

        <button
          onClick={() => setSubTab('team')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
            subTab === 'team'
              ? 'bg-[#004ac6]/10 text-[#004ac6]'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Team & Roles</span>
        </button>

        <button
          onClick={() => setSubTab('branding')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
            subTab === 'branding'
              ? 'bg-[#004ac6]/10 text-[#004ac6]'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Branding & Profile</span>
        </button>
      </div>

      {/* Sub-tab Contents */}
      <div className="mt-4">
        {subTab === 'channels' && (
          <SettingsChannelsTab tenantId={tenantId} />
        )}

        {subTab === 'branding' && (
          <SettingsBrandingTab />
        )}

        {subTab === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Team Roster List (Left/Center 2 cols) */}
            <div className="lg:col-span-2 bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-6 text-left">
              <div>
                <h3 className="text-base font-bold text-[#1c1b1f]">Agency Team Roster</h3>
                <p className="text-xs text-[#49454f] mt-0.5">
                  View and manage access control roles for team support specialists.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#c3c6d7]/60 text-[#49454f] font-bold">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d7]/30">
                    {teammates.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-4 font-semibold text-[#1c1b1f]">{m.name}</td>
                        <td className="py-3.5 px-4 text-[#49454f]">{m.email}</td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            m.role === 'ADMIN' 
                              ? 'bg-rose-50 text-rose-700 border border-rose-100'
                              : m.role === 'MANAGER'
                              ? 'bg-blue-50 text-blue-700 border border-blue-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            <Shield className="w-3 h-3" />
                            {m.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-600 animate-pulse'
                          }`}>
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invite Teammate Card (Right 1 col) */}
            <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4 text-left h-fit">
              <div>
                <h3 className="text-base font-bold text-[#1c1b1f]">Invite Specialist</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add team agents or managers to your agency.
                </p>
              </div>

              {inviteSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2 animate-fade-in">
                  <UserCheck className="w-4 h-4" />
                  <span>Invitation sent successfully!</span>
                </div>
              )}

              <form onSubmit={handleInvite} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#49454f] uppercase tracking-wider block">Full Name</label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="E.g., John Doe"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-1 focus:ring-[#004ac6] focus:border-[#004ac6] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#49454f] uppercase tracking-wider block">Email Address</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="john@agency.com"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-1 focus:ring-[#004ac6] focus:border-[#004ac6] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#49454f] uppercase tracking-wider block">Workspace Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl bg-white outline-none"
                  >
                    <option value="AGENT">AGENT (Sales & Support)</option>
                    <option value="MANAGER">MANAGER (Campaigns & AI Config)</option>
                    <option value="ADMIN">ADMIN (Full Security Control)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 mt-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Send Workspace Invite</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
