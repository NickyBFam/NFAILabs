import type { Schema } from "@/lib/admin/mutations/validation";

/**
 * The fact tables admins may create and edit drafts for, and the content
 * columns that may be sent for each.
 *
 * This is an allowlist. Identity (`id`), lifecycle (`publication_state`),
 * timestamps and anything actor-related are never listed, so they can never be
 * supplied by a caller. Column names and the value sets below are copied from
 * migrations 0001-0002; the database checks remain the authority and report
 * violations as field errors.
 */

export type AdminEntity = {
  /** Registered fact-table name, as the workflow functions expect it. */
  table: `public.${string}`;
  label: string;
  /** Column used to name a record in queues and lists. */
  labelColumn: string;
  fields: Schema;
};

const ORGANIZATION_TYPES = [
  "company",
  "research_lab",
  "nonprofit",
  "academic",
  "community",
  "government",
  "other",
];
const CHANNEL_TYPES = [
  "first_party_api",
  "cloud_platform",
  "inference_host",
  "consumer_app",
  "open_weights_distribution",
  "other",
];
const LIFECYCLE_STAGES = [
  "announced",
  "preview",
  "limited_availability",
  "general_availability",
  "deprecated",
  "retired",
];
const DATE_PRECISIONS = ["day", "month", "year"];
const CAPABILITY_CATEGORIES = [
  "input_modality",
  "output_modality",
  "limit",
  "feature",
  "deployment",
  "metadata",
  "other",
];
const CAPABILITY_VALUE_TYPES = ["boolean", "integer", "numeric", "text", "enum", "date"];
const INCLUSION_STATUSES = ["candidate", "included", "included_limited", "deprecated", "excluded"];
const METRIC_UNITS = [
  "percent",
  "fraction",
  "score",
  "elo",
  "count",
  "seconds",
  "tokens_per_second",
  "currency",
  "other",
];
const HARNESS_CLASSES = [
  "no_tools",
  "benchmark_official",
  "standardized_agent",
  "vendor_custom_agent",
  "commercial_product_agent",
  "other",
];
const ORIGIN_TYPES = ["first_party", "benchmark_owner", "independent", "nfai", "community"];
const REPRODUCIBILITY_GRADES = ["R0", "R1", "R2", "R3"];
const EVALUATED_ON_PRECISIONS = ["day", "month", "year", "unknown"];
const CONTAMINATION_STATUSES = ["not_assessed", "no_known_concerns", "suspected", "confirmed"];
const VERIFICATION_STATUSES = ["unverified", "source_checked", "reproduced", "disputed"];
const SERVICE_TIERS = [
  "standard",
  "batch",
  "priority",
  "flex",
  "provisioned",
  "free_tier",
  "other",
];
const PRICE_UNITS = [
  "token",
  "character",
  "image",
  "megapixel",
  "second",
  "minute",
  "hour",
  "request",
  "call",
  "other",
];

const notes = { kind: "text", multiline: true, max: 2000 } as const;
const description = { kind: "text", multiline: true, max: 2000 } as const;

