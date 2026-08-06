import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const url = req.nextUrl.pathname;

    // NextAuth withAuth handles the initial session check.
    // If we reach here, token exists.
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const role = token.role;

    // 1. Non-PLATFORM_OWNER blocked from /superadmin/*
    if (url.startsWith('/superadmin') && role !== 'PLATFORM_OWNER') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // 2. Only ADMIN and PLATFORM_OWNER can access settings, billing, and team
    const isAdminOnlyRoute =
      url.startsWith('/dashboard/settings') ||
      url.startsWith('/dashboard/billing') ||
      url.startsWith('/dashboard/team') ||
      url.startsWith('/dashboard/api');

    if (isAdminOnlyRoute && role !== 'ADMIN' && role !== 'PLATFORM_OWNER') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // 3. AGENT and VIEWER blocked from Sequences, Marketing
    const isManagerOrAboveRoute =
      url.startsWith('/dashboard/sequences') ||
      url.startsWith('/dashboard/marketing');

    if (isManagerOrAboveRoute && role !== 'ADMIN' && role !== 'MANAGER' && role !== 'PLATFORM_OWNER') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // 4. VIEWER blocked from Inbox, Leads, Customers, Bot Config, Templates, Broadcast
    const isAgentOrAboveRoute =
      url.startsWith('/dashboard/inbox') ||
      url.startsWith('/dashboard/leads') ||
      url.startsWith('/dashboard/customers') ||
      url.startsWith('/dashboard/bot-config') ||
      url.startsWith('/dashboard/templates') ||
      url.startsWith('/dashboard/broadcast');

    if (isAgentOrAboveRoute && role === 'VIEWER') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/dashboard/:path*', '/superadmin/:path*'],
};
