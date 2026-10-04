import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewQueue } from "@/components/admin/review-queue";
import { syntheticQueueItem } from "@/components/admin/test-fixtures";

describe("ReviewQueue", () => {
  it("shows an empty state when nothing is waiting", () => {
    render(<ReviewQueue items={[]} />);
    expect(screen.getByText("Nothing is waiting for review")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lists type, state, submitter, provenance and approval for each record", () => {
    render(<ReviewQueue items={[syntheticQueueItem]} />);
    const table = screen.getByRole("table", { name: "Records waiting for review" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual(["Record", "Type", "State", "Submitted", "Provenance", "Approval"]);

    const row = within(table).getAllByRole("row")[1] as HTMLElement;
    expect(within(row).getByRole("link", { name: syntheticQueueItem.label })).toHaveAttribute(
      "href",
      `/admin/records/benchmark_results/${syntheticQueueItem.recordId}`,
    );
    expect(row).toHaveTextContent("Benchmark result");
    expect(row).toHaveTextContent("Validated");
    expect(row).toHaveTextContent("Test Editor One");
    expect(row).toHaveTextContent("2 sources, best T2");
    expect(row).toHaveTextContent("Meets the publication gate");
    expect(row).toHaveTextContent("1 of 2 distinct approvers");
    expect(row).toHaveTextContent("High impact: separation of duties");
    expect(row).toHaveTextContent("Validated by Test Reviewer One");
  });

  it("flags a record without a supporting source", () => {
    render(
      <ReviewQueue
        items={[
          {
            ...syntheticQueueItem,
            state: "draft",
            provenance: { supportingCount: 0, bestTier: null, gateSatisfied: false },
          },
        ]}
      />,
    );
    expect(screen.getByText("No supporting source")).toBeInTheDocument();
  });
});
