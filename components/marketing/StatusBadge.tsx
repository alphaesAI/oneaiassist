const STYLES: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-800',
  SENT: 'bg-emerald-100 text-emerald-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PASS: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-sky-100 text-sky-800',
  PUBLISHING: 'bg-indigo-100 text-indigo-800',
  FAILED: 'bg-red-100 text-red-800',
  CRITICAL: 'bg-red-100 text-red-800',
  NEEDS_RECONNECT: 'bg-red-100 text-red-800',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-900',
  WARNING: 'bg-amber-100 text-amber-900',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STYLES[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}
