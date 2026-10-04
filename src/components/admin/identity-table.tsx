import type { ReactNode } from "react";
import { formatTimestamp, roleLabels } from "@/components/admin/labels";
import { EmptyState } from "@/components/admin/notice";
import type { AdminIdentityView, RoleHistoryEntry } from "@/components/admin/types";

type IdentityTableProps = {
  identities: readonly AdminIdentityView[];
  /** Renders the change controls for one row (supplied by the page). */
  renderActions: (identity: AdminIdentityView) => ReactNode;
};

export function IdentityTable({ identities, renderActions }: IdentityTableProps) {
  if (identities.length === 0) {
    return <EmptyState title="No admin identities yet" />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <caption className="sr-only">Admin identities</caption>
        <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Name
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Status
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Roles
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Changes
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {identities.map((identity) => (
            <tr key={identity.id} className="align-top">
              <th scope="row" className="px-3 py-2 font-medium">
                {identity.displayName}
                {identity.isSelf ? <span className="text-muted"> (you)</span> : null}
                <span className="block font-mono text-xs font-normal break-all text-muted">
                  {identity.id}
                </span>
              </th>
              <td className="px-3 py-2">
                {identity.status === "active" ? "Active" : "Disabled"}
                {identity.disabledReason ? (
                  <span className="block text-xs text-muted">{identity.disabledReason}</span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                {identity.activeRoles.length > 0
                  ? identity.activeRoles.map((role) => roleLabels[role]).join(", ")
                  : "None"}
              </td>
              <td className="px-3 py-2">{renderActions(identity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RoleHistory({ entries }: { entries: readonly RoleHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted">No role changes are recorded yet.</p>;
  }
  return (
    <ol className="space-y-3 border-l border-line pl-4">
      {entries.map((entry) => (
        <li key={entry.id} className="text-sm">
          <p className="font-medium">
            {roleLabels[entry.role]} {entry.change} for {entry.adminLabel}
          </p>
          <p className="text-muted">
            {entry.actorLabel} ·{" "}
            <time dateTime={entry.occurredAt}>{formatTimestamp(entry.occurredAt)}</time>
          </p>
          {entry.reason ? <p className="mt-1">Reason: {entry.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
