import { stateLabels } from "@/components/admin/labels";
import type { PublicationState } from "@/components/admin/types";
import { cn } from "@/lib/cn";

const tones: Record<PublicationState, string> = {
  draft: "border-line bg-surface-muted text-muted",
  extracted: "border-notice-line bg-notice text-notice-foreground",
  validated:
    "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100",
  published: "border-transparent bg-accent-soft text-foreground",
  rejected:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  superseded: "border-line bg-surface text-muted line-through decoration-1",
  withdrawn: "border-red-300 bg-surface text-red-800 dark:border-red-800 dark:text-red-200",
};

/** Publication state as text plus color; the text alone carries the meaning. */
export function StateBadge({ state }: { state: PublicationState | null }) {
  if (state === null) {
    return <span className="text-sm text-muted">Not versioned</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[state],
      )}
    >
      {stateLabels[state]}
    </span>
  );
}
