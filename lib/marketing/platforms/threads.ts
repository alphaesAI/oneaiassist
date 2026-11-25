import {
  apiFetch, errorForStatus, PublishError,
  type ApiCallOptions, type PlatformAdapter, type PublishInput,
} from './types';

const CONTAINER_POLLS = 20;
const CONTAINER_POLL_MS = 15_000;

let sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function setThreadsSleepForTests(fn: typeof sleep) {
  sleep = fn;
}

async function call<T>(path: string, token: string, params: Record<string, string>, method: 'GET' | 'POST', options: ApiCallOptions): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: token });
  const res = await apiFetch(`https://graph.threads.com/v1.0${path}?${query}`, { method }, options);
  const data = await res.json().catch(() => null);
  if (res.ok && data && !data.error) return data as T;
  const message = data?.error?.error_user_msg || data?.error?.message || `Threads returned HTTP ${res.status}`;
  if (data?.error?.code === 190) throw new PublishError('auth', message, 'THREADS_190');
  throw errorForStatus(res, message, options);
}

export const threads: PlatformAdapter = {
  async publish({ token, externalAccountId: user, caption, media, state, saveState }: PublishInput) {
    const safe = { idempotent: true };

    let containerId = state.containerId as string | undefined;
    if (!containerId) {
      const content: Record<string, string> = !media
        ? { media_type: 'TEXT' }
        : media.kind === 'video'
          ? { media_type: 'VIDEO', video_url: media.url }
          : { media_type: 'IMAGE', image_url: media.url };
      const { id } = await call<{ id: string }>(`/${user}/threads`, token, { ...content, text: caption }, 'POST', safe);
      containerId = id;
      await saveState({ ...state, containerId });
    }

    for (let poll = 0; ; poll++) {
      const { status } = await call<{ status?: string }>(`/${containerId}`, token, { fields: 'status' }, 'GET', safe);
      if (status === 'FINISHED' || status === 'PUBLISHED') break;
      if (status === 'ERROR' || status === 'EXPIRED') {
        await saveState({ ...state, containerId: undefined });
        throw new PublishError('permanent', `Threads could not process the post (${status}).`, `THREADS_${status}`);
      }
      if (poll >= CONTAINER_POLLS) {
        // Keeps containerId, so the retry carries on waiting instead of creating another
        throw new PublishError('retryable', 'Threads is still processing the post.', 'THREADS_PROCESSING');
      }
      await sleep(CONTAINER_POLL_MS);
    }

    const { id } = await call<{ id: string }>(`/${user}/threads_publish`, token, { creation_id: containerId }, 'POST', { idempotent: false });
    // The post is live at this point; a failed permalink lookup must not fail the job.
    const permalink = await call<{ permalink?: string }>(`/${id}`, token, { fields: 'permalink' }, 'GET', safe)
      .then((data) => data.permalink)
      .catch(() => undefined);
    return { externalId: id, externalUrl: permalink };
  },
};
