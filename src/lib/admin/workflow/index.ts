/**
 * Review and approval workflow vocabulary (docs/ADMIN.md §5–§6).
 *
 * Migration 0007 enforces every rule here in SQL (`nfai_admin_*` functions and
 * the publication-state guard). These constants type the RPC contract and let
 * the UI explain outcomes; a database test fails if they drift from 0007.
 */

/** The Phase 2 publication lifecycle (D-027). "Submitted" is not a state. */
export const PUBLICATION_STATES = [
  "draft",
  "extracted",
  "validated",
  "published",
  "rejected",
  "superseded",
  "withdrawn",
] as const;

export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** D-031: standard = one qualified person; separated = publisher differs from validator and content authors. */
export const APPROVAL_CLASSES = ["standard", "separated"] as const;

export type ApprovalClass = (typeof APPROVAL_CLASSES)[number];

/** Approval class of each registered fact table (mirror of `fact_approval_policies`). */
export const FACT_APPROVAL_CLASSES: Readonly<Record<string, ApprovalClass>> = {
  "public.providers": "standard",
  "public.deployment_channels": "standard",
  "public.model_families": "standard",
  "public.model_versions": "standard",
  "public.model_version_aliases": "standard",
  "public.model_releases": "standard",
  "public.capabilities": "standard",
  "public.model_capabilities": "separated",
  "public.benchmarks": "standard",
  "public.benchmark_versions": "separated",
  "public.benchmark_metrics": "separated",
  "public.evaluation_harnesses": "standard",
  "public.evaluation_harness_versions": "standard",
  "public.evaluation_configurations": "separated",
  "public.benchmark_results": "separated",
  "public.pricing_records": "separated",
};

/** Fail closed: an unknown table is treated as separated, as the database does. */
export function approvalClassFor(table: string): ApprovalClass {
  return FACT_APPROVAL_CLASSES[table] ?? "separated";
}

export function requiredApprovals(approvalClass: ApprovalClass): 1 | 2 {
  return approvalClass === "separated" ? 2 : 1;
}

/** Decisions recorded in `workflow_actions.action`. */
export const WORKFLOW_ACTIONS = [
  "submit",
  "recall",
  "validate",
  "return_to_draft",
  "publish",
  "reject",
  "supersede",
  "withdraw",
  "close_period",
] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

/** Codes in `nfai_admin_record_status().available_actions`. */
export const AVAILABLE_ACTIONS = [
  "update_draft",
  "delete_draft",
  "attach_provenance",
  "submit",
  "recall_submission",
  "validate",
  "return_to_draft",
  "reject",
  "publish",
  "supersede",
  "withdraw",
  "close_period",
] as const;

export type AvailableAction = (typeof AVAILABLE_ACTIONS)[number];

/** Codes in `nfai_admin_record_status().publish_blocked_reason`. */
export const PUBLISH_BLOCK_REASONS = [
  "validator_unknown",
  "validated_by_caller",
  "edited_by_caller",
] as const;

export type PublishBlockReason = (typeof PUBLISH_BLOCK_REASONS)[number];

/** Reason codes accepted by reject and withdraw (`publication_events.reason_code`). */
export const REASON_CODES = [
  "error_correction",
  "source_retracted",
  "source_changed",
  "methodology_invalidated",
  "duplicate",
  "insufficient_evidence",
  "out_of_scope",
  "other",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** Supersession kinds accepted by `nfai_admin_supersede`. */
export const SUPERSESSION_KINDS = ["correction", "restatement", "duplicate_merge"] as const;

export type SupersessionKind = (typeof SUPERSESSION_KINDS)[number];

/**
 * SQLSTATE codes raised by the admin functions, as one small vocabulary. Lifecycle
 * and provenance failures from Phase 2 (23514) are `rule_violation`.
 */
export type AdminErrorKind =
  | "not_admin"
  | "disabled"
  | "forbidden"
  | "separation_of_duties"
  | "workflow_precondition"
  | "invalid_input"
  | "not_found"
  | "rule_violation"
  | "unknown";

const SQLSTATE_KINDS: Readonly<Record<string, AdminErrorKind>> = {
  NFA01: "not_admin",
  NFA02: "disabled",
  NFA03: "forbidden",
  NFA04: "separation_of_duties",
  NFA05: "workflow_precondition",
  "22023": "invalid_input",
  P0002: "not_found",
  "23514": "rule_violation",
};

export function classifyAdminError(sqlstate: string | null | undefined): AdminErrorKind {
  return (sqlstate && SQLSTATE_KINDS[sqlstate]) || "unknown";
}
