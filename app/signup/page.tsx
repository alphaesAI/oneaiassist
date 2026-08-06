'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 2FA removed: no totpSecret state

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTenantName(val);
    setTenantSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // remove special chars
        .trim()
        .replace(/\s+/g, '-') // spaces to hyphens
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantName, tenantSlug, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed.');
      } else {
        // Registration succeeded, proceed to login
        router.push('/login');
      }
    } catch {
      setError('An unexpected network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f9f9ff] text-[#1c1b1f] flex items-center justify-center px-4 overflow-hidden font-sans">
      <div className="w-full max-w-md bg-white border border-[#c3c6d7] rounded-2xl p-8 sm:p-10 shadow-sm">
        <div className="flex flex-col items-center mb-6">
          {/* Logo */}
          <div className="flex items-center space-x-3 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/OneAILogo.png" alt="OneAIAssist Logo" className="h-10 w-auto object-contain" />
            <span className="text-xl font-bold tracking-tight text-[#004ac6]">
              OneAIAssist
            </span>
          </div>

          <>
              <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f]">
                Register Agency
              </h1>
              <p className="text-sm text-[#49454f] mt-1 text-center">
                Create a tenant account and set up the administrator login.
              </p>
            </>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#49454f] uppercase tracking-wider mb-1.5">
              Agency / Tenant Name
            </label>
            <input
              type="text"
              required
              value={tenantName}
              onChange={handleNameChange}
              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
              placeholder="Apex Assurance Group"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#49454f] uppercase tracking-wider mb-1.5">
              Tenant Slug (Custom URL Identifier)
            </label>
            <input
              type="text"
              required
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
              placeholder="apex-assurance"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#49454f] uppercase tracking-wider mb-1.5">
              Admin Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
              placeholder="admin@agency.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#49454f] uppercase tracking-wider mb-1.5">
              Admin Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#004ac6] hover:bg-[#003ca0] text-white font-bold rounded-lg shadow-sm transition-all text-sm disabled:opacity-50 mt-2"
          >
            {loading ? 'Registering Tenant...' : 'Register Agency'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#49454f]">
          Already registered?{' '}
          <Link href="/login" className="text-[#004ac6] hover:underline font-semibold transition-colors">
            Sign In here
          </Link>
        </div>
      </div>
    </div>
  );
}
