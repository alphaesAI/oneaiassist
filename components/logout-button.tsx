'use client';

import React from 'react';
import { signOut } from 'next-auth/react';

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="px-4 py-2 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-sm font-semibold transition-all text-slate-400 hover:text-slate-200"
    >
      Sign Out
    </button>
  );
}
