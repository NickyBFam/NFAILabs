import type {
  AdminPermission,
  AdminRecordTable,
  AdminRole,
  FactTable,
  PublicationState,
  ReasonCode,
  WorkflowAction,
} from "@/components/admin/types";

export const stateLabels: Record<PublicationState, string> = {
  draft: "Draft",
  extracted: "Extracted",
  validated: "Validated",
  published: "Published",
  rejected: "Rejected",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};

export const tableLabels: Record<AdminRecordTable, { singular: string; plural: string }> = {
  providers: { singular: "Provider", plural: "Providers" },
  deployment_channels: { singular: "Deployment channel", plural: "Deployment channels" },
  model_families: { singular: "Model family", plural: "Model families" },
  model_versions: { singular: "Model version", plural: "Model versions" },
  model_version_aliases: {
    singular: "Model identifier or alias",
    plural: "Model identifiers and aliases",
  },
  model_releases: { singular: "Release or lifecycle event", plural: "Releases and lifecycle" },
  capabilities: { singular: "Capability definition", plural: "Capability definitions" },
  model_capabilities: { singular: "Model capability", plural: "Model capabilities" },
  benchmarks: { singular: "Benchmark", plural: "Benchmarks" },
  benchmark_versions: { singular: "Benchmark version", plural: "Benchmark versions" },
  benchmark_metrics: { singular: "Benchmark metric", plural: "Benchmark metrics" },
  evaluation_harnesses: { singular: "Evaluation harness", plural: "Evaluation harnesses" },
  evaluation_harness_versions: {
    singular: "Evaluation harness version",
    plural: "Evaluation harness versions",
  },
  evaluation_configurations: {
    singular: "Evaluation configuration",
    plural: "Evaluation configurations",
  },
  benchmark_results: { singular: "Benchmark result", plural: "Benchmark results" },
  pricing_records: { singular: "Price", plural: "Prices" },
  sources: { singular: "Source", plural: "Sources" },
  source_documents: { singular: "Source document", plural: "Source documents" },
};

export function isAdminRecordTable(value: string): value is AdminRecordTable {
  return Object.hasOwn(tableLabels, value);
}

export function isFactTable(table: AdminRecordTable): table is FactTable {
  return table !== "sources" && table !== "source_documents";
}

/** Accepts `providers` or `public.providers`. */
export function tableLabel(table: string): string {
  const name = table.replace(/^public\./, "");
  return isAdminRecordTable(name) ? tableLabels[name].singular : name;
}

/** Which admin area lists each table, in display order. */
export const areaTables = {
  models: [
    "providers",
    "deployment_channels",
    "model_families",
    "model_versions",
    "model_version_aliases",
    "model_releases",
    "capabilities",
    "model_capabilities",
  ],
  benchmarks: [
    "benchmarks",
    "benchmark_versions",
    "benchmark_metrics",
    "evaluation_harnesses",
    "evaluation_harness_versions",
    "evaluation_configurations",
    "benchmark_results",
  ],
  pricing: ["pricing_records"],
  sources: ["sources", "source_documents"],
} as const satisfies Record<string, readonly AdminRecordTable[]>;

export type AdminArea = keyof typeof areaTables;

export function areaOf(table: AdminRecordTable): AdminArea {
  const entry = (Object.entries(areaTables) as [AdminArea, readonly AdminRecordTable[]][]).find(
    ([, tables]) => tables.includes(table),
  );
  return entry ? entry[0] : "models";
}

export const actionLabels: Record<WorkflowAction, string> = {
  submit_review: "Submit for review",
  validate: "Validate",
  recall: "Recall submission",
  publish: "Publish",
  return_to_draft: "Return to draft",
  reject: "Reject",
  supersede: "Supersede",
  withdraw: "Withdraw",
  close_period: "Close effective period",
  delete_draft: "Delete draft",
};

/** Actions that must carry a written reason (the database also requires one). */
export const actionsRequiringReason: ReadonlySet<WorkflowAction> = new Set([
  "recall",
  "return_to_draft",
  "reject",
  "supersede",
  "withdraw",
  "close_period",
  "delete_draft",
]);

/** Actions that also record a machine-readable reason code. */
export const actionsWithReasonCode: ReadonlySet<WorkflowAction> = new Set(["reject", "withdraw"]);

/** Actions that open a small form before they can be confirmed. */
export const actionsWithForm: ReadonlySet<WorkflowAction> = new Set([
  ...actionsRequiringReason,
  "close_period",
]);

/** Actions that change public data or end a record's review; shown with a warning style. */
export const destructiveActions: ReadonlySet<WorkflowAction> = new Set([
  "reject",
  "withdraw",
  "delete_draft",
]);

export const reasonCodeLabels: Record<ReasonCode, string> = {
  error_correction: "Error correction",
  source_retracted: "Source retracted",
  source_changed: "Source changed",
  methodology_invalidated: "Methodology invalidated",
  duplicate: "Duplicate",
  insufficient_evidence: "Insufficient evidence",
  out_of_scope: "Out of scope",
  other: "Other",
};

export const permissionLabels: Record<AdminPermission, string> = {
  view_admin: "Enter admin and read records",
  edit_draft: "Create and edit drafts and attach sources",
  submit_review: "Submit for review",
  validate_fact: "Validate records",
  publish_fact: "Publish records",
  reject_fact: "Reject records",
  supersede_fact: "Supersede records",
  withdraw_fact: "Withdraw records",
  view_audit: "Read audit history",
  manage_admins: "Manage admin identities and roles",
};

export type AdminSection = {
  href: `/admin${string}`;
  label: string;
  description: string;
  /** The viewer needs this permission for the section to be listed. */
  permission: AdminPermission;
};

export const adminSections: readonly AdminSection[] = [
  {
    href: "/admin",
    label: "Overview",
    description: "Your access and the state of the review queue.",
    permission: "view_admin",
  },
  {
    href: "/admin/review",
    label: "Review queue",
    description: "Records waiting for validation, approval or publication.",
    permission: "view_admin",
  },
  {
    href: "/admin/models",
    label: "Models",
    description: "Providers, model families and exact model versions.",
    permission: "view_admin",
  },
  {
    href: "/admin/benchmarks",
    label: "Benchmarks",
    description: "Benchmarks, versions, metrics, evaluation configurations and results.",
    permission: "view_admin",
  },
  {
    href: "/admin/pricing",
    label: "Pricing",
    description: "Effective-dated prices for exact model versions.",
    permission: "view_admin",
  },
  {
    href: "/admin/sources",
    label: "Sources",
    description: "The source registry and citable source documents.",
    permission: "view_admin",
  },
  {
    href: "/admin/audit",
    label: "Audit",
    description: "Who changed what, when and why.",
    permission: "view_audit",
  },
  {
    href: "/admin/access",
    label: "Access",
    description: "Admin identities and role assignments.",
    permission: "manage_admins",
  },
];

export function hasPermission(
  permissions: readonly AdminPermission[],
  permission: AdminPermission,
): boolean {
  return permissions.includes(permission);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Formats an ISO timestamp in UTC so server and client render the same text. */
export function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${dateTimeFormat.format(date)} UTC`;
}

export const roleLabels: Record<AdminRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  reviewer: "Reviewer",
  publisher: "Publisher",
  administrator: "Administrator",
};
