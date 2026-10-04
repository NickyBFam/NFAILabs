import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdentityActions } from "@/components/admin/identity-actions";
import { IdentityTable, RoleHistory } from "@/components/admin/identity-table";
import type { ActionResult, AdminIdentityView } from "@/components/admin/types";

const editor: AdminIdentityView = {
  id: "00000000-0000-4000-8000-0000000000e1",
  displayName: "Test Editor One",
  status: "active",
  disabledReason: null,
  activeRoles: ["editor"],
  createdAt: "2026-01-01T00:00:00Z",
  isSelf: false,
};

function setup(identity: AdminIdentityView) {
  const runAction = vi.fn<(previous: ActionResult, formData: FormData) => Promise<ActionResult>>(
    async () => ({ status: "success", message: "Saved." }),
  );
  render(<IdentityActions identity={identity} runAction={runAction} />);
  return runAction;
}

describe("IdentityActions", () => {
  it("offers nothing on the viewer's own row", () => {
    setup({ ...editor, isSelf: true });
    expect(screen.queryByText(/Disable|Grant role|Revoke role/)).toBeNull();
    expect(screen.getByText("Another administrator must change your access.")).toBeInTheDocument();
  });

  it("grants only roles the identity does not hold, with a reason", async () => {
    const user = userEvent.setup();
    const runAction = setup(editor);
    await user.click(screen.getByText("Grant role…"));
    const role = screen.getAllByLabelText("Role")[0] as HTMLSelectElement;
    const offered = [...role.options].map((option) => option.value).filter(Boolean);
    expect(offered).toEqual(["viewer", "reviewer", "publisher", "administrator"]);

    await user.selectOptions(role, "reviewer");
    await user.type(screen.getAllByLabelText("Reason")[1] as HTMLElement, "Joins the review rota");
    await user.click(screen.getByRole("button", { name: "Grant role" }));

    const formData = runAction.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(formData)).toEqual({
      op: "grant_role",
      adminId: editor.id,
      role: "reviewer",
      reason: "Joins the review rota",
    });
  });

  it("offers re-enabling a disabled identity", () => {
    setup({ ...editor, status: "disabled", disabledReason: "Left the team" });
    expect(screen.getByText("Re-enable…")).toBeInTheDocument();
    expect(screen.queryByText("Disable…")).toBeNull();
  });
});

describe("IdentityTable and RoleHistory", () => {
  it("lists identities with status, roles and the viewer marked", () => {
    render(
      <IdentityTable
        identities={[
          editor,
          { ...editor, id: "self", displayName: "Test Admin One", isSelf: true },
        ]}
        renderActions={() => null}
      />,
    );
    expect(screen.getByRole("table", { name: "Admin identities" })).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(screen.getAllByText("Editor")).toHaveLength(2);
    expect(screen.getAllByText("Active")).toHaveLength(2);
  });

  it("shows role changes with actor and reason", () => {
    render(
      <RoleHistory
        entries={[
          {
            id: "h1",
            adminLabel: "Test Editor One",
            role: "reviewer",
            change: "granted",
            actorLabel: "Test Admin One",
            occurredAt: "2026-01-02T03:04:00Z",
            reason: "Joins the review rota",
          },
        ]}
      />,
    );
    expect(screen.getByText("Reviewer granted for Test Editor One")).toBeInTheDocument();
    expect(screen.getByText(/Test Admin One/)).toBeInTheDocument();
    expect(screen.getByText("Reason: Joins the review rota")).toBeInTheDocument();
  });
});
