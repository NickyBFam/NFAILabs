import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminErrorState } from "@/components/admin/admin-error-state";
import { AuditTable } from "@/components/admin/audit-table";
import { StateBadge } from "@/components/admin/state-badge";
import { syntheticAuditEntry } from "@/components/admin/test-fixtures";
import { parseAuditFilters } from "@/app/admin/_data/audit-filters";

describe("AuditTable", () => {
  it("shows an empty state when nothing matches", () => {
    render(<AuditTable entries={[]} />);
    expect(screen.getByText("No audit entries match")).toBeInTheDocument();
  });

  it("shows actor, action, record type and id, time, reason and state change", () => {
    render(<AuditTable entries={[syntheticAuditEntry]} />);
    const table = screen.getByRole("table", { name: "Audit history, newest first" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["When", "Actor", "Action", "Record", "State change", "Reason"]);

    const row = within(table).getAllByRole("row")[1] as HTMLElement;
    expect(row).toHaveTextContent("2 Jan 2026, 03:04 UTC");
    expect(within(row).getByText("2 Jan 2026, 03:04 UTC")).toHaveAttribute(
      "datetime",
      syntheticAuditEntry.occurredAt,
    );
    expect(row).toHaveTextContent("Test Publisher One");
    expect(row).toHaveTextContent("publish");
    expect(row).toHaveTextContent("Changed: publication_state");
    expect(row).toHaveTextContent("Price");
    expect(row).toHaveTextContent(syntheticAuditEntry.recordId as string);
    expect(row).toHaveTextContent("Validated → Published");
    expect(row).toHaveTextContent("Checked against the synthetic source");
  });
});

describe("parseAuditFilters", () => {
  it("keeps valid filters", () => {
    expect(
      parseAuditFilters({
        table: "pricing_records",
        record: "00000000-0000-4000-8000-000000000202",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).toEqual({
      filters: {
        table: "pricing_records",
        record: "00000000-0000-4000-8000-000000000202",
        from: "2026-01-01",
        to: "2026-01-31",
      },
      errors: [],
    });
  });

  it("reports invalid filters instead of passing them on", () => {
    const { filters, errors } = parseAuditFilters({
      table: "audit_log",
      actor: "'; drop table",
      from: "2026-02-01",
      to: "2026-01-01",
      cursor: "<script>",
    });
    expect(filters.table).toBeUndefined();
    expect(filters.actor).toBeUndefined();
    expect(filters.cursor).toBeUndefined();
    expect(errors).toEqual([
      "Choose a record type from the list.",
      "Actor ID must be a full ID.",
      "From must be on or before To.",
      "The page link is not valid. Clear the filters and try again.",
    ]);
  });
});

describe("StateBadge", () => {
  it("names the state in text, not only color", () => {
    render(<StateBadge state="withdrawn" />);
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });
});

describe("AdminErrorState", () => {
  it("shows a reference but never the error details, and can retry", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<AdminErrorState digest="ref-123" retry={retry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This page could not be loaded");
    expect(alert).toHaveTextContent("ref-123");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
