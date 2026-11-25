import {
  apiFetch, PublishError, retryAfterMs,
  type ApiCallOptions, type PlatformAdapter, type PublishInput,
} from './types';

const RATE_LIMIT_CODES = [4, 17, 32, 613];
const TRANSIENT_CODES = [1, 2];
const CONTAINER_POLLS = 20;
const CONTAINER_POLL_MS = 15_000;

export function graphVersion(): string {
  return process.env.META_GRAPH_VERSION || 'v26.0';
}

export function graphBase(): string {
  const base = process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com';
  return `${base}/${graphVersion()}`;
}

let sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function setMetaSleepForTests(fn: typeof sleep) {
  sleep = fn;
}

/** Meta errors that mean a permission is missing, not that the token is dead. */
export const PERMISSION_CODES = [10, 200, 3];

async function graph<T>(
  path: string,
  token: string,
  body: Record<string, string> | null,
  options: ApiCallOptions,
  method?: 'DELETE',
): Promise<T> {
  const res = await apiFetch(
    `${graphBase()}${path}`,
    method === 'DELETE'
      ? { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      : body
        ? {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : { headers: { Authorization: `Bearer ${token}` } },
    options,
  );
  const data = await res.json().catch(() => null);
  if (res.ok && data && !data.error) return data as T;

  const err = data?.error ?? {};
  const message = err.error_user_msg || err.message || `Meta returned HTTP ${res.status}`;
  const code = err.code ? `META_${err.code}` : `HTTP_${res.status}`;
  if (err.code === 190 || res.status === 401) throw new PublishError('auth', message, code);
  if (RATE_LIMIT_CODES.includes(err.code) || res.status === 429) {
    throw new PublishError('retryable', message, code, retryAfterMs(res));
  }
  if (TRANSIENT_CODES.includes(err.code) || res.status >= 500 || err.is_transient) {
    throw new PublishError(options.idempotent ? 'retryable' : 'ambiguous', message, code);
  }
  throw new PublishError('permanent', message, code);
}

/** Graph API call for reading insights and comments and acting on comments. */
export function metaGraph<T>(
  path: string,
  token: string,
  init: { body?: Record<string, string>; method?: 'DELETE'; options?: ApiCallOptions } = {},
): Promise<T> {
  return graph<T>(path, token, init.body ?? null, init.options ?? { idempotent: !init.body }, init.method);
}

export const facebook: PlatformAdapter = {
  async publish({ token, externalAccountId: page, caption, media, title }: PublishInput) {
    const write = { idempotent: false, timeoutMs: 120_000 };
    if (media?.kind === 'video') {
      const { id } = await graph<{ id: string }>(`/${page}/videos`, token, {
        file_url: media.url, description: caption, title,
      }, write);
      return { externalId: id, externalUrl: `https://www.facebook.com/${id}` };
    }
    if (media) {
      const { id, post_id } = await graph<{ id: string; post_id?: string }>(`/${page}/photos`, token, {
        url: media.url, caption,
      }, write);
      return { externalId: post_id ?? id, externalUrl: `https://www.facebook.com/${post_id ?? id}` };
    }
    const { id } = await graph<{ id: string }>(`/${page}/feed`, token, { message: caption }, write);
    return { externalId: id, externalUrl: `https://www.facebook.com/${id}` };
  },
};

export const instagram: PlatformAdapter = {
  async publish({ token, externalAccountId: igUser, caption, media, state, saveState }: PublishInput) {
    if (!media) throw new PublishError('permanent', 'Instagram needs media', 'NO_MEDIA');
    const safe = { idempotent: true };

    let containerId = state.containerId as string | undefined;
    if (!containerId) {
      const { id } = await graph<{ id: string }>(`/${igUser}/media`, token, media.kind === 'video'
        ? { media_type: 'REELS', video_url: media.url, caption }
        : { image_url: media.url, caption }, safe);
      containerId = id;
      await saveState({ ...state, containerId });
    }

    for (let poll = 0; ; poll++) {
      const { status_code: status } = await graph<{ status_code?: string }>(
        `/${containerId}?fields=status_code`, token, null, safe,
      );
      if (status === 'FINISHED' || status === 'PUBLISHED') break;
      if (status === 'ERROR' || status === 'EXPIRED') {
        await saveState({ ...state, containerId: undefined });
        throw new PublishError('permanent', `Instagram could not process the media (${status}).`, `IG_${status}`);
      }
      if (poll >= CONTAINER_POLLS) {
        // Keeps containerId, so the retry carries on waiting instead of uploading again
        throw new PublishError('retryable', 'Instagram is still processing the media.', 'IG_PROCESSING');
      }
      await sleep(CONTAINER_POLL_MS);
    }

    const { id } = await graph<{ id: string }>(`/${igUser}/media_publish`, token, { creation_id: containerId }, {
      idempotent: false,
    });
    // The post is live at this point; a failed permalink lookup must not fail the job.
    const permalink = await graph<{ permalink?: string }>(`/${id}?fields=permalink`, token, null, safe)
      .then((data) => data.permalink)
      .catch(() => undefined);
    return { externalId: id, externalUrl: permalink };
  },
};
