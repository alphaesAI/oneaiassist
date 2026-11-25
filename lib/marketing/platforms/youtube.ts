import {
  apiFetch, errorForStatus, PublishError,
  type PlatformAdapter, type PublishInput,
} from './types';

export function youtubeBase(): string {
  return process.env.YOUTUBE_BASE_URL || 'https://www.googleapis.com';
}

const UPLOAD_TIMEOUT_MS = 30 * 60_000;

export const youtube: PlatformAdapter = {
  async publish({ token, title, caption, media }: PublishInput) {
    if (!media || media.kind !== 'video') throw new PublishError('permanent', 'YouTube needs a video', 'NO_VIDEO');

    const safe = { idempotent: true };
    const session = await apiFetch(
      `${youtubeBase()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': media.mimeType,
          'X-Upload-Content-Length': String(media.size),
        },
        body: JSON.stringify({
          snippet: { title, description: caption },
          status: {
            privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || 'private',
            selfDeclaredMadeForKids: false,
          },
        }),
      },
      safe,
    );
    if (!session.ok) {
      const data = await session.json().catch(() => null);
      const reason = data?.error?.errors?.[0]?.reason;
      const message = data?.error?.message || `YouTube returned HTTP ${session.status}`;
      // Google reports quota as 403, which would otherwise read as permanent
      if (reason === 'quotaExceeded' || reason === 'uploadLimitExceeded') {
        throw new PublishError('retryable', message, 'QUOTA', 6 * 60 * 60_000);
      }
      throw errorForStatus(session, message, safe);
    }
    const location = session.headers.get('location');
    if (!location) throw new PublishError('retryable', 'YouTube returned no upload URL.', 'NO_UPLOAD_URL');

    const write = { idempotent: false, timeoutMs: UPLOAD_TIMEOUT_MS };
    const upload = await apiFetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': media.mimeType },
      body: (await media.read()) as Uint8Array<ArrayBuffer>,
    }, write);
    if (!upload.ok) {
      const data = await upload.json().catch(() => null);
      throw errorForStatus(upload, data?.error?.message || `YouTube returned HTTP ${upload.status}`, write);
    }
    const { id } = await upload.json();
    return { externalId: id, externalUrl: `https://www.youtube.com/watch?v=${id}` };
  },
};
