import type {
  ApprovalRequirement,
  AuditEntry,
  ProvenanceLinkView,
  ProvenanceSummary,
  PublicationEventView,
  PublicationState,
  RecordDetail,
  RecordField,
  RecordSummary,
  ReviewQueueItem,
  SourceTier,
} from "@/components/admin/types";
import type { AuthorizedAdmin } from "@/lib/admin/mutations/authorization";
import type { AdminContext } from "@/lib/admin/mutations/context";
import { ADMIN_ENTITIES, type AdminEntityKey } from "@/lib/admin/mutations/entities";
import { AdminActionError } from "@/lib/admin/mutations/errors";
import type { AdminResult } from "@/lib/admin/mutations/result";
import { parseInput } from "@/lib/admin/mutations/validation";
import { availableActions, isEditable } from "@/lib/admin/queries/availability";
import { num, readOne, readRows, runAdminQuery, str, strings } from "@/lib/admin/queries/runner";

/**
 * Admin reads: review queue, current record state, provenance, audit history
 * and permission-aware action availability. Each wraps Thread B's SECURITY
 * DEFINER read functions (docs/ADMIN.md §5), called with the admin's own JWT;
 * those functions check `view_admin` / `view_audit` in SQL and return explicit
 * columns only. Results are shaped as the admin UI's view models.
 */

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const SOURCE_TABLES = {
  sources: { label: "name" },
  source_documents: { label: "title" },
} as const;

type ReadableTable = AdminEntityKey | keyof typeof SOURCE_TABLES;

/** Tables exempt from the provenance gate (D-028): vocabulary and reusable conditions. */
const NO_PROVENANCE_REQUIRED: ReadonlySet<string> = new Set([
  "capabilities",
  "evaluation_configurations",
]);

function readableTable(reference: unknown): ReadableTable {
  const name = typeof reference === "string" ? reference.replace(/^public\./, "") : "";
  if (Object.prototype.hasOwnProperty.call(ADMIN_ENTITIES, name)) return name as AdminEntityKey;
  if (Object.prototype.hasOwnProperty.call(SOURCE_TABLES, name)) {
    return name as keyof typeof SOURCE_TABLES;
  }
  throw new AdminActionError("invalid_input", "unknown table", {
    fieldErrors: { table: "Unknown record type." },
  });
}

const isFactTable = (table: ReadableTable): table is AdminEntityKey => table in ADMIN_ENTITIES;
const qualified = (table: ReadableTable) => `public.${table}`;

function labelColumn(table: ReadableTable): string {
  return isFactTable(table) ? ADMIN_ENTITIES[table].labelColumn : SOURCE_TABLES[table].label;
}

const PUBLICATION_STATES: ReadonlySet<string> = new Set([
  "draft",
  "extracted",
  "validated",
  "published",
  "rejected",
  "superseded",
  "withdrawn",
]);
const asState = (value: string | null): PublicationState | null =>
  value && PUBLICATION_STATES.has(value) ? (value as PublicationState) : null;

const TIERS: readonly SourceTier[] = ["T1", "T2", "T3", "T4", "T5"];
const asTier = (value: string | null): SourceTier | null =>
  TIERS.includes(value as SourceTier) ? (value as SourceTier) : null;

// ---------------------------------------------------------------------------
// Shared mappers
// ---------------------------------------------------------------------------

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => displayValue(item) ?? "").join(", ");
  return JSON.stringify(value);
}

function formValue(value: unknown): string | readonly string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => displayValue(item) ?? "");
  return displayValue(value);
}

