type NotImplementedNoticeProps = {
  plannedPhases: string;
};

/**
 * States plainly that a section has no functionality or data yet.
 * Used on every placeholder route so unfinished areas are never mistaken for real content.
 */
export function NotImplementedNotice({ plannedPhases }: NotImplementedNoticeProps) {
  return (
    <div
      role="note"
      aria-label="Not yet available"
      className="rounded-lg border border-notice-line bg-notice p-4 text-sm text-notice-foreground"
    >
      <p className="font-semibold">Not yet available</p>
      <p className="mt-1">
        This section is a placeholder. It has no functionality or data yet, and nothing on this page
        is a real ranking, score, price, or model record. Planned delivery: {plannedPhases}.
      </p>
    </div>
  );
}