export const ADMIN_ENTITIES = {
  providers: {
    table: "public.providers",
    label: "Provider",
    labelColumn: "name",
    fields: {
      slug: { kind: "slug", required: true },
      name: { kind: "text", required: true, max: 200 },
      legal_name: { kind: "text", max: 200 },
      organization_type: { kind: "enum", values: ORGANIZATION_TYPES },
      website_url: { kind: "url" },
      description,
    },
  },
  deployment_channels: {
    table: "public.deployment_channels",
    label: "Deployment channel",
    labelColumn: "name",
    fields: {
      provider_id: { kind: "uuid", required: true },
      slug: { kind: "slug", required: true },
      name: { kind: "text", required: true, max: 200 },
      channel_type: { kind: "enum", required: true, values: CHANNEL_TYPES },
      description,
    },
  },
  model_families: {
    table: "public.model_families",
    label: "Model family",
    labelColumn: "name",
    fields: {
      provider_id: { kind: "uuid", required: true },
      slug: { kind: "slug", required: true },
      name: { kind: "text", required: true, max: 200 },
      description,
    },
  },
  model_versions: {
    table: "public.model_versions",
    label: "Model version",
    labelColumn: "display_name",
    fields: {
      model_family_id: { kind: "uuid", required: true },
      slug: { kind: "slug", required: true },
      display_name: { kind: "text", required: true, max: 200 },
      version_label: { kind: "text", max: 200 },
      snapshot_date: { kind: "date" },
      base_model_version_id: { kind: "uuid" },
      description,
    },
  },
  model_version_aliases: {
    table: "public.model_version_aliases",
    label: "Model identifier or alias",
    labelColumn: "alias",
    fields: {
      deployment_channel_id: { kind: "uuid", required: true },
      alias: { kind: "text", required: true, max: 300 },
      alias_kind: { kind: "enum", required: true, values: ["pinned_identifier", "rolling_alias"] },
      model_version_id: { kind: "uuid", required: true },
      valid_from: { kind: "timestamp" },
      valid_to: { kind: "timestamp" },
      notes,
    },
  },
  model_releases: {
    table: "public.model_releases",
    label: "Release or lifecycle event",
    labelColumn: "lifecycle_stage",
    fields: {
      model_version_id: { kind: "uuid", required: true },
      deployment_channel_id: { kind: "uuid" },
      lifecycle_stage: { kind: "enum", required: true, values: LIFECYCLE_STAGES },
      announced_on: { kind: "date" },
      effective_on: { kind: "date" },
      date_precision: { kind: "enum", values: DATE_PRECISIONS },
      notes,
    },
  },
  capabilities: {
    table: "public.capabilities",
    label: "Capability definition",
    labelColumn: "name",
    fields: {
      key: { kind: "text", required: true, max: 100 },
      name: { kind: "text", required: true, max: 200 },
      description,
      category: { kind: "enum", required: true, values: CAPABILITY_CATEGORIES },
      value_type: { kind: "enum", required: true, values: CAPABILITY_VALUE_TYPES },
      unit: { kind: "text", max: 50 },
      allowed_values: { kind: "textArray", max: 100 },
    },
  },
  model_capabilities: {
    table: "public.model_capabilities",
    label: "Model capability",
    labelColumn: "id",
    fields: {
      model_version_id: { kind: "uuid", required: true },
      capability_id: { kind: "uuid", required: true },
      deployment_channel_id: { kind: "uuid" },
      value_boolean: { kind: "boolean" },
      value_integer: { kind: "integer" },
      value_numeric: { kind: "decimal" },
      value_text: { kind: "text", max: 500 },
      value_date: { kind: "date" },
      valid_from: { kind: "timestamp", required: true },
      valid_to: { kind: "timestamp" },
      notes,
    },
  },
  benchmarks: {
    table: "public.benchmarks",
    label: "Benchmark",
    labelColumn: "name",
    fields: {
      slug: { kind: "slug", required: true },
      name: { kind: "text", required: true, max: 200 },
      maintainer_name: { kind: "text", max: 200 },
      homepage_url: { kind: "url" },
      description,
      measures: { kind: "text", multiline: true, max: 2000 },
      inclusion_status: { kind: "enum", values: INCLUSION_STATUSES },
      inclusion_rationale: { kind: "text", multiline: true, max: 2000 },
      known_limitations: { kind: "text", multiline: true, max: 2000 },
      contamination_notes: { kind: "text", multiline: true, max: 2000 },
    },
  },
  benchmark_versions: {
    table: "public.benchmark_versions",
    label: "Benchmark version",
    labelColumn: "version_label",
    fields: {
      benchmark_id: { kind: "uuid", required: true },
      version_label: { kind: "text", required: true, max: 200 },
      dataset_revision: { kind: "text", max: 200 },
      released_on: { kind: "date" },
      task_count: { kind: "integer", min: 0 },
      scoring_method: { kind: "text", multiline: true, max: 2000 },
      test_set_public: { kind: "boolean" },
      has_private_holdout: { kind: "boolean" },
      notes,
    },
  },
  benchmark_metrics: {
    table: "public.benchmark_metrics",
    label: "Benchmark metric",
    labelColumn: "name",
    fields: {
      benchmark_version_id: { kind: "uuid", required: true },
      key: { kind: "text", required: true, max: 100 },
      name: { kind: "text", required: true, max: 200 },
      unit: { kind: "enum", required: true, values: METRIC_UNITS },
      higher_is_better: { kind: "boolean", required: true },
      min_value: { kind: "decimal" },
      max_value: { kind: "decimal" },
      description,
    },
  },
  evaluation_harnesses: {
    table: "public.evaluation_harnesses",
    label: "Evaluation harness",
    labelColumn: "name",
    fields: {
      slug: { kind: "slug", required: true },
      name: { kind: "text", required: true, max: 200 },
      harness_class: { kind: "enum", required: true, values: HARNESS_CLASSES },
      maintainer_name: { kind: "text", max: 200 },
      homepage_url: { kind: "url" },
      description,
    },
  },
  evaluation_harness_versions: {
    table: "public.evaluation_harness_versions",
    label: "Evaluation harness version",
    labelColumn: "version_label",
    fields: {
      evaluation_harness_id: { kind: "uuid", required: true },
      version_label: { kind: "text", required: true, max: 200 },
      source_code_url: { kind: "url" },
      source_revision: { kind: "text", max: 200 },
      released_on: { kind: "date" },
      notes,
    },
  },
  evaluation_configurations: {
    table: "public.evaluation_configurations",
    label: "Evaluation configuration",
    labelColumn: "label",
    fields: {
      label: { kind: "text", required: true, max: 200 },
      disclosure_level: {
        kind: "enum",
        required: true,
        values: ["full", "partial", "undisclosed"],
      },
      reasoning_mode: {
        kind: "enum",
        required: true,
        values: ["disabled", "enabled", "adaptive", "not_applicable", "undisclosed"],
      },
      reasoning_effort: { kind: "text", max: 100 },
      reasoning_budget_tokens: { kind: "integer", min: 1 },
      temperature: { kind: "decimal" },
      top_p: { kind: "decimal" },
      max_output_tokens: { kind: "integer", min: 1 },
      aggregation_method: {
        kind: "enum",
        required: true,
        values: [
          "single_attempt",
          "pass_at_k",
          "majority_vote",
          "best_of_n",
          "mean_of_n",
          "other",
          "undisclosed",
        ],
      },
      attempts_per_task: { kind: "integer", min: 1 },
      prompting_style: {
        kind: "enum",
        required: true,
        values: ["zero_shot", "few_shot", "benchmark_default", "other", "undisclosed"],
      },
      few_shot_examples: { kind: "integer", min: 1 },
      tool_access: { kind: "textArray", required: true, max: 10 },
      harness_disclosure: {
        kind: "enum",
        required: true,
        values: ["disclosed", "undisclosed", "not_applicable"],
      },
      evaluation_harness_version_id: { kind: "uuid" },
      step_limit: { kind: "integer", min: 1 },
      time_limit_seconds: { kind: "integer", min: 1 },
      token_budget: { kind: "integer", min: 1 },
      weights_precision: { kind: "text", max: 100 },
      extra_settings: { kind: "json" },
      notes,
    },
  },
  benchmark_results: {
    table: "public.benchmark_results",
    label: "Benchmark result",
    labelColumn: "id",
    fields: {
      model_version_id: { kind: "uuid", required: true },
      benchmark_version_id: { kind: "uuid", required: true },
      benchmark_metric_id: { kind: "uuid", required: true },
      evaluation_configuration_id: { kind: "uuid", required: true },
      deployment_channel_id: { kind: "uuid" },
      score: { kind: "decimal", required: true },
      score_ci_lower: { kind: "decimal" },
      score_ci_upper: { kind: "decimal" },
      trial_count: { kind: "integer", min: 1 },
      subset_label: { kind: "text", max: 200 },
      excluded_task_count: { kind: "integer", min: 0 },
      origin_type: { kind: "enum", required: true, values: ORIGIN_TYPES },
      evaluator_name: { kind: "text", max: 200 },
      reproducibility_grade: { kind: "enum", required: true, values: REPRODUCIBILITY_GRADES },
      evaluated_on: { kind: "date" },
      evaluated_on_precision: { kind: "enum", required: true, values: EVALUATED_ON_PRECISIONS },
      reported_on: { kind: "date" },
      contamination_status: { kind: "enum", values: CONTAMINATION_STATUSES },
      verification_status: { kind: "enum", values: VERIFICATION_STATUSES },
      notes,
    },
  },
  pricing_records: {
    table: "public.pricing_records",
    label: "Price",
    labelColumn: "billing_dimension",
    fields: {
      model_version_id: { kind: "uuid", required: true },
      deployment_channel_id: { kind: "uuid", required: true },
      billing_dimension: { kind: "text", required: true, max: 100 },
      dimension_detail: { kind: "text", max: 200 },
      service_tier: { kind: "enum", values: SERVICE_TIERS },
      context_threshold_tokens: { kind: "integer", min: 1 },
      region: { kind: "text", max: 100 },
      currency: { kind: "text", required: true, max: 3 },
      price_amount: { kind: "decimal", required: true },
      unit: { kind: "enum", required: true, values: PRICE_UNITS },
      unit_quantity: { kind: "decimal", required: true },
      valid_from: { kind: "timestamp", required: true },
      valid_to: { kind: "timestamp" },
      announced_on: { kind: "date" },
      notes,
    },
  },
} as const satisfies Record<string, AdminEntity>;

