import {
  apiFetch, errorForStatus, PublishError,
  type ApiCallOptions, type PlatformAdapter, type PublishInput,
} from './types';

export function linkedinBase(): string {
  return process.env.LINKEDIN_BASE_URL || 'https://api.linkedin.com';
}

function headers(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Linkedin-Version': process.env.LINKEDIN_API_VERSION || '202609',
    'X-Restli-Protocol-Version': '2.0.0',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

// The Posts API parses commentary as "little text"; unescaped, these characters
// truncate the post or fail it.
export function escapeCommentary(text: string): string {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (char) => (char === '#' ? char : `\\${char}`));
}

async function check(res: Response, options: ApiCallOptions): Promise<void> {
  if (res.ok) return;
  const data = await res.json().catch(() => null);
  throw errorForStatus(res, data?.message || `LinkedIn returned HTTP ${res.status}`, options);
}

export const linkedin: PlatformAdapter = {
  async publish({ token, externalAccountId: author, caption, title, media, state, saveState }: PublishInput) {
    const safe = { idempotent: true, timeoutMs: 120_000 };
    let imageUrn = state.imageUrn as string | undefined;

    if (media && !imageUrn) {
      const init = await apiFetch(`${linkedinBase()}/rest/images?action=initializeUpload`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      }, safe);
      await check(init, safe);
      const { value } = await init.json();
      const upload = await apiFetch(value.uploadUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': media.mimeType },
        body: (await media.read()) as Uint8Array<ArrayBuffer>,
      }, safe);
      await check(upload, safe);
      imageUrn = value.image as string;
      await saveState({ ...state, imageUrn });
    }

    const write = { idempotent: false };
    const res = await apiFetch(`${linkedinBase()}/rest/posts`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        author,
        commentary: escapeCommentary(caption),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(imageUrn ? { content: { media: { id: imageUrn, title } } } : {}),
      }),
    }, write);
    await check(res, write);

    const id = res.headers.get('x-restli-id');
    if (!id) throw new PublishError('ambiguous', 'LinkedIn accepted the post but returned no id.', 'NO_ID');
    return { externalId: id, externalUrl: `https://www.linkedin.com/feed/update/${id}` };
  },
};
