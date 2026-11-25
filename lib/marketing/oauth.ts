import crypto from 'node:crypto';
import { encrypt, decrypt } from './crypto';
import { appUrl } from './env';
import { prisma } from './prisma';
import { graphBase, graphVersion } from './platforms/meta';
import { PublishError } from './platforms/types';
import { linkedinBase } from './platforms/linkedin';
import { youtubeBase } from './platforms/youtube';

export type OAuthProvider = 'meta' | 'facebook' | 'instagram' | 'meta_ads' | 'threads' | 'twitter' | 'youtube' | 'linkedin';

export function isProvider(value: string): value is OAuthProvider {
  return [
    'meta',
    'facebook',
    'instagram',
    'meta_ads',
    'threads',
    'twitter',
    'youtube',
    'linkedin',
  ].includes(value);
}

const REQUIRED_ENV: Record<OAuthProvider, string[]> = {
  meta: ['META_APP_ID', 'META_APP_SECRET'],
  facebook: ['META_APP_ID', 'META_APP_SECRET'],
  instagram: ['META_APP_ID', 'META_APP_SECRET'],
  meta_ads: ['META_APP_ID', 'META_APP_SECRET'],
  // Threads has its own App ID and secret (App settings > Basic > Threads App ID)
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  twitter: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
};

export function providerConfigured(provider: OAuthProvider): boolean {
  return missingEnv(provider).length === 0;
}

export function missingEnv(provider: OAuthProvider): string[] {
  return REQUIRED_ENV[provider].filter((name) => !process.env[name]);
}

/** PKCE (RFC 7636): a fresh secret for each attempt, so a stolen code is useless on its own. */
export function createCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function codeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Only what publishing needs: list Pages, publish, and read Page posts (for boosting).
const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
];

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

// Ad accounts are connected separately from Pages, so posting never depends on ads permissions.
export const META_ADS_SCOPES = ['ads_read', 'ads_management', 'business_management'];

// Reading comments and insights and answering comments. Asked for only when
// META_ENGAGEMENT_SCOPES=true: each must first be added to the app's use cases in the Meta
// dashboard, or Facebook rejects the whole login with "Invalid Scopes".
const FACEBOOK_ENGAGEMENT_SCOPES = ['read_insights', 'pages_read_user_content', 'pages_manage_engagement'];
const INSTAGRAM_ENGAGEMENT_SCOPES = ['instagram_manage_comments', 'instagram_manage_insights'];

export function engagementScopesEnabled(): boolean {
  return process.env.META_ENGAGEMENT_SCOPES?.trim() === 'true';
}

// Lead Ads on a Page: create instant forms, subscribe the app to the leadgen webhook, read leads.
// Same rule: META_LEADS_SCOPES=true only after they are added to the app's use cases.
export const FACEBOOK_LEADS_SCOPES = ['pages_manage_ads', 'pages_manage_metadata', 'leads_retrieval'];

export function leadsScopesEnabled(): boolean {
  return process.env.META_LEADS_SCOPES?.trim() === 'true';
}

function metaScopes(provider: 'meta' | 'facebook' | 'instagram'): string[] {
  const extra = engagementScopesEnabled();
  const facebook = [
    ...FACEBOOK_SCOPES,
    ...(extra ? FACEBOOK_ENGAGEMENT_SCOPES : []),
    ...(leadsScopesEnabled() ? FACEBOOK_LEADS_SCOPES : []),
  ];
  const instagram = extra ? [...INSTAGRAM_SCOPES, ...INSTAGRAM_ENGAGEMENT_SCOPES] : INSTAGRAM_SCOPES;
  if (provider === 'facebook') return facebook;
  if (provider === 'instagram') return instagram;
  return [...new Set([...facebook, ...instagram])];
}

function redirectUri(provider: OAuthProvider): string {
  return `${appUrl()}/api/oauth/${provider}/callback`;
}

