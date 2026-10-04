import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/components/admin/types";
import { WorkflowActions } from "@/components/admin/workflow-actions";

const recordId = "00000000-0000-4000-8000-000000000101";

function setup(
  actions: Parameters<typeof WorkflowActions>[0]["actions"],
  result: ActionResult = { status: "success", message: "Done." },
) {
  const runAction = vi.fn<(previous: ActionResult, formData: FormData) => Promise<ActionResult>>(
    async () => result,
  );
  render(
    <WorkflowActions
      table="benchmark_results"
      recordId={recordId}
      actions={actions}
      runAction={runAction}
    />,
  );
  return runAction;
}

describe("WorkflowActions", () => {
  it("says so when the viewer has no actions", () => {
    setup([]);
    expect(screen.getByText("No workflow actions are available to you.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders only the actions the server offered", () => {
    setup([{ action: "validate", enabled: true }]);
    expect(screen.getByRole("button", { name: "Validate" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByText(/Withdraw/)).toBeNull();
  });

  it("disables a blocked action and explains why", () => {
    setup([
      {
        action: "publish",
        enabled: false,
        disabledReason: "A different admin must publish this record.",
      },
    ]);
    const button = screen.getByRole("button", { name: "Publish" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("A different admin must publish this record.");
  });

  it("submits a step with only the table, record and action", async () => {
    const user = userEvent.setup();
    const runAction = setup([{ action: "validate", enabled: true }]);
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(runAction).toHaveBeenCalledTimes(1);
    const formData = runAction.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(formData)).toEqual({
      table: "benchmark_results",
      recordId,
      action: "validate",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Done.");
  });

  it("asks for a reason type and reason before rejecting", async () => {
    const user = userEvent.setup();
    const runAction = setup([{ action: "reject", enabled: true }]);
    await user.click(screen.getByText("Reject…"));

    expect(screen.getByLabelText("Reason type")).toBeRequired();
    const reason = screen.getByLabelText("Reason");
    expect(reason).toBeRequired();
    await user.selectOptions(screen.getByLabelText("Reason type"), "insufficient_evidence");
    await user.type(reason, "Source does not state the configuration");
    await user.click(screen.getByRole("button", { name: "Confirm: reject" }));

    const formData = runAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("reasonCode")).toBe("insufficient_evidence");
    expect(formData.get("reason")).toBe("Source does not state the configuration");
  });

  it("asks for the replacement record when superseding", async () => {
    const user = userEvent.setup();
    setup([{ action: "supersede", enabled: true }]);
    await user.click(screen.getByText("Supersede…"));
    expect(screen.getByLabelText("Replacement record ID")).toBeRequired();
    expect(screen.getByLabelText("Kind of replacement")).toHaveValue("correction");
  });

  it("shows a refused step as an alert and moves focus to it", async () => {
    const user = userEvent.setup();
    setup([{ action: "publish", enabled: true }], {
      status: "error",
      message: "A different admin must review a record you proposed or edited.",
    });
    await user.click(screen.getByRole("button", { name: "Publish" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("A different admin must review");
    expect(alert).toHaveFocus();
    expect(within(alert).queryByText(/select|insert|stack/i)).toBeNull();
  });

  it("asks for a reason before deleting a draft", async () => {
    const user = userEvent.setup();
    const runAction = setup([{ action: "delete_draft", enabled: true }]);
    await user.click(screen.getByText("Delete draft…"));
    await user.type(screen.getByLabelText("Reason"), "Duplicate of another draft");
    await user.click(screen.getByRole("button", { name: "Confirm: delete draft" }));
    const formData = runAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("action")).toBe("delete_draft");
    expect(formData.get("reason")).toBe("Duplicate of another draft");
  });
});
