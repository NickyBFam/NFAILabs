import Link from "next/link";
import { formatTimestamp, tableLabel } from "@/components/admin/labels";
import { EmptyState } from "@/components/admin/notice";
import { ApprovalText, ProvenanceSummaryText } from "@/components/admin/provenance-summary";
import { StateBadge } from "@/components/admin/state-badge";
import type { ReviewQueueItem } from "@/components/admin/types";
import { recordHref } from "@/components/admin/record-links";

export function ReviewQueue({ items }: { items: readonly ReviewQueueItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing is waiting for review">
        Submitted, extracted and validated records appear here.
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <caption className="sr-only">Records waiting for review</caption>
        <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Record
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              State
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Submitted
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Provenance
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Approval
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={`${item.table}:${item.recordId}`} className="align-top">
              <th scope="row" className="px-3 py-2 font-medium">
                <Link
                  href={recordHref(item.table, item.recordId)}
                  className="text-accent underline"
                >
                  {item.label}
                </Link>
              </th>
              <td className="px-3 py-2">{tableLabel(item.table)}</td>
              <td className="px-3 py-2">
                <StateBadge state={item.state} />
              </td>
              <td className="px-3 py-2">
                {item.submittedBy ?? "—"}
                <span className="block text-xs text-muted">
                  {formatTimestamp(item.submittedAt)}
                </span>
              </td>
              <td className="px-3 py-2">
                <ProvenanceSummaryText summary={item.provenance} />
              </td>
              <td className="px-3 py-2">
                <ApprovalText approval={item.approval} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
