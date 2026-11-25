import crypto from 'node:crypto';
import { NextResponse, NextRequest } from 'next/server';
import { appUrl } from '@/lib/marketing/env';
import { authed } from '@/lib/marketing/auth';
import { connectAccounts, isProvider } from '@/lib/marketing/oauth';

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export const GET = authed(async (req: any, user, { params }: { params: { provider: string } }) => {
  const { provider } = params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const back = (searchParamsObj: Record<string, string>) => {
    const response = NextResponse.redirect(
      `${appUrl()}/dashboard/marketing/channels?${new URLSearchParams(searchParamsObj)}`
    );
    response.cookies.delete({ name: `mh_oauth_${provider}`, path: '/api/oauth' });
    return response;
  };

  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  const cookieHeader = req.headers.get('cookie') || '';
  const cookieMatch = cookieHeader.match(new RegExp(`(?:^|; )mh_oauth_${provider}=([^;]*)`));
  const cookieValue = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
  const [expectedState, expectedUser, codeVerifier] = cookieValue.split('.');

  if (!state || !expectedState || !sameState(`${state}.${user.id}`, `${expectedState}.${expectedUser}`)) {
    return back({ error: 'The connection attempt expired or could not be verified. Please try again.' });
  }
  if (url.searchParams.get('error')) {
    return back({ error: url.searchParams.get('error_description') || 'Permission was not granted.' });
  }
  const code = url.searchParams.get('code');
  if (!code) return back({ error: 'The platform did not return an authorization code.' });

  try {
    const count = await connectAccounts(provider, user, code, codeVerifier);
    return back({ connected: String(count) });
  } catch (error) {
    console.error(`OAuth ${provider} failed:`, error);
    return back({ error: error instanceof Error ? error.message : 'Connecting the account failed.' });
  }
});
