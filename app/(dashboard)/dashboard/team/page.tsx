import React from 'react';

export default function TeamPage() {
  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
          Team Management
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Invite agents, assign roles, and audit access rules for your agency.
        </p>
      </div>

      <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[350px]">
        <div className="h-12 w-12 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-400 mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-200">Agency Team & Roster</h3>
        <p className="text-sm text-slate-400 max-w-sm mt-1">
          Manage agency logins, edit permissions for Marketing or Sales Support roles, and configure work roster channels.
        </p>
      </div>
    </div>
  );
}
