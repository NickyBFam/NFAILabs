import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AuditTable } from "@/components/admin/audit-table";
import { tableLabels } from "@/components/admin/labels";
import { Notice } from "@/components/admin/notice";
import { buttonClass, inputClass } from "@/components/admin/styles";
import type { AdminRecordTable } from "@/components/admin/types";
import { parseAuditFilters } from "@/app/admin/_data/audit-filters";
import { loadAuditEntries } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

export const metadata: Metadata = { title: "Audit" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await loadViewer();
  if (!viewer.permissions.includes("view_audit")) {
    return <AccessDenied title="Audit" permission="view_audit" />;
  }

  const { filters, errors } = parseAuditFilters(await searchParams);
  const page = errors.length === 0 ? await loadAuditEntries(filters) : null;
  const tables = Object.entries(tableLabels) as [AdminRecordTable, { plural: string }][];

  const nextHref = page?.nextCursor
    ? `/admin/audit?${new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(filters).filter(([key, value]) => key !== "cursor" && value),
        ),
        cursor: page.nextCursor,
      }).toString()}`
    : null;

  return (
    <>
      <AdminPageHeader
        title="Audit"
        description="Every recorded change and publication step: who acted, what changed, when and why. Internal only; never shown publicly."
      />

      <form
        method="get"
        className="mt-6 grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6"
      >
        <div className="lg:col-span-2">
          <label htmlFor="audit-table" className="block text-sm font-medium">
            Record type
          </label>
          <select
            id="audit-table"
            name="table"
            defaultValue={filters.table ?? ""}
            className={`${inputClass} mt-1`}
          >
            <option value="">All record types</option>
            {tables.map(([table, labels]) => (
              <option key={table} value={table}>
                {labels.plural}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="audit-record" className="block text-sm font-medium">
            Record ID
          </label>
          <input
            id="audit-record"
            name="record"
            defaultValue={filters.record ?? ""}
            className={`${inputClass} mt-1 font-mono`}
          />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="audit-actor" className="block text-sm font-medium">
            Actor ID
          </label>
          <input
            id="audit-actor"
            name="actor"
            defaultValue={filters.actor ?? ""}
            className={`${inputClass} mt-1 font-mono`}
          />
        </div>
        <div>
          <label htmlFor="audit-from" className="block text-sm font-medium">
            From (UTC)
          </label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
            className={`${inputClass} mt-1`}
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="block text-sm font-medium">
            To (UTC, inclusive)
          </label>
          <input
            id="audit-to"
            name="to"
            type="date"
            defaultValue={filters.to ?? ""}
            className={`${inputClass} mt-1`}
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-4">
          <button type="submit" className={buttonClass("primary")}>
            Apply filters
          </button>
          <Link href="/admin/audit" className={buttonClass("secondary")}>
            Clear
          </Link>
        </div>
      </form>

      <div className="mt-6 space-y-4">
        {errors.length > 0 ? (
          <Notice tone="error" title="Some filters are not valid">
            <ul className="list-disc pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {page ? <AuditTable entries={page.entries} /> : null}
        {nextHref ? (
          <Link href={nextHref} className={buttonClass("secondary")}>
            Older entries
          </Link>
        ) : null}
      </div>
    </>
  );
}
