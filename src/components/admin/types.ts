/**
 * View models for the admin interface.
 *
 * Admin components render these shapes only. Server-side loaders in `src/app/admin/_data`
 * build them from the auth, permission, workflow and admin-query modules, so the UI never
 * reads the database, trusts client-supplied roles, or decides authorization on its own.
 * Hiding a control in the UI is a convenience; the server checks every action again.
 */

/** Permission codes (docs/ADMIN.md §4). The database and server-side checks are authoritative. */
export type AdminPermission =
  | "view_admin"
  | "edit_draft"
  | "submit_review"
  | "validate_fact"
  | "publish_fact"
  | "reject_fact"
  | "supersede_fact"
  | "withdraw_fact"
  | "view_audit"
  | "manage_admins";

/** Phase 2 publication lifecycle (`publication_states`). */
export type PublicationState =
  "draft" | "extracted" | "validated" | "published" | "rejected" | "superseded" | "withdrawn";

/** Records the admin interface manages. Values are the database table names. */
export type AdminRecordTable =
  | "providers"
  | "deployment_channels"
  | "model_families"
  | "model_versions"
  | "model_version_aliases"
  | "model_releases"
  | "capabilities"
  | "model_capabilities"
  | "benchmarks"
  | "benchmark_versions"
  | "benchmark_metrics"
  | "evaluation_harnesses"
  | "evaluation_harness_versions"
  | "evaluation_configurations"
  | "benchmark_results"
  | "pricing_records"
  | "sources"
  | "source_documents";

/** Tables with the Phase 2 publication lifecycle (everything except the source registry). */
export type FactTable = Exclude<AdminRecordTable, "sources" | "source_documents">;

/** The signed-in admin, as resolved on the server. */
export type AdminViewer = {
  displayName: string;
  roles: readonly string[];
  permissions: readonly AdminPermission[];
};

/** Workflow actions a record can offer. Availability is computed on the server. */
export type WorkflowAction =
  | "submit_review"
  | "recall"
  | "validate"
  | "publish"
  | "return_to_draft"
  | "reject"
  | "supersede"
  | "withdraw"
  | "close_period"
  | "delete_draft";

/** Why an action exists but cannot be used right now (for example a missing source). */
export type ActionAvailability = {
  action: WorkflowAction;
  enabled: boolean;
  disabledReason?: string;
};

/** Machine-readable reason codes accepted by `publication_events.reason_code`. */
export type ReasonCode =
  | "error_correction"
  | "source_retracted"
  | "source_changed"
  | "methodology_invalidated"
  | "duplicate"
  | "insufficient_evidence"
  | "out_of_scope"
  | "other";

export type SourceTier = "T1" | "T2" | "T3" | "T4" | "T5";

export type ProvenanceSummary = {
  /** Active (not revoked) links in a supporting role. */
  supportingCount: number;
  /** Highest-trust tier among the supporting links, when there are any. */
  bestTier: SourceTier | null;
  /** Whether the record meets the publication gate (an approved T1 to T3 source; D-028). */
  gateSatisfied: boolean;
};

export type ApprovalRequirement = {
  highImpact: boolean;
  required: number;
  received: number;
  /** Who validated the record, when it has been validated. */
  validatedBy: string | null;
  approvers: readonly string[];
};

export type ReviewQueueItem = {
  table: AdminRecordTable;
  recordId: string;
  label: string;
  state: PublicationState;
  submittedBy: string | null;
  submittedAt: string | null;
  provenance: ProvenanceSummary;
  approval: ApprovalRequirement;
  actions: readonly ActionAvailability[];
};

export type RecordSummary = {
  table: AdminRecordTable;
  id: string;
  label: string;
  /** Short secondary text, for example the parent family or benchmark version. */
  context?: string;
  /** Null for tables without a publication lifecycle (the source registry). */
  state: PublicationState | null;
  updatedAt: string;
};

export type ProvenanceLinkView = {
  id: string;
  role: string;
  tier: SourceTier;
  sourceName: string;
  documentTitle: string;
  documentUrl: string | null;
  locator: string | null;
  evidenceNote: string | null;
  revoked: boolean;
};

export type PublicationEventView = {
  id: string;
  fromState: PublicationState | null;
  toState: PublicationState;
  actorLabel: string;
  occurredAt: string;
  reason: string | null;
};

export type RecordField = { label: string; value: string | null };

export type RecordDetail = RecordSummary & {
  /** Display rows for the record's content. */
  fields: readonly RecordField[];
  /** Current raw values by column, used to prefill the edit form. */
  values: Readonly<Record<string, string | readonly string[] | null>>;
  /** Whether the viewer may edit it now (an unsubmitted draft and edit permission). */
  editable: boolean;
  /** Source registry status, for `sources` rows only. */
  sourceStatus?: "proposed" | "approved" | "retired";
  provenance: readonly ProvenanceLinkView[];
  provenanceSummary: ProvenanceSummary | null;
  approval: ApprovalRequirement | null;
  history: readonly PublicationEventView[];
  actions: readonly ActionAvailability[];
};

export type AuditEntry = {
  id: string;
  occurredAt: string;
  actorLabel: string;
  actorKind: "user" | "service" | "system" | "database";
  action: string;
  table: string;
  recordId: string | null;
  reason: string | null;
  fromState: PublicationState | null;
  toState: PublicationState | null;
  changedColumns: readonly string[];
};

/** Result of a server action, shaped for `useActionState`. Messages are already sanitized. */
export type ActionResult =
  | { status: "idle" }
  | { status: "success"; message: string; recordId?: string }
  | { status: "error"; message: string; fieldErrors?: Readonly<Record<string, string>> };

export const idleResult: ActionResult = { status: "idle" };

/** Role codes (docs/ADMIN.md §4). Code checks permissions, never these names. */
export type AdminRole = "viewer" | "editor" | "reviewer" | "publisher" | "administrator";

/** An admin identity as shown on the access page. */
export type AdminIdentityView = {
  /** The Supabase Auth user id, which is the identity's permanent id. */
  id: string;
  displayName: string;
  status: "active" | "disabled";
  disabledReason: string | null;
  activeRoles: readonly AdminRole[];
  createdAt: string;
  /** The signed-in viewer's own row; administrators cannot change their own access. */
  isSelf: boolean;
};

export type RoleHistoryEntry = {
  id: string;
  adminLabel: string;
  role: AdminRole;
  change: "granted" | "revoked";
  actorLabel: string;
  occurredAt: string;
  reason: string | null;
};