export type AdminEntityKey = keyof typeof ADMIN_ENTITIES;

const TABLE_TO_KEY = new Map<string, AdminEntityKey>(
  (Object.keys(ADMIN_ENTITIES) as AdminEntityKey[]).map((key) => [ADMIN_ENTITIES[key].table, key]),
);

/**
 * Resolves a caller-supplied table reference ("providers" or "public.providers")
 * to a registered entity. Anything else, including other schemas, internal
 * tables and quoting tricks, resolves to null.
 */
export function resolveEntity(reference: unknown): AdminEntity | null {
  if (typeof reference !== "string") return null;
  if (Object.prototype.hasOwnProperty.call(ADMIN_ENTITIES, reference)) {
    return ADMIN_ENTITIES[reference as AdminEntityKey];
  }
  const key = TABLE_TO_KEY.get(reference);
  return key ? ADMIN_ENTITIES[key] : null;
}

/** Source registry and document fields admins may send (0003). */
export const SOURCE_FIELDS: Schema = {
  slug: { kind: "slug", required: true },
  name: { kind: "text", required: true, max: 200 },
  publisher_name: { kind: "text", required: true, max: 200 },
  tier: { kind: "enum", required: true, values: ["T1", "T2", "T3", "T4", "T5"] },
  source_kind: {
    kind: "enum",
    required: true,
    values: [
      "provider_documentation",
      "provider_announcement",
      "model_card",
      "technical_report",
      "benchmark_organization",
      "paper",
      "independent_evaluator",
      "news",
      "dataset",
      "other",
    ],
  },
  homepage_url: { kind: "url" },
  fetch_method: { kind: "enum", values: ["manual", "api", "feed", "page"] },
  terms_notes: { kind: "text", multiline: true, max: 2000 },
  notes,
};

