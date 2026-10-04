import Link from "next/link";
import { formatTimestamp } from "@/components/admin/labels";
import { EmptyState } from "@/components/admin/notice";
import { recordHref } from "@/components/admin/record-links";
import { StateBadge } from "@/components/admin/state-badge";
import type { RecordSummary } from "@/components/admin/types";

type RecordTableProps = {
  caption: string;
  records: readonly RecordSummary[];
  contextLabel?: string;
  emptyTitle: string;
  emptyHint?: string;
};

export function RecordTable({
  caption,
  records,
  contextLabel,
  emptyTitle,
  emptyHint,
}: RecordTableProps) {
  if (records.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Name
            </th>
            {contextLabel ? (
              <th scope="col" className="px-3 py-2 font-semibold">
                {contextLabel}
              </th>
            ) : null}
            <th scope="col" className="px-3 py-2 font-semibold">
              State
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Updated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {records.map((record) => (
            <tr key={record.id}>
              <th scope="row" className="px-3 py-2 font-medium">
                <Link href={recordHref(record.table, record.id)} className="text-accent underline">
                  {record.label}
                </Link>
              </th>
              {contextLabel ? <td className="px-3 py-2">{record.context ?? "—"}</td> : null}
              <td className="px-3 py-2">
                <StateBadge state={record.state} />
              </td>
              <td className="px-3 py-2 text-muted">{formatTimestamp(record.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
