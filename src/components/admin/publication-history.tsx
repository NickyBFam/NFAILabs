import { formatTimestamp, stateLabels } from "@/components/admin/labels";
import type { PublicationEventView } from "@/components/admin/types";

/** State changes for one record, oldest first. */
export function PublicationHistory({ events }: { events: readonly PublicationEventView[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">No state changes are recorded yet.</p>;
  }

  return (
    <ol className="space-y-3 border-l border-line pl-4">
      {events.map((event) => (
        <li key={event.id} className="text-sm">
          <p className="font-medium text-foreground">
            {event.fromState ? `${stateLabels[event.fromState]} → ` : "Created as "}
            {stateLabels[event.toState]}
          </p>
          <p className="text-muted">
            {event.actorLabel} ·{" "}
            <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
          </p>
          {event.reason ? <p className="mt-1">Reason: {event.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