export const SOURCE_DOCUMENT_FIELDS: Schema = {
  source_id: { kind: "uuid", required: true },
  title: { kind: "text", required: true, max: 500 },
  document_kind: {
    kind: "enum",
    required: true,
    values: [
      "web_page",
      "api_reference",
      "pricing_page",
      "changelog",
      "announcement",
      "model_card",
      "technical_report",
      "paper",
      "leaderboard",
      "dataset_card",
      "repository",
      "other",
    ],
  },
  original_url: { kind: "url" },
  external_identifier: { kind: "text", max: 300 },
  citation_text: { kind: "text", multiline: true, max: 1000 },
  published_on: { kind: "date" },
  publisher_version: { kind: "text", max: 200 },
  language: { kind: "text", max: 20 },
  notes,
};

export const PROVENANCE_ROLES = [
  "primary",
  "corroborating",
  "verification",
  "contradicting",
  "retraction_notice",
  "discovery",
  "context",
] as const;

export const ATTACH_SOURCE_FIELDS: Schema = {
  sourceDocumentId: { kind: "uuid", required: true },
  sourceObservationId: { kind: "uuid" },
  role: { kind: "enum", required: true, values: PROVENANCE_ROLES },
  locator: { kind: "text", max: 500 },
  evidenceNote: { kind: "text", multiline: true, max: 1000 },
};

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

export const SUPERSESSION_KINDS = ["correction", "restatement", "duplicate_merge"] as const;
