import type { ApprovalRequirement, ProvenanceSummary } from "@/components/admin/types";

export function ProvenanceSummaryText({ summary }: { summary: ProvenanceSummary }) {
  if (summary.supportingCount === 0) {
    return <span className="text-red-800 dark:text-red-200">No supporting source</span>;
  }
  const sources = summary.supportingCount === 1 ? "1 source" : `${summary.supportingCount} sources`;
  return (
    <span>
      {sources}
      {summary.bestTier ? `, best ${summary.bestTier}` : null}
      <span className="block text-xs text-muted">
        {summary.gateSatisfied
          ? "Meets the publication gate"
          : "Does not meet the publication gate"}
      </span>
    </span>
  );
}

export function ApprovalText({ approval }: { approval: ApprovalRequirement }) {
  const needed =
    approval.required > 1 ? `${approval.required} distinct approvers` : "1 qualified approver";
  return (
    <span>
      {approval.received} of {needed}
      {approval.highImpact ? (
        <span className="block text-xs text-muted">High impact: separation of duties</span>
      ) : null}
      {approval.validatedBy ? (
        <span className="block text-xs text-muted">Validated by {approval.validatedBy}</span>
      ) : null}
    </span>
  );
}
