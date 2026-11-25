import dns from 'node:dns';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, Dispatcher, fetch as undiciFetch } from 'undici';

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  dispatcher?: Dispatcher;
}

export const DEFAULT_TIMEOUT_MS = 3500;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const DEFAULT_MAX_REDIRECTS = 3;
export const DEFAULT_USER_AGENT = 'MH-Digital-Marketing-RSS/1.0';

/**
 * Checks whether an IP string is a valid public unicast IP address.
 * Converts IPv4-mapped IPv6, and allows only range() === 'unicast'.
 * Rejects private, loopback, link-local, carrier-grade NAT, multicast, reserved, and invalid IPs.
 */
export function isUnicastIp(ip: string): boolean {
  try {
    const addr = ipaddr.process(ip);
    return addr.range() === 'unicast';
  } catch {
    return false;
  }
}

/**
 * Convenience helper: returns true if an IP is private, reserved, or non-unicast.
 */
export function isPrivateIp(ip: string): boolean {
  return !isUnicastIp(ip);
}

/**
 * Custom DNS lookup handler for undici Agent.
 * Intercepts DNS resolution immediately before connection to prevent DNS rebinding:
 * if any resolved address is not a public unicast address, connection is aborted with an error.
 */
export function safeLookup(
  hostname: string,
  optionsOrCallback: any,
  maybeCallback?: (err: Error | null, address?: any, family?: number) => void
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
  const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};

  dns.lookup(hostname, options, (err, addressOrAddresses, family) => {
    if (err) {
      return callback(err);
    }

    const addresses: string[] = Array.isArray(addressOrAddresses)
      ? addressOrAddresses.map((a: any) => a.address)
      : [addressOrAddresses as string];

    for (const addr of addresses) {
      if (!isUnicastIp(addr)) {
        return callback(new Error(`SSRF blocked: address ${addr} is not a public unicast address`));
      }
    }

    callback(null, addressOrAddresses, family);
  });
}

// Shared undici agent enforcing safeLookup for all outbound connections
export const defaultSafeAgent = new Agent({
  connect: {
    lookup: safeLookup,
  },
});

/**
 * Validates that a URL uses http/https and resolves exclusively to non-private,
 * non-loopback, non-link-local public unicast IP addresses.
 */
export async function isSafeUrl(rawUrl: string): Promise<boolean> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const host = url.hostname.replace(/^\[|\]$/g, '').trim();
    if (!host) {
      return false;
    }

    if (net.isIP(host)) {
      return isUnicastIp(host);
    }

    const addrs = await dns.promises.lookup(host, { all: true });
    if (!addrs || addrs.length === 0) {
      return false;
    }

    for (const a of addrs) {
      if (!isUnicastIp(a.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Safely fetches a remote URL protected against SSRF and DNS rebinding:
 * - Allows only http: and https: protocols
 * - Uses undici fetch with custom safeLookup dispatcher to pin and verify IP addresses at connect time
 * - Re-checks every redirect hop through the same secure Agent, capped at maxRedirects (default 3)
 * - Enforces timeout (default 3500ms)
 * - Limits response size and streams response chunks without loading unlimited bodies (default 2 MB)
 * - Returns response text if successful, or null on error / blocked target
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const dispatcher = options.dispatcher ?? defaultSafeAgent;

  let currentUrl = rawUrl;
  let redirectsRemaining = maxRedirects;

  try {
    while (true) {
      const url = new URL(currentUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }

      const host = url.hostname.replace(/^\[|\]$/g, '').trim();
      if (!host) {
        return null;
      }

      // If the hostname is already an IP literal, verify it before connecting
      if (net.isIP(host) && !isUnicastIp(host)) {
        return null;
      }

      const res = await undiciFetch(currentUrl, {
        dispatcher,
        method: 'GET',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
          ...options.headers,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        if (redirectsRemaining <= 0) {
          return null; // Redirect limit reached
        }
        const location = res.headers.get('location');
        if (!location) {
          return null;
        }

        // Resolve redirect URL (relative or absolute)
        const nextUrl = new URL(location, currentUrl).toString();
        currentUrl = nextUrl;
        redirectsRemaining--;
        continue;
      }

      if (!res.ok) {
        return null;
      }

      // Check Content-Length header if present
      const cl = res.headers.get('content-length');
      if (cl) {
        const parsedCl = parseInt(cl, 10);
        if (!isNaN(parsedCl) && parsedCl > maxBytes) {
          return null;
        }
      }

      if (!res.body) {
        return '';
      }

      // Stream body with strict size cap
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > maxBytes) {
            await reader.cancel('Max body size exceeded');
            return null;
          }
          chunks.push(value);
        }
      }

      return Buffer.concat(chunks).toString('utf-8');
    }
  } catch {
    return null;
  }
}
