export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function appUrl(): string {
  const url = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000';
  return url.replace(/\/+$/, '');
}

export function appUrlIsPublic(): boolean {
  try {
    const url = new URL(appUrl());
    const local = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
    return url.protocol === 'https:' && !local;
  } catch {
    return false;
  }
}

export function dataDir(): string {
  return process.env.DATA_DIR || '.data';
}
