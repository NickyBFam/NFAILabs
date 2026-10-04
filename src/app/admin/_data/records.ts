import "server-only";
import { notFound } from "next/navigation";
import type { AuditFilters } from "@/app/admin/_data/audit-filters";
import type { FieldOption } from "@/components/admin/draft-fields";
import { isAdminRecordTable } from "@/components/admin/labels";
import type {
  AdminIdentityView,
  AdminRecordTable,
  AuditEntry,
  RecordDetail,
  RecordSummary,
  RoleHistoryEntry,
  ReviewQueueItem,
} from "@/components/admin/types";
import type { AdminFailure, AdminResult } from "@/lib/admin/mutations/result";
import {
  getRecord,
  listAdmins,
  listAuditEntries,
  listRecords,
  listReferenceOptions,
  listReviewQueue,
  listRoleHistory,
} from "@/lib/admin/queries/server";

/**
 * Read adapter for admin pages. Every call goes through the admin query layer, which
 * re-authenticates, checks the read permission and reads through SECURITY DEFINER
 * functions with the admin's own token. A failed read is shown as a sanitized message
 * by the nearest error boundary; it is never replaced with empty data.
 */

export class AdminReadError extends Error {
  override readonly name = "AdminReadError";
  readonly code: AdminFailure["code"];

  constructor(failure: AdminFailure) {
    // `failure.message` is already sanitized by the query layer.
    super(failure.message);
    this.code = failure.code;
  }
}

function unwrap<T>(result: AdminResult<T>): T {
  if (!result.ok) throw new AdminReadError(result);
  if (result.data === undefined) {
    throw new AdminReadError({ ok: false, code: "internal", message: "No data was returned." });
  }
  return result.data;
}

export async function loadReviewQueue(): Promise<readonly ReviewQueueItem[]> {
  return unwrap(await listReviewQueue());
}

export async function loadRecordList(table: AdminRecordTable): Promise<readonly RecordSummary[]> {
  return unwrap(await listRecords({ table, limit: 100 }));
}

/** The record, or the not-found page when the table or id is unknown. */
export async function loadRecordDetail(table: string, id: string): Promise<RecordDetail> {
  if (!isAdminRecordTable(table)) notFound();
  const result = await getRecord({ table, id });
  if (!result.ok && (result.code === "not_found" || result.code === "invalid_input")) notFound();
  return unwrap(result);
}

export async function loadReferenceOptions(table: AdminRecordTable): Promise<FieldOption[]> {
  return [...unwrap(await listReferenceOptions({ table }))];
}

export async function loadAuditEntries(
  filters: AuditFilters,
): Promise<{ entries: readonly AuditEntry[]; nextCursor: string | null }> {
  return unwrap(
    await listAuditEntries({
      table: filters.table,
      recordId: filters.record,
      actorId: filters.actor,
      from: filters.from,
      to: filters.to,
      cursor: filters.cursor,
      limit: 50,
    }),
  );
}

export async function loadAdmins(): Promise<readonly AdminIdentityView[]> {
  return unwrap(await listAdmins());
}

export async function loadRoleHistory(): Promise<readonly RoleHistoryEntry[]> {
  return unwrap(await listRoleHistory({ limit: 100 }));
}
