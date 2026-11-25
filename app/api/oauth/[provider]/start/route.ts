import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/marketing/env';
import { authed } from '@/lib/marketing/auth';
import { authorizeUrl, createCodeVerifier, isProvider, missingEnv, providerConfigured } from '@/lib/marketing/oauth';

export const GET = authed(async (_req, user, { params }: { params: { provider: string } }) => {
  const { provider } = params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  if (!providerConfigured(provider)) {
    const error = `This channel is not set up yet. Missing in server environment: ${missingEnv(provider).join(', ')}`;
    return NextResponse.redirect(`${appUrl()}/dashboard/marketing/channels?${new URLSearchParams({ error })}`);
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const codeVerifier = createCodeVerifier();
  const response = NextResponse.redirect(authorizeUrl(provider, state, codeVerifier));
  response.cookies.set({
    name: `mh_oauth_${provider}`,
    value: `${state}.${user.id}.${codeVerifier}`,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/oauth',
    maxAge: 600,
  });
  return response;
});
