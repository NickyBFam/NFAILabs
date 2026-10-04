import type {
  AdminPermission,
  AdminViewer,
  AuditEntry,
  ReviewQueueItem,
} from "@/components/admin/types";

/**
 * Synthetic view models for admin UI tests. Names are obviously fictional (AGENTS.md rule
 * 11); nothing here describes a real provider, model, score or price.
 */

export const allPermissions: AdminPermission[] = [
  "view_admin",
  "edit_draft",
  "submit_review",
  "validate_fact",
  "publish_fact",
  "reject_fact",
  "supersede_fact",
  "withdraw_fact",
  "view_audit",
  "manage_admins",
];

export function syntheticViewer(permissions: AdminPermission[] = ["view_admin"]): AdminViewer {
  return { displayName: "Test Reviewer One", roles: ["viewer"], permissions };
}

export const syntheticQueueItem: ReviewQueueItem = {
  table: "benchmark_results",
  recordId: "00000000-0000-4000-8000-000000000101",
  label: "Test Model Alpha on Synthetic Benchmark",
  state: "validated",
  submittedBy: "Test Editor One",
  submittedAt: "2026-01-02T03:04:00Z",
  provenance: { supportingCount: 2, bestTier: "T2", gateSatisfied: true },
  approval: {
    highImpact: true,
    required: 2,
    received: 1,
    validatedBy: "Test Reviewer One",
    approvers: ["Test Reviewer One"],
  },
  actions: [{ action: "publish", enabled: true }],
};

export const syntheticAuditEntry: AuditEntry = {
  id: "audit-1",
  occurredAt: "2026-01-02T03:04:00Z",
  actorLabel: "Test Publisher One",
  actorKind: "user",
  action: "publish",
  table: "pricing_records",
  recordId: "00000000-0000-4000-8000-000000000202",
  reason: "Checked against the synthetic source",
  fromState: "validated",
  toState: "published",
  changedColumns: ["publication_state"],
};
