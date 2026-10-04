import type { AdminRecordTable } from "@/components/admin/types";

/** Detail page for any managed record. */
export function recordHref(table: AdminRecordTable, id: string): string {
  return `/admin/records/${table}/${encodeURIComponent(id)}`;
}

/** Create form for a managed record type. */
export function newRecordHref(table: AdminRecordTable): string {
  return `/admin/records/${table}/new`;
}