function humanize(column: string): string {
  const text = column.replace(/_id$/, "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function summaryOf(table: ReadableTable, row: Record<string, unknown>): RecordSummary {
  const id = str(row, "id");
  if (!id) throw new AdminActionError("internal", "record row without id");
  const state = isFactTable(table) ? asState(str(row, "publication_state")) : null;
  return {
    table,
    id,
    label: displayValue(row[labelColumn(table)]) ?? id,
    state,
    updatedAt: str(row, "updated_at") ?? str(row, "created_at") ?? "",
  };
}

const SUPPORTING_ROLES: ReadonlySet<string> = new Set(["primary", "corroborating", "verification"]);
const GATE_TIERS: ReadonlySet<string> = new Set(["T1", "T2", "T3"]);

function provenanceView(row: Record<string, unknown>): ProvenanceLinkView {
  return {
    id: str(row, "link_id") ?? "",
    role: str(row, "role") ?? "",
    tier: asTier(str(row, "tier_at_citation")) ?? "T5",
    sourceName: str(row, "source_name") ?? "",
    documentTitle: str(row, "document_title") ?? "",
    documentUrl: str(row, "document_original_url"),
    locator: str(row, "locator"),
    evidenceNote: str(row, "evidence_note"),
    revoked: str(row, "revoked_at") !== null,
  };
}

/** The D-028 gate, recomputed from the links for display; the database enforces it. */
export function summarizeProvenance(rows: readonly Record<string, unknown>[]): ProvenanceSummary {
  const supporting = rows.filter(
    (row) => str(row, "revoked_at") === null && SUPPORTING_ROLES.has(str(row, "role") ?? ""),
  );
  const tiers = supporting
    .map((row) => asTier(str(row, "tier_at_citation")))
    .filter((tier): tier is SourceTier => tier !== null)
    .sort();
  return {
    supportingCount: supporting.length,
    bestTier: tiers[0] ?? null,
    gateSatisfied: supporting.some(
      (row) =>
        GATE_TIERS.has(str(row, "tier_at_citation") ?? "") &&
        str(row, "source_registry_status") === "approved",
    ),
  };
}

type Status = Record<string, unknown>;

function approvalOf(status: Status, validatedByName: string | null): ApprovalRequirement {
  const required = num(status, "required_approvals") ?? 1;
  const validatedBy = str(status, "validated_by")
    ? (validatedByName ?? str(status, "validated_by"))
    : null;
  const state = str(status, "publication_state");
  return {
    highImpact: str(status, "approval_class") === "separated",
    required,
    received: state === "published" ? required : validatedBy ? 1 : 0,
    validatedBy,
    approvers: validatedBy ? [validatedBy] : [],
  };
}

function actionsOf(
  admin: AuthorizedAdmin,
  table: AdminEntityKey,
  status: Status,
  provenance: ProvenanceSummary,
) {
  return availableActions(admin.permissions, {
    state: str(status, "publication_state") ?? "",
    databaseActions: strings(status, "available_actions"),
    publishBlockedReason: str(status, "publish_blocked_reason"),
    requiresProvenance: !NO_PROVENANCE_REQUIRED.has(table),
    gateSatisfied: provenance.gateSatisfied,
  });
}

async function recordStatus(admin: AuthorizedAdmin, table: AdminEntityKey, id: string) {
  const status = await readOne(admin, "nfai_admin_record_status", {
    p_table: qualified(table),
    p_id: id,
  });
  if (!status) throw new AdminActionError("not_found");
  return status;
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export async function listReviewQueue(
  ctx: AdminContext,
  options: { limit?: number } = {},
): Promise<AdminResult<ReviewQueueItem[]>> {
  return runAdminQuery(ctx, "review_queue", "view_admin", async (admin) => {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 200);
    const rows = await readRows(admin, "nfai_admin_review_queue", { p_limit: limit });
    const items = await Promise.all(
      rows.map(async (row): Promise<ReviewQueueItem | null> => {
        const subject = (str(row, "subject_table") ?? "").replace(/^public\./, "");
        const recordId = str(row, "record_id");
        if (!recordId || !Object.prototype.hasOwnProperty.call(ADMIN_ENTITIES, subject))
          return null;
        const table = subject as AdminEntityKey;
        const args = { p_table: qualified(table), p_id: recordId };
        const [status, record, links] = await Promise.all([
          recordStatus(admin, table, recordId),
          readOne(admin, "nfai_admin_get_record", args),
          readRows(admin, "nfai_admin_provenance", args),
        ]);
        const provenance = summarizeProvenance(links);
        return {
          table,
          recordId,
          label: record ? summaryOf(table, record).label : recordId,
          state: asState(str(row, "publication_state")) ?? "draft",
          submittedBy: str(row, "submitted_by_name") ?? str(row, "submitted_by"),
          submittedAt: str(row, "submitted_at"),
          provenance,
          approval: approvalOf(status, str(row, "validated_by_name")),
          actions: actionsOf(admin, table, status, provenance),
        };
      }),
    );
    return items.filter((item): item is ReviewQueueItem => item !== null);
  });
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function listRecords(
  ctx: AdminContext,
  input: { table: unknown; limit?: number; offset?: number; states?: readonly string[] },
): Promise<AdminResult<RecordSummary[]>> {
  return runAdminQuery(ctx, "list_records", "view_admin", async (admin) => {
    const table = readableTable(input.table);
    const rows = await readRows(admin, "nfai_admin_list_records", {
      p_table: qualified(table),
      p_states: input.states && input.states.length > 0 ? [...input.states] : null,
      p_limit: Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 500),
      p_offset: Math.max(Math.trunc(input.offset ?? 0), 0),
    });
    return rows.map((row) => summaryOf(table, row));
  });
}

/** `{ value: id, label }` options for reference selects (most recent first). */
export async function listReferenceOptions(
  ctx: AdminContext,
  input: { table: unknown; limit?: number },
): Promise<AdminResult<{ value: string; label: string }[]>> {
  return runAdminQuery(ctx, "reference_options", "view_admin", async (admin) => {
    const table = readableTable(input.table);
    const rows = await readRows(admin, "nfai_admin_list_records", {
      p_table: qualified(table),
      p_states: null,
      p_limit: Math.min(Math.max(Math.trunc(input.limit ?? 500), 1), 500),
      p_offset: 0,
    });
    return rows.map((row) => {
      const summary = summaryOf(table, row);
      return { value: summary.id, label: summary.label };
    });
  });
}

function historyView(row: Record<string, unknown>): PublicationEventView | null {
  const kind = str(row, "entry_kind");
  const fromState = asState(str(row, "from_state"));
  const toState = asState(str(row, "to_state")) ?? fromState;
  if (!toState) return null;
  const action = str(row, "action");
  return {
    id: `${kind ?? "entry"}-${String(row.entry_id ?? "")}`,
    fromState,
    toState,
    actorLabel: str(row, "actor_name") ?? str(row, "actor_kind") ?? "unknown",
    occurredAt: str(row, "occurred_at") ?? "",
    reason:
      str(row, "reason") ??
      (kind === "workflow_action" && action ? `Workflow: ${action.replace(/_/g, " ")}` : null),
  };
}

export async function getRecord(
  ctx: AdminContext,
  input: { table: unknown; id: unknown },
): Promise<AdminResult<RecordDetail>> {
  return runAdminQuery(ctx, "get_record", "view_admin", async (admin) => {
    const table = readableTable(input.table);
    const { id } = parseInput({ id: { kind: "uuid", required: true } }, { id: input.id });
    const args = { p_table: qualified(table), p_id: id };
    const row = await readOne(admin, "nfai_admin_get_record", args);
    if (!row) throw new AdminActionError("not_found");
    const summary = summaryOf(table, row);

    const columns = isFactTable(table)
      ? Object.keys(ADMIN_ENTITIES[table].fields)
      : Object.keys(row).filter((key) => !["id", "created_at", "updated_at"].includes(key));
    const fields: RecordField[] = columns.map((column) => ({
      label: humanize(column),
      value: displayValue(row[column]),
    }));
    const values = Object.fromEntries(columns.map((column) => [column, formValue(row[column])]));

    if (!isFactTable(table)) {
      const registry = str(row, "registry_status");
      return {
        ...summary,
        fields,
        values,
        editable: false,
        ...(table === "sources" &&
        (registry === "proposed" || registry === "approved" || registry === "retired")
          ? { sourceStatus: registry }
          : {}),
        provenance: [],
        provenanceSummary: null,
        approval: null,
        history: [],
        actions: [],
      };
    }

    const [status, links, history] = await Promise.all([
      recordStatus(admin, table, id as string),
      readRows(admin, "nfai_admin_provenance", args),
      admin.permissions.has("view_audit")
        ? readRows(admin, "nfai_admin_record_history", args)
        : Promise.resolve([]),
    ]);
    const provenanceSummary = summarizeProvenance(links);
    const validatorName =
      [...history]
        .reverse()
        .find((entry) => str(entry, "to_state") === "validated" && str(entry, "actor_name")) ??
      null;
    return {
      ...summary,
      fields,
      values,
      editable: isEditable(strings(status, "available_actions")),
      provenance: links.map(provenanceView),
      provenanceSummary,
      approval: approvalOf(status, validatorName ? str(validatorName, "actor_name") : null),
      history: history
        .map(historyView)
        .filter((entry): entry is PublicationEventView => entry !== null),
      actions: actionsOf(admin, table, status, provenanceSummary),
    };
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditFilters = {
  table?: unknown;
  recordId?: unknown;
  actorId?: unknown;
  /** Inclusive day, YYYY-MM-DD (UTC). */
  from?: unknown;
  /** Inclusive day, YYYY-MM-DD (UTC). */
  to?: unknown;
  cursor?: unknown;
  limit?: number;
};

const ACTOR_KINDS: ReadonlySet<string> = new Set(["user", "service", "system", "database"]);

function stateChange(
  row: Record<string, unknown>,
  key: "old_row" | "new_row",
): PublicationState | null {
  const image = row[key];
  if (typeof image !== "object" || image === null) return null;
  return asState(str(image as Record<string, unknown>, "publication_state"));
}

function auditView(row: Record<string, unknown>): AuditEntry {
  const changed = strings(row, "changed_columns");
  const action = str(row, "action") ?? "";
  const fromState = action === "INSERT" ? null : stateChange(row, "old_row");
  const toState = stateChange(row, "new_row");
  const kind = str(row, "actor_kind") ?? "database";
  return {
    id: String(row.id ?? ""),
    occurredAt: str(row, "occurred_at") ?? "",
    actorLabel: str(row, "actor_name") ?? str(row, "actor_label") ?? kind,
    actorKind: (ACTOR_KINDS.has(kind) ? kind : "database") as AuditEntry["actorKind"],
    action,
    table: (str(row, "table_name") ?? "").replace(/^public\./, ""),
    recordId: str(row, "record_key"),
    reason: str(row, "reason"),
    fromState: action === "UPDATE" && !changed.includes("publication_state") ? null : fromState,
    toState: action === "UPDATE" && !changed.includes("publication_state") ? null : toState,
    changedColumns: changed,
  };
}

export async function listAuditEntries(
  ctx: AdminContext,
  filters: AuditFilters = {},
): Promise<AdminResult<{ entries: AuditEntry[]; nextCursor: string | null }>> {
  return runAdminQuery(ctx, "audit_log", "view_audit", async (admin) => {
    const parsed = parseInput(
      {
        recordId: { kind: "uuid" },
        actorId: { kind: "uuid" },
        from: { kind: "date" },
        to: { kind: "date" },
        cursor: { kind: "integer", min: 1 },
      },
      {
        recordId: filters.recordId,
        actorId: filters.actorId,
        from: filters.from,
        to: filters.to,
        cursor: filters.cursor,
      },
    );
    const table =
      filters.table === undefined || filters.table === null || filters.table === ""
        ? null
        : qualified(readableTable(filters.table));
    const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 50), 1), 200);
    const nextDay = (day: string) =>
      new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString();

    const rows = await readRows(admin, "nfai_admin_audit_log", {
      p_table: table,
      p_record_id: parsed.recordId ?? null,
      p_actor_id: parsed.actorId ?? null,
      p_from: parsed.from ? `${parsed.from as string}T00:00:00Z` : null,
      p_to: parsed.to ? nextDay(parsed.to as string) : null,
      p_before_id: parsed.cursor ?? null,
      p_limit: limit,
    });
    const entries = rows.map(auditView);
    const lastId = num(rows.at(-1) ?? {}, "id");
    return {
      entries,
      nextCursor: rows.length === limit && lastId !== null ? String(lastId) : null,
    };
  });
}
