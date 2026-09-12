'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
        const result = await signIn('credentials', {
          redirect: false,
          email,
          password,
        });

        if (result?.error) {
          if (result.error.includes('Too many failed login attempts')) {
            setError(result.error);
          } else {
            setError('Invalid email or password.');
          }
        } else {
          router.push('/dashboard');
          router.refresh();
        }
      } catch {
        setError('An unexpected error occurred. Please try again.');
      } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f9f9ff] text-[#1c1b1f] flex items-center justify-center px-4 overflow-hidden font-sans">
      <div className="w-full max-w-md bg-white border border-[#c3c6d7] rounded-2xl p-8 sm:p-10 shadow-sm">
        <div className="flex flex-col items-center mb-8">
          {/* Brand Logo */}
          <div className="flex items-center space-x-3 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/OneAILogo.png" alt="OneAIAssist Logo" className="h-10 w-auto object-contain" />
            <span className="text-xl font-bold tracking-tight text-[#004ac6]">
              OneAIAssist
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f]">
            Welcome Back
          </h1>
          <p className="text-sm text-[#49454f] mt-1 text-center">
            Sign in to manage your AI WhatsApp and support agency
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-[#49454f] uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[#1c1b1f] placeholder-[#93909a] focus:outline-none focus:border-[#004ac6] focus:ring-4 focus:ring-[#004ac6]/10 transition-all text-sm"
              placeholder="agent@agency.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#49454f] uppercase tracking-wider mb-2">
              Password
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
            className="w-full py-3.5 bg-[#004ac6] hover:bg-[#003ca0] text-white font-bold rounded-lg shadow-sm hover:shadow transition-all text-sm disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Continue'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-[#49454f]">
          New agency?{' '}
          <Link href="/signup" className="text-[#004ac6] hover:underline font-semibold transition-colors">
            Register Tenant Account
          </Link>
        </div>
      </div>
    </div>
  );
}