export function authorizeUrl(provider: OAuthProvider, state: string, codeVerifier: string): string {
  const redirect_uri = redirectUri(provider);

  // 1. Threads (Official Threads API OAuth 2.0)
  if (provider === 'threads') {
    const scope = [
      'threads_basic',
      'threads_content_publish',
      'threads_manage_insights',
      'threads_manage_replies',
      'threads_read_replies',
    ].join(',');
    return `https://threads.com/oauth/authorize?${new URLSearchParams({
      client_id: process.env.THREADS_APP_ID!.trim(),
      redirect_uri,
      scope,
      response_type: 'code',
      state,
    })}`;
  }

  // 2. Facebook and Instagram (Official Meta Graph OAuth 2.0)
  if (provider === 'facebook' || provider === 'instagram' || provider === 'meta') {
    return `https://www.facebook.com/${graphVersion()}/dialog/oauth?${new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri,
      state,
      scope: metaScopes(provider).join(','),
      response_type: 'code',
    })}`;
  }

  // 3. Meta ad accounts (Marketing API)
  // Business-type apps use Facebook Login for Business, which takes a
  // Login Configuration (config_id) from the Meta dashboard instead of scope.
  if (provider === 'meta_ads') {
    const configId = process.env.META_ADS_CONFIG_ID?.trim();
    return `https://www.facebook.com/${graphVersion()}/dialog/oauth?${new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri,
      state,
      ...(configId ? { config_id: configId } : { scope: META_ADS_SCOPES.join(',') }),
      response_type: 'code',
    })}`;
  }

  // 4. Twitter / X (Official X API v2 OAuth 2.0 with PKCE)
  if (provider === 'twitter') {
    const scope = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ');
    return `https://x.com/i/oauth2/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: process.env.TWITTER_CLIENT_ID!,
      redirect_uri,
      scope,
      state,
      code_challenge: codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    })}`;
  }

  // 5. YouTube (Official Google OAuth 2.0 with offline access for refresh tokens)
  if (provider === 'youtube') {
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri,
      state,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
    })}`;
  }

  // LinkedIn (Optional auxiliary provider)
  return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri,
    state,
    response_type: 'code',
    scope: 'openid profile w_member_social',
  })}`;
}

async function readJson(res: Response, what: string) {
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const reason =
      data?.error?.message || data?.error_description || data?.error_message || data?.detail || `HTTP ${res.status}`;
    throw new Error(`${what} failed: ${reason}`);
  }
  return data;
}

interface AccountInput {
  platform: string;
  externalAccountId: string;
  accountName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
}

export interface AccountOwner {
  id: string;
  tenantId: string;
}

async function saveAccount(owner: AccountOwner, account: AccountInput) {
  const fields = {
    accountName: account.accountName,
    accessTokenEnc: encrypt(account.accessToken),
    expiresAt: account.expiresAt ?? null,
    status: 'ACTIVE',
  };
  await prisma.connectedAccount.upsert({
    where: {
      tenantId_ownerUserId_platform_externalAccountId: {
        tenantId: owner.tenantId,
        ownerUserId: owner.id,
        platform: account.platform,
        externalAccountId: account.externalAccountId,
      },
    },
    update: {
      ...fields,
      ...(account.refreshToken ? { refreshTokenEnc: encrypt(account.refreshToken) } : {}),
    },
    create: {
      ...fields,
      tenantId: owner.tenantId,
      ownerUserId: owner.id,
      platform: account.platform,
      externalAccountId: account.externalAccountId,
      refreshTokenEnc: account.refreshToken ? encrypt(account.refreshToken) : null,
    },
  });
}

// 1. Meta Connection Flow. Each provider only touches its own platform: the Instagram login does
// not grant pages_manage_posts, so saving its token over a Facebook Page would break Page posting.
async function connectMeta(owner: AccountOwner, code: string, provider: 'meta' | 'facebook' | 'instagram'): Promise<number> {
  const params = {
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
  };
  const short = await readJson(
    await fetch(
      `${graphBase()}/oauth/access_token?${new URLSearchParams({
        ...params,
        code,
        redirect_uri: redirectUri(provider),
      })}`,
    ),
    'Facebook token exchange',
  );
  const long = await readJson(
    await fetch(
      `${graphBase()}/oauth/access_token?${new URLSearchParams({
        ...params,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: short.access_token,
      })}`,
    ),
    'Facebook long-lived token exchange',
  );
  const pages = await readJson(
    await fetch(
      `${graphBase()}/me/accounts?${new URLSearchParams({
        fields: 'id,name,access_token,instagram_business_account{id,username}',
        limit: '100',
      })}`,
      {
        headers: { Authorization: `Bearer ${long.access_token}` },
      },
    ),
    'Facebook page lookup',
  );

  const wantsPages = provider !== 'instagram';
  const wantsInstagram = provider !== 'facebook';
  let count = 0;
  for (const page of pages.data ?? []) {
    // Meta omits the token for a Page the user cannot manage
    if (!page.access_token) continue;
    if (wantsPages) {
      await saveAccount(owner, {
        platform: 'FACEBOOK',
        externalAccountId: page.id,
        accountName: page.name,
        accessToken: page.access_token,
      });
      count += 1;
    }
    const ig = page.instagram_business_account;
    if (ig && wantsInstagram) {
      await saveAccount(owner, {
        platform: 'INSTAGRAM',
        externalAccountId: ig.id,
        accountName: ig.username ?? page.name,
        accessToken: page.access_token,
      });
      count += 1;
    }
  }
  if (count === 0) {
    throw new Error(
      provider === 'instagram'
        ? 'No Instagram accounts were found. Use a Business or Creator account linked to a Facebook Page, and grant access to that Page.'
        : 'No Facebook Pages were found. Grant access to at least one Page and try again.',
    );
  }
  return count;
}

