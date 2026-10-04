import type { AdminPermission } from "@/lib/admin/mutations/context";

/**
 * Permission-aware action availability for one record.
 *
 * The database decides which workflow actions the caller may take now
 * (`nfai_admin_record_status().available_actions`, computed from the caller's
 * permissions, the record's state, its open submission and the approval class).
 * This module maps those codes to the names the admin UI uses, keeps only
 * actions whose permission the caller holds (a second, fail-closed filter), and
 * explains blocked actions. Every action is re-checked by its `nfai_admin_*`
 * function, so a wrong answer here can only hide a button, never allow an action.
 */

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

export type ActionAvailability = {
  action: WorkflowAction;
  enabled: boolean;
  disabledReason?: string;
};

/** Database action code -> UI action. Editing codes (update_draft, ...) are reported separately. */
const DATABASE_ACTIONS: Readonly<Record<string, WorkflowAction>> = {
  submit: "submit_review",
  recall_submission: "recall",
  validate: "validate",
  publish: "publish",
  return_to_draft: "return_to_draft",
  reject: "reject",
  supersede: "supersede",
  withdraw: "withdraw",
  close_period: "close_period",
  delete_draft: "delete_draft",
};

const ACTION_PERMISSIONS: Readonly<Record<WorkflowAction, readonly AdminPermission[]>> = {
  submit_review: ["submit_review"],
  recall: ["submit_review"],
  validate: ["validate_fact"],
  return_to_draft: ["validate_fact"],
  reject: ["reject_fact"],
  publish: ["publish_fact"],
  supersede: ["supersede_fact", "publish_fact"],
  withdraw: ["withdraw_fact"],
  close_period: ["publish_fact"],
  delete_draft: ["edit_draft"],
};

const ORDER: readonly WorkflowAction[] = [
  "submit_review",
  "recall",
  "validate",
  "return_to_draft",
  "publish",
  "reject",
  "supersede",
  "withdraw",
  "close_period",
  "delete_draft",
];

const NEEDS_SOURCE = "Attach an approved T1 to T3 source first.";

/** `publish_blocked_reason` codes from the database, as user-facing text. */
const PUBLISH_BLOCKED: Readonly<Record<string, string>> = {
  validated_by_caller: "A different admin must publish: you validated this record.",
  edited_by_caller: "A different admin must publish: you created or edited this record.",
  validator_unknown: "This record must be validated again before it can be published.",
};
const PUBLISH_BLOCKED_DEFAULT = "You cannot publish this record.";

export type RecordAvailabilityInput = {
  state: string;
  /** Raw `available_actions` from the database. */
  databaseActions: readonly string[];
  publishBlockedReason: string | null;
  /** The record needs T1-T3 provenance before validation (not capabilities or configurations). */
  requiresProvenance: boolean;
  gateSatisfied: boolean;
};

export function availableActions(
  permissions: ReadonlySet<AdminPermission>,
  record: RecordAvailabilityInput,
): ActionAvailability[] {
  const offered = new Set<WorkflowAction>();
  for (const code of record.databaseActions) {
    const action = DATABASE_ACTIONS[code];
    if (action) offered.add(action);
  }
  // The database omits publish when separation of duties blocks it; show it disabled
  // with the reason so the reviewer knows someone else must publish.
  const publishBlocked =
    record.state === "validated" && record.publishBlockedReason !== null && !offered.has("publish");
  if (publishBlocked) offered.add("publish");

  return ORDER.filter(
    (action) =>
      offered.has(action) &&
      ACTION_PERMISSIONS[action].every((permission) => permissions.has(permission)),
  ).map((action) => {
    if (action === "publish" && publishBlocked) {
      return {
        action,
        enabled: false,
        disabledReason:
          PUBLISH_BLOCKED[record.publishBlockedReason ?? ""] ?? PUBLISH_BLOCKED_DEFAULT,
      };
    }
    if (
      (action === "validate" || action === "publish") &&
      record.requiresProvenance &&
      !record.gateSatisfied
    ) {
      return { action, enabled: false, disabledReason: NEEDS_SOURCE };
    }
    return { action, enabled: true };
  });
}

/** Whether the caller may edit the record's fields now (unsubmitted draft and edit_draft). */
export function isEditable(databaseActions: readonly string[]): boolean {
  return databaseActions.includes("update_draft");
}
