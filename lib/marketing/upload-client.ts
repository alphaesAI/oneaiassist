import { api, ApiError } from '@/lib/api-client';


const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mov: 'video/quicktime',
};

/** The browser's type, or a guess from the extension when it gives none. The server checks the bytes. */
function guessType(file: File): string {
  if (file.type === 'image/jpg') return 'image/jpeg';
  if (file.type) return file.type;
  return BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/**
 * Uploads a file to the media library. With cloud storage the browser sends the file straight
 * to the bucket; otherwise it goes to our server.
 */
export async function uploadMediaFile<T = unknown>(file: File): Promise<T> {
  const start = await api<{ direct: boolean; uploadUrl?: string; headers?: Record<string, string>; token?: string }>(
    '/api/media/upload-url',
    { mimeType: guessType(file), size: file.size },
  );

  if (!start.direct) {
    const form = new FormData();
    form.append('file', file);
    const { asset } = await api<{ asset: T }>('/api/media', form);
    return asset;
  }

  let put: Response;
  try {
    put = await fetch(start.uploadUrl!, { method: 'PUT', headers: start.headers, body: file });
  } catch {
    throw new ApiError('The upload could not reach storage. Check your connection and try again.', 0);
  }
  if (!put.ok) throw new ApiError(`Upload failed (${put.status}). Try again.`, put.status);

  const { asset } = await api<{ asset: T }>('/api/media/complete', { token: start.token, filename: file.name });
  return asset;
}
