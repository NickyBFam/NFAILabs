import { describe, expect, it } from "vitest";
import type { AdminPermission } from "@/lib/admin/mutations/context";
import { availableActions, isEditable } from "@/lib/admin/queries/availability";

const all = new Set<AdminPermission>([
  "view_admin",
  "edit_draft",
  "submit_review",
  "validate_fact",
  "reject_fact",
  "publish_fact",
  "supersede_fact",
  "withdraw_fact",
]);

const base = {
  state: "draft",
  databaseActions: [] as string[],
  publishBlockedReason: null,
  requiresProvenance: true,
  gateSatisfied: true,
};

describe("action availability", () => {
  it("maps database action codes to UI names in a stable order", () => {
    const actions = availableActions(all, {
      ...base,
      databaseActions: [
        "reject",
        "recall_submission",
        "validate",
        "update_draft",
        "attach_provenance",
      ],
    });
    expect(actions).toEqual([
      { action: "recall", enabled: true },
      { action: "validate", enabled: true },
      { action: "reject", enabled: true },
    ]);
  });

  it("drops actions whose permission the caller does not hold (fail closed)", () => {
    const actions = availableActions(new Set<AdminPermission>(["view_admin"]), {
      ...base,
      state: "published",
      databaseActions: ["withdraw", "supersede", "close_period"],
    });
    expect(actions).toEqual([]);
  });

  it("ignores unknown codes", () => {
    expect(
      availableActions(all, { ...base, databaseActions: ["grant_role", "drop_table"] }),
    ).toEqual([]);
  });

  it("explains a missing source and separation-of-duties blocks", () => {
    expect(
      availableActions(all, { ...base, databaseActions: ["validate"], gateSatisfied: false }),
    ).toEqual([
      {
        action: "validate",
        enabled: false,
        disabledReason: "Attach an approved T1 to T3 source first.",
      },
    ]);
    expect(
      availableActions(all, {
        ...base,
        state: "validated",
        databaseActions: ["return_to_draft"],
        publishBlockedReason: "edited_by_caller",
      }),
    ).toEqual([
      { action: "return_to_draft", enabled: true },
      {
        action: "publish",
        enabled: false,
        disabledReason: "A different admin must publish: you created or edited this record.",
      },
    ]);
  });

  it("does not require provenance for exempt tables", () => {
    expect(
      availableActions(all, {
        ...base,
        databaseActions: ["validate"],
        requiresProvenance: false,
        gateSatisfied: false,
      }),
    ).toEqual([{ action: "validate", enabled: true }]);
  });

  it("reports editability from the database", () => {
    expect(isEditable(["update_draft", "submit"])).toBe(true);
    expect(isEditable(["submit"])).toBe(false);
  });
});
