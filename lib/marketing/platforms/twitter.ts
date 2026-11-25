import { apiFetch, errorForStatus, PublishError, type PlatformAdapter, type PublishInput } from './types';

export const twitter: PlatformAdapter = {
  async publish({ token, caption, media }: PublishInput) {
    if (media) throw new PublishError('permanent', 'X posts support text only for now.', 'MEDIA_UNSUPPORTED');

    const write = { idempotent: false };
    const res = await apiFetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: caption }),
    }, write);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw errorForStatus(res, data?.detail || data?.title || `X returned HTTP ${res.status}`, write);

    const id = data?.data?.id as string | undefined;
    if (!id) throw new PublishError('ambiguous', 'X accepted the post but returned no id.', 'NO_ID');
    return { externalId: id, externalUrl: `https://x.com/i/web/status/${id}` };
  },
};
