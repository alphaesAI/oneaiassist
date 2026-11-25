import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';
import { appUrl, dataDir } from './env';

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * MB;
export const MAX_VIDEO_BYTES = 100 * MB;
/** How long a browser has to finish a direct upload. */
export const UPLOAD_URL_SECONDS = 15 * 60;

export const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

/** Type comes from the file's own bytes, because a browser-supplied type can be anything. */
export function sniffMimeType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 11 && String.fromCharCode(b[4], b[5], b[6], b[7]) === 'ftyp') {
    return String.fromCharCode(b[8], b[9], b[10], b[11]) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

/** The size limit for a sniffed type, or null when the type is not allowed. */
export function maxBytesFor(mimeType: string): number | null {
  if (!EXTENSIONS[mimeType]) return null;
  return mimeType.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
}

const KEY = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;

export function isStorageKey(key: string): boolean {
  return KEY.test(key);
}

function newKey(mimeType: string): string {
  const ext = EXTENSIONS[mimeType];
  if (!ext) throw new Error(`Unsupported media type ${mimeType}`);
  return `${crypto.randomBytes(24).toString('base64url')}.${ext}`;
}

// ---------------------------------------------------------------------------
// Remote: any S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2...)
// ---------------------------------------------------------------------------

const REMOTE_VARS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'] as const;

interface Remote {
  client: AwsClient;
  objectUrl: (key: string) => string;
  publicUrl: (key: string) => string;
}

/** The configured bucket, or null to keep files on the local disk. Half a config is an error. */
export function remoteStorage(): Remote | null {
  const set = REMOTE_VARS.filter((name) => process.env[name]?.trim());
  if (set.length === 0) return null;
  if (set.length !== REMOTE_VARS.length) {
    const missing = REMOTE_VARS.filter((name) => !set.includes(name));
    throw new Error(`Cloud storage is half configured. Also set: ${missing.join(', ')}`);
  }
  const env = (name: (typeof REMOTE_VARS)[number]) => process.env[name]!.trim();
  const endpoint = env('S3_ENDPOINT').replace(/\/+$/, '');
  const bucket = encodeURIComponent(env('S3_BUCKET'));
  const publicBase = env('S3_PUBLIC_URL').replace(/\/+$/, '');
  const client = new AwsClient({
    accessKeyId: env('S3_ACCESS_KEY_ID'),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
    service: 's3',
    region: process.env.S3_REGION?.trim() || 'auto',
  });
  return {
    client,
    objectUrl: (key) => `${endpoint}/${bucket}/${key}`,
    publicUrl: (key) => `${publicBase}/${key}`,
  };
}

async function remoteCall(remote: Remote, key: string, init: RequestInit & { allow404?: boolean }) {
  const { allow404, ...rest } = init;
  const res = await remote.client.fetch(remote.objectUrl(key), rest);
  if (res.ok || (allow404 && res.status === 404)) return res;
  throw new Error(`Cloud storage ${rest.method ?? 'GET'} failed with HTTP ${res.status}`);
}

// ---------------------------------------------------------------------------
// Local disk (development and the VPS, where /data is a persistent volume)
// ---------------------------------------------------------------------------

function uploadsDir(): string {
  return path.resolve(dataDir(), 'uploads');
}

/** Only ever joins a key we generated; anything else is rejected. */
export function mediaPath(storageKey: string): string {
  if (!isStorageKey(storageKey)) throw new Error('Invalid storage key');
  return path.join(uploadsDir(), storageKey);
}

// ---------------------------------------------------------------------------
// Public API, the same for both backends
// ---------------------------------------------------------------------------

export async function saveUpload(bytes: Uint8Array, mimeType: string): Promise<string> {
  const storageKey = newKey(mimeType);
  const remote = remoteStorage();
  if (remote) {
    await remoteCall(remote, storageKey, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: bytes as Uint8Array<ArrayBuffer>,
    });
    return storageKey;
  }
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(mediaPath(storageKey), bytes);
  return storageKey;
}

export async function deleteUpload(storageKey: string): Promise<void> {
  if (!isStorageKey(storageKey)) throw new Error('Invalid storage key');
  const remote = remoteStorage();
  if (remote) {
    await remoteCall(remote, storageKey, { method: 'DELETE', allow404: true });
    return;
  }
  await fs.rm(mediaPath(storageKey), { force: true });
}

/** The whole file, for platforms that need the bytes uploaded to them (LinkedIn, YouTube). */
export async function readUpload(storageKey: string): Promise<Uint8Array> {
  if (!isStorageKey(storageKey)) throw new Error('Invalid storage key');
  const remote = remoteStorage();
  if (remote) {
    const res = await remoteCall(remote, storageKey, { method: 'GET' });
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await fs.readFile(mediaPath(storageKey)));
}

/** The URL platforms (Instagram, Facebook, Threads) download the file from. */
export function publicMediaUrl(storageKey: string): string {
  const remote = remoteStorage();
  return remote ? remote.publicUrl(storageKey) : `${appUrl()}/media/${storageKey}`;
}

/**
 * A short-lived signed URL the browser PUTs the file to directly, so large videos never pass
 * through our server (Vercel caps request bodies at 4.5 MB). Null when files stay on local disk.
 */
export async function createDirectUpload(mimeType: string): Promise<{ storageKey: string; url: string } | null> {
  const remote = remoteStorage();
  if (!remote) return null;
  const storageKey = newKey(mimeType);
  const url = new URL(remote.objectUrl(storageKey));
  url.searchParams.set('X-Amz-Expires', String(UPLOAD_URL_SECONDS));
  const signed = await remote.client.sign(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    aws: { signQuery: true },
  });
  return { storageKey, url: signed.url };
}

/** Size and first bytes of a directly uploaded object, or null if nothing was uploaded. */
export async function inspectUpload(storageKey: string): Promise<{ size: number; head: Uint8Array } | null> {
  if (!isStorageKey(storageKey)) return null;
  const remote = remoteStorage();
  if (!remote) return null;
  const res = await remoteCall(remote, storageKey, { method: 'GET', headers: { Range: 'bytes=0-15' }, allow404: true });
  if (res.status === 404) return null;
  const total = res.headers.get('content-range')?.match(/\/(\d+)$/)?.[1] ?? res.headers.get('content-length');
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 16);
  return { size: Number(total ?? 0), head };
}