// 2. Meta ad accounts: one long-lived user token, saved on every ad account the user can access.
async function connectMetaAds(owner: AccountOwner, code: string): Promise<number> {
  const params = {
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
  };
  const short = await readJson(
    await fetch(
      `${graphBase()}/oauth/access_token?${new URLSearchParams({
        ...params,
        code,
        redirect_uri: redirectUri('meta_ads'),
      })}`,
    ),
    'Facebook token exchange',
  );
  const long = await readJson(
    await fetch(
      `${graphBase()}/oauth/access_token?${new URLSearchParams({
        ...params,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: short.access_token,
      })}`,
    ),
    'Facebook long-lived token exchange',
  );
  const token: string = long.access_token;
  const expiresAt = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000) : null;

  const adAccounts: { id: string; name?: string; currency?: string; timezone_name?: string; account_status?: number }[] = [];
  let next: string | null = `${graphBase()}/me/adaccounts?${new URLSearchParams({
    fields: 'id,name,currency,timezone_name,account_status',
    limit: '100',
  })}`;
  // At most 5 pages (500 ad accounts); only follow paging links back to the Graph API
  for (let page = 0; next && page < 5; page += 1) {
    const data = await readJson(
      await fetch(next, { headers: { Authorization: `Bearer ${token}` } }),
      'Ad account lookup',
    );
    adAccounts.push(...(data.data ?? []));
    const link: unknown = data.paging?.next;
    next = typeof link === 'string' && link.startsWith(`${graphBase()}/`) ? link : null;
  }

  let count = 0;
  for (const account of adAccounts) {
    if (!/^act_\d+$/.test(account.id)) continue;
    const fields = {
      name: account.name || account.id,
      currency: account.currency || 'USD',
      timezone: account.timezone_name ?? null,
      accountStatus: Number(account.account_status ?? 1),
      accessTokenEnc: encrypt(token),
      expiresAt,
      status: 'ACTIVE',
    };
    if ((prisma as any).adAccount) {
      await (prisma as any).adAccount.upsert({
        where: { tenantId_ownerUserId_externalId: { tenantId: owner.tenantId, ownerUserId: owner.id, externalId: account.id } },
        update: fields,
        create: { ...fields, tenantId: owner.tenantId, ownerUserId: owner.id, externalId: account.id },
      });
    }
    count += 1;
  }
  if (count === 0) {
    throw new Error('No ad accounts were found. Make sure you have access to at least one ad account in Meta Business Suite and try again.');
  }
  return count;
}

// 3. Threads Connection Flow
async function connectThreads(owner: AccountOwner, code: string): Promise<number> {
  const clientId = process.env.THREADS_APP_ID!.trim();
  const clientSecret = process.env.THREADS_APP_SECRET!.trim();

  const tokenRes = await readJson(
    await fetch('https://graph.threads.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri('threads'),
        code: code.trim(),
      }),
    }),
    'Threads token exchange',
  );

  // Exchange for long-lived Threads user token (valid for 60 days)
  const longRes = await readJson(
    await fetch(
      `https://graph.threads.com/access_token?${new URLSearchParams({
        grant_type: 'th_exchange_token',
        client_secret: clientSecret,
        access_token: tokenRes.access_token,
      })}`,
    ),
    'Threads long-lived token exchange',
  );

  const me = await readJson(
    await fetch(
      `https://graph.threads.com/v1.0/me?${new URLSearchParams({
        fields: 'id,username,name,threads_profile_picture_url',
        access_token: longRes.access_token,
      })}`,
    ),
    'Threads user profile lookup',
  );

  await saveAccount(owner, {
    platform: 'THREADS',
    externalAccountId: me.id,
    accountName: me.username ? `@${me.username}` : me.name || 'Threads Profile',
    accessToken: longRes.access_token,
    expiresAt: longRes.expires_in ? new Date(Date.now() + longRes.expires_in * 1000) : null,
  });

  return 1;
}

