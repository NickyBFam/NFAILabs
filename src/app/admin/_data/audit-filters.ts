import { isAdminRecordTable } from "@/components/admin/labels";
import type { AdminRecordTable } from "@/components/admin/types";

/** Audit filters from the query string. Invalid values are reported, never sent to the database. */

export type AuditFilters = {
  table?: AdminRecordTable;
  record?: string;
  actor?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR = /^[A-Za-z0-9_=:.-]{1,200}$/;

function single(value: string | string[] | undefined): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}

/** Validates audit filters. Invalid values are reported, never passed to the database. */
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): {
  filters: AuditFilters;
  errors: string[];
} {
  const filters: AuditFilters = {};
  const errors: string[] = [];

  const table = single(params.table);
  if (table) {
    if (isAdminRecordTable(table)) filters.table = table;
    else errors.push("Choose a record type from the list.");
  }
  const record = single(params.record);
  if (record) {
    if (UUID.test(record)) filters.record = record.toLowerCase();
    else errors.push("Record ID must be a full ID.");
  }
  const actor = single(params.actor);
  if (actor) {
    if (UUID.test(actor)) filters.actor = actor.toLowerCase();
    else errors.push("Actor ID must be a full ID.");
  }
  for (const key of ["from", "to"] as const) {
    const value = single(params[key]);
    if (!value) continue;
    if (DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))) filters[key] = value;
    else errors.push(`${key === "from" ? "From" : "To"} must be a date.`);
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    errors.push("From must be on or before To.");
  }
  const cursor = single(params.cursor);
  if (cursor) {
    if (CURSOR.test(cursor)) filters.cursor = cursor;
    else errors.push("The page link is not valid. Clear the filters and try again.");
  }
  return { filters, errors };
}
