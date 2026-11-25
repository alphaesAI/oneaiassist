import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { ConnectionWarning } from '@/lib/marketing/connections';

const PLATFORM_NAMES: Record<string, string> = {
  FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', THREADS: 'Threads', TWITTER: 'X',
  YOUTUBE: 'YouTube', LINKEDIN: 'LinkedIn', META_ADS: 'Meta ad account',
};

function describe(w: ConnectionWarning, now: number): string {
  if (w.problem === 'RECONNECT') return 'needs to be reconnected';
  if (w.problem === 'EXPIRED') return 'has expired';
  const days = Math.max(1, Math.ceil(((w.expiresAt?.getTime() ?? now) - now) / 86_400_000));
  return `expires in ${days} day${days === 1 ? '' : 's'}`;
}

/** Shown on every dashboard page while a connection is broken or about to expire. */
export function ConnectionBanner({ warnings }: { warnings: ConnectionWarning[] }) {
  if (!warnings.length) return null;
  const now = Date.now();
  const urgent = warnings.some((w) => w.problem !== 'EXPIRING');
  const hasChannels = warnings.some((w) => w.kind === 'channel');
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl border p-4 text-xs ${urgent ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-bold">
          {urgent ? 'Some connections stopped working. Posts to them will fail until you reconnect.' : 'Some connections expire soon.'}
        </p>
        <ul className="space-y-0.5">
          {warnings.slice(0, 5).map((w) => (
            <li key={`${w.kind}-${w.id}`}>
              <strong>{w.name}</strong> ({PLATFORM_NAMES[w.platform] ?? w.platform}) {describe(w, now)}
            </li>
          ))}
          {warnings.length > 5 && <li>and {warnings.length - 5} more</li>}
        </ul>
      </div>
      <Link
        href={hasChannels ? '/dashboard/accounts' : '/dashboard/ads'}
        className="shrink-0 rounded-lg bg-white/80 px-3 py-1.5 font-bold shadow-xs ring-1 ring-black/5 hover:bg-white"
      >
        Reconnect
      </Link>
    </div>
  );
}