// 4. Twitter / X Connection Flow
async function connectTwitter(owner: AccountOwner, code: string, codeVerifier: string): Promise<number> {
  const basicAuth = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
  ).toString('base64');

  const token = await readJson(
    await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.TWITTER_CLIENT_ID!,
        redirect_uri: redirectUri('twitter'),
        code_verifier: codeVerifier,
      }),
    }),
    'Twitter token exchange',
  );

  const user = await readJson(
    await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }),
    'Twitter profile lookup',
  );

  await saveAccount(owner, {
    platform: 'TWITTER',
    externalAccountId: user.data.id,
    accountName: user.data.username ? `@${user.data.username}` : user.data.name || 'Twitter Profile',
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  });

  return 1;
}

// 5. YouTube Connection Flow
async function connectYoutube(owner: AccountOwner, code: string): Promise<number> {
  const token = await readJson(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri('youtube'),
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    }),
    'Google token exchange',
  );

  const channels = await readJson(
    await fetch(`${youtubeBase()}/youtube/v3/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }),
    'YouTube channel lookup',
  );

  const items = channels.items ?? [];
  if (items.length === 0) throw new Error('This Google account has no YouTube channel.');
  for (const channel of items) {
    await saveAccount(owner, {
      platform: 'YOUTUBE',
      externalAccountId: channel.id,
      accountName: channel.snippet?.title ?? 'YouTube channel',
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    });
  }
  return items.length;
}

async function connectLinkedin(owner: AccountOwner, code: string): Promise<number> {
  const token = await readJson(
    await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri('linkedin'),
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    }),
    'LinkedIn token exchange',
  );
  const me = await readJson(
    await fetch(`${linkedinBase()}/v2/userinfo`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }),
    'LinkedIn profile lookup',
  );
  await saveAccount(owner, {
    platform: 'LINKEDIN',
    externalAccountId: `urn:li:person:${me.sub}`,
    accountName: me.name ?? 'LinkedIn member',
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  });
  return 1;
}

export async function connectAccounts(
  provider: OAuthProvider,
  owner: AccountOwner,
  code: string,
  codeVerifier = '',
): Promise<number> {
  if (provider === 'threads') return connectThreads(owner, code);
  if (provider === 'meta_ads') return connectMetaAds(owner, code);
  if (provider === 'instagram' || provider === 'facebook' || provider === 'meta') return connectMeta(owner, code, provider);
  if (provider === 'twitter') return connectTwitter(owner, code, codeVerifier);
  if (provider === 'youtube') return connectYoutube(owner, code);
  return connectLinkedin(owner, code);
}

interface StoredAccount {
  id: string;
  platform: string;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
}

const EXPIRY_MARGIN_MS = 5 * 60_000;

/** A token that is valid now, refreshing it if the platform supports that. */
export async function validToken(account: StoredAccount): Promise<string> {
  if (!account.expiresAt || account.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) {
    return decrypt(account.accessTokenEnc);
  }
  if (!account.refreshTokenEnc) {
    throw new PublishError(
      'auth',
      'The connection has expired. Reconnect this account.',
      'TOKEN_EXPIRED',
    );
  }

  const refresh_token = decrypt(account.refreshTokenEnc);
  const isTwitter = account.platform === 'TWITTER';
  const isGoogle = account.platform === 'YOUTUBE';
  const clientId = isTwitter
    ? process.env.TWITTER_CLIENT_ID!
    : isGoogle ? process.env.GOOGLE_CLIENT_ID! : process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = isTwitter
    ? process.env.TWITTER_CLIENT_SECRET!
    : isGoogle ? process.env.GOOGLE_CLIENT_SECRET! : process.env.LINKEDIN_CLIENT_SECRET!;
  const tokenUrl = isTwitter
    ? 'https://api.x.com/2/oauth2/token'
    : isGoogle ? 'https://oauth2.googleapis.com/token' : 'https://www.linkedin.com/oauth/v2/accessToken';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // X takes confidential client credentials as HTTP Basic only
      ...(isTwitter ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` } : {}),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: clientId,
      ...(isTwitter ? {} : { client_secret: clientSecret }),
    }),
  }).catch(() => null);

  if (!res) throw new PublishError('retryable', 'Could not reach the token service.', 'NETWORK');
  if (res.status >= 500) throw new PublishError('retryable', 'The token service is unavailable.', `HTTP_${res.status}`);
  if (!res.ok) throw new PublishError('auth', 'Access was revoked or expired. Reconnect this account.', 'REFRESH_FAILED');

  const token = await res.json();
  await prisma.connectedAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEnc: encrypt(token.access_token),
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      ...(token.refresh_token ? { refreshTokenEnc: encrypt(token.refresh_token) } : {}),
    },
  });
  return token.access_token;
}
