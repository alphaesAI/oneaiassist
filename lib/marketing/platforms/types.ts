export const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE', 'TWITTER', 'THREADS'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface PublishMedia {
  url: string;
  /** The file's bytes, for platforms that need them uploaded rather than fetched */
  read: () => Promise<Uint8Array>;
  mimeType: string;
  size: number;
  filename: string;
  kind: 'image' | 'video';
}

export interface PublishInput {
  token: string;
  externalAccountId: string;
  title: string;
  caption: string;
  media: PublishMedia | null;
  state: Record<string, unknown>;
  /** Persist progress immediately, so a retry does not repeat a finished step. */
  saveState: (state: Record<string, unknown>) => Promise<void>;
}

export interface PublishResult {
  externalId: string;
  externalUrl?: string;
}

/**
 * retryable: safe to run again later.
 * permanent: running again would fail the same way.
 * auth: the account must be reconnected.
 * ambiguous: the platform may have published, so a retry could double post. A person decides.
 */
export type PublishErrorKind = 'retryable' | 'permanent' | 'auth' | 'ambiguous';

export class PublishError extends Error {
  constructor(
    public kind: PublishErrorKind,
    message: string,
    public code?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface PlatformAdapter {
  publish(input: PublishInput): Promise<PublishResult>;
}

export interface ApiCallOptions {
  /** True when repeating the call cannot create a second post. */
  idempotent: boolean;
  timeoutMs?: number;
}

export async function apiFetch(url: string, init: RequestInit, options: ApiCallOptions): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 60_000) });
  } catch (error) {
    // No response means we cannot know whether the platform acted on it.
    const reason = error instanceof Error ? error.message : 'network error';
    throw new PublishError(options.idempotent ? 'retryable' : 'ambiguous', `No response from platform: ${reason}`, 'NETWORK');
  }
}

export function retryAfterMs(res: Response): number | undefined {
  const seconds = Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

export function errorForStatus(res: Response, message: string, options: ApiCallOptions): PublishError {
  if (res.status === 401) return new PublishError('auth', message, 'UNAUTHORIZED');
  if (res.status === 429) return new PublishError('retryable', message, 'RATE_LIMITED', retryAfterMs(res));
  if (res.status >= 500) {
    return new PublishError(options.idempotent ? 'retryable' : 'ambiguous', message, `HTTP_${res.status}`);
  }
  return new PublishError('permanent', message, `HTTP_${res.status}`);
}
