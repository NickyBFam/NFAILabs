/** Shown while an admin page loads its data. */
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-sm text-muted">Loading…</p>
      <div aria-hidden="true" className="h-8 w-1/3 animate-pulse rounded bg-surface-muted" />
      <div aria-hidden="true" className="h-40 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
