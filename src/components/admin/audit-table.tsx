import { formatTimestamp, stateLabels, tableLabel } from "@/components/admin/labels";
import { EmptyState } from "@/components/admin/notice";
import type { AuditEntry } from "@/components/admin/types";

function stateChange(entry: AuditEntry): string {
  if (!entry.toState) return "—";
  const from = entry.fromState ? stateLabels[entry.fromState] : "New";
  return `${from} → ${stateLabels[entry.toState]}`;
}

export function AuditTable({ entries }: { entries: readonly AuditEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="No audit entries match">Try a wider filter.</EmptyState>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <caption className="sr-only">Audit history, newest first</caption>
        <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              When
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Actor
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Action
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Record
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              State change
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Reason
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {entries.map((entry) => (
            <tr key={entry.id} className="align-top">
              <td className="px-3 py-2 whitespace-nowrap">
                <time dateTime={entry.occurredAt}>{formatTimestamp(entry.occurredAt)}</time>
              </td>
              <td className="px-3 py-2">
                {entry.actorLabel}
                <span className="block text-xs text-muted">{entry.actorKind}</span>
              </td>
              <td className="px-3 py-2">
                {entry.action}
                {entry.changedColumns.length > 0 ? (
                  <span className="block text-xs text-muted">
                    Changed: {entry.changedColumns.join(", ")}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                {tableLabel(entry.table)}
                <span className="block font-mono text-xs break-all text-muted">
                  {entry.recordId ?? "—"}
                </span>
              </td>
              <td className="px-3 py-2">{stateChange(entry)}</td>
              <td className="px-3 py-2">{entry.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
