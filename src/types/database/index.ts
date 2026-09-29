/**
 * Database boundary types — HAND-WRITTEN, not generated.
 *
 * They mirror the columns of supabase/migrations/0001–0004 that the data-access
 * layer reads. Supabase type generation (`supabase gen types`) needs a running
 * database, which Phase 2 does not require; when generation is adopted, replace
 * this file with the generated output and keep the exported names.
 *
 * Rules:
 * - Row types describe what PostgREST returns: `date`/`timestamptz` are ISO
 *   strings, `numeric`/`bigint` are strings or numbers (PostgREST returns
 *   numeric as number by default; mappers normalize), nullable columns are `| null`.
 * - Tables are declared read-only for the app (`Insert`/`Update` are empty):
 *   Phase 2 has no application write path. Writes arrive with Phase 3 admin.
 * - Nothing outside src/lib/data should import row types; UI code uses the
 *   domain models in src/lib/data/domain.ts.
 */

// ---------------------------------------------------------------------------
// Vocabularies (CHECK constraints in the migrations)
// ---------------------------------------------------------------------------

/**
 * `publication_state`, a foreign key to the `publication_states` lookup (0003).
 * Public history: published, superseded, withdrawn (`is_public`).
 * Current: published only (`is_current`).
 */
export type PublicationState =
  "draft" | "extracted" | "validated" | "published" | "rejected" | "superseded" | "withdrawn";

export type ChannelType =
  | "first_party_api"
  | "cloud_platform"
  | "inference_host"
  | "consumer_app"
  | "open_weights_distribution"
  | "other";

export type ReasoningMode = "disabled" | "enabled" | "adaptive" | "not_applicable" | "undisclosed";
export type DisclosureLevel = "full" | "partial" | "undisclosed";
export type AggregationMethod =
  | "single_attempt"
  | "pass_at_k"
  | "majority_vote"
  | "best_of_n"
  | "mean_of_n"
  | "other"
  | "undisclosed";
export type PromptingStyle =
  "zero_shot" | "few_shot" | "benchmark_default" | "other" | "undisclosed";
export type ToolAccess =
  | "none"
  | "code_execution"
  | "web_search"
  | "web_browsing"
  | "file_system"
  | "custom_tools"
  | "undisclosed";
export type HarnessDisclosure = "disclosed" | "undisclosed" | "not_applicable";

export type OriginType = "first_party" | "benchmark_owner" | "independent" | "nfai" | "community";
export type ReproducibilityGrade = "R0" | "R1" | "R2" | "R3";
export type DatePrecision = "day" | "month" | "year" | "unknown";
export type ContaminationStatus = "not_assessed" | "no_known_concerns" | "suspected" | "confirmed";
export type VerificationStatus = "unverified" | "source_checked" | "reproduced" | "disputed";

export type BillingDimension =
  | "input_tokens"
  | "output_tokens"
  | "cached_input_read_tokens"
  | "cached_input_write_tokens"
  | "reasoning_tokens"
  | "image_input"
  | "image_output"
  | "audio_input"
  | "audio_output"
  | "video_input"
  | "video_output"
  | "request"
  | "tool_call"
  | "other";
export type ServiceTier =
  "standard" | "batch" | "priority" | "flex" | "provisioned" | "free_tier" | "other";
export type PriceUnit =
  | "token"
  | "character"
  | "image"
  | "megapixel"
  | "second"
  | "minute"
  | "hour"
  | "request"
  | "call"
  | "other";

export type SourceTier = "T1" | "T2" | "T3" | "T4" | "T5";
export type ProvenanceRole =
  | "primary"
  | "corroborating"
  | "verification"
  | "contradicting"
  | "retraction_notice"
  | "discovery"
  | "context";
export type Confidence = "high" | "medium" | "low";
export type ExtractionMethod = "manual" | "automated-parser" | "ai-assisted";

/** PostgREST returns `numeric` as a JSON number, or a string when precision would be lost. */
export type NumericValue = number | string;

type Published = {
  publication_state: PublicationState;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Catalog (0001)
// ---------------------------------------------------------------------------

export type ProviderRow = Published & {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  organization_type: string | null;
  website_url: string | null;
  description: string | null;
};

export type DeploymentChannelRow = Published & {
  id: string;
  provider_id: string;
  slug: string;
  name: string;
  channel_type: ChannelType;
  description: string | null;
};

export type ModelFamilyRow = Published & {
  id: string;
  provider_id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type ModelVersionRow = Published & {
  id: string;
  model_family_id: string;
  slug: string;
  display_name: string;
  version_label: string | null;
  snapshot_date: string | null;
  base_model_version_id: string | null;
  description: string | null;
};

// ---------------------------------------------------------------------------
// Measurements and pricing (0002)
// ---------------------------------------------------------------------------

export type BenchmarkRow = Published & {
  id: string;
  slug: string;
  name: string;
  maintainer_name: string | null;
  homepage_url: string | null;
  description: string | null;
  measures: string | null;
  inclusion_status: string;
  inclusion_rationale: string | null;
  known_limitations: string | null;
  contamination_notes: string | null;
};

export type BenchmarkVersionRow = Published & {
  id: string;
  benchmark_id: string;
  version_label: string;
  dataset_revision: string | null;
  released_on: string | null;
  task_count: number | null;
  scoring_method: string | null;
  test_set_public: boolean | null;
  has_private_holdout: boolean | null;
  notes: string | null;
};

export type BenchmarkMetricRow = Published & {
  id: string;
  benchmark_version_id: string;
  key: string;
  name: string;
  unit: string;
  higher_is_better: boolean;
  min_value: NumericValue | null;
  max_value: NumericValue | null;
  description: string | null;
};

export type EvaluationConfigurationRow = Published & {
  id: string;
  label: string;
  disclosure_level: DisclosureLevel;
  reasoning_mode: ReasoningMode;
  reasoning_effort: string | null;
  reasoning_budget_tokens: number | null;
  temperature: NumericValue | null;
  top_p: NumericValue | null;
  max_output_tokens: number | null;
  aggregation_method: AggregationMethod;
  attempts_per_task: number | null;
  prompting_style: PromptingStyle;
  few_shot_examples: number | null;
  tool_access: ToolAccess[];
  harness_disclosure: HarnessDisclosure;
  evaluation_harness_version_id: string | null;
  step_limit: number | null;
  time_limit_seconds: number | null;
  token_budget: number | null;
  weights_precision: string | null;
  extra_settings: Record<string, unknown>;
  notes: string | null;
};

export type BenchmarkResultRow = Published & {
  id: string;
  model_version_id: string;
  benchmark_version_id: string;
  benchmark_metric_id: string;
  evaluation_configuration_id: string;
  deployment_channel_id: string | null;
  score: NumericValue;
  score_ci_lower: NumericValue | null;
  score_ci_upper: NumericValue | null;
  trial_count: number | null;
  subset_label: string;
  excluded_task_count: number | null;
  origin_type: OriginType;
  evaluator_name: string | null;
  reproducibility_grade: ReproducibilityGrade;
  evaluated_on: string | null;
  evaluated_on_precision: DatePrecision;
  reported_on: string | null;
  contamination_status: ContaminationStatus;
  verification_status: VerificationStatus;
  notes: string | null;
};

export type PricingRecordRow = Published & {
  id: string;
  model_version_id: string;
  deployment_channel_id: string;
  billing_dimension: BillingDimension;
  dimension_detail: string | null;
  service_tier: ServiceTier;
  context_threshold_tokens: number | null;
  region: string | null;
  currency: string;
  price_amount: NumericValue;
  unit: PriceUnit;
  unit_quantity: NumericValue;
  valid_from: string;
  valid_to: string | null;
  announced_on: string | null;
  notes: string | null;
};

// ---------------------------------------------------------------------------
// Provenance and history (0003)
// ---------------------------------------------------------------------------

export type SupersessionRow = {
  id: string;
  subject_table: string;
  old_record_id: string;
  new_record_id: string;
  kind: "correction" | "restatement" | "duplicate_merge";
  reason: string;
  decided_at: string;
};

/** View `provenance_link_details` (security_invoker; RLS on base tables applies). */
export type ProvenanceLinkDetailsRow = {
  provenance_link_id: string;
  subject_table: string;
  subject_id: string;
  role: ProvenanceRole;
  tier_at_citation: SourceTier;
  confidence: Confidence;
  confidence_reason: string | null;
  locator: string | null;
  evidence_note: string | null;
  extraction_method: ExtractionMethod;
  extractor_version: string | null;
  cited_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  source_document_id: string;
  document_title: string;
  document_kind: string;
  original_url: string | null;
  current_url: string | null;
  external_identifier: string | null;
  published_on: string | null;
  source_observation_id: string | null;
  retrieved_at: string | null;
  retrieved_url: string | null;
  content_sha256: string | null;
  source_id: string;
  source_name: string;
  publisher_name: string;
  source_current_tier: SourceTier;
  source_registry_status: string;
};

// ---------------------------------------------------------------------------
// supabase-js schema shape
// ---------------------------------------------------------------------------

/** No application writes in Phase 2: inserts and updates are not typed. */
type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: { [K in never]: never };
  Update: { [K in never]: never };
  Relationships: [];
};

type ReadOnlyView<Row> = {
  Row: Row;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      providers: ReadOnlyTable<ProviderRow>;
      deployment_channels: ReadOnlyTable<DeploymentChannelRow>;
      model_families: ReadOnlyTable<ModelFamilyRow>;
      model_versions: ReadOnlyTable<ModelVersionRow>;
      benchmarks: ReadOnlyTable<BenchmarkRow>;
      benchmark_versions: ReadOnlyTable<BenchmarkVersionRow>;
      benchmark_metrics: ReadOnlyTable<BenchmarkMetricRow>;
      evaluation_configurations: ReadOnlyTable<EvaluationConfigurationRow>;
      benchmark_results: ReadOnlyTable<BenchmarkResultRow>;
      pricing_records: ReadOnlyTable<PricingRecordRow>;
      supersessions: ReadOnlyTable<SupersessionRow>;
    };
    Views: {
      provenance_link_details: ReadOnlyView<ProvenanceLinkDetailsRow>;
    };
    Functions: { [K in never]: never };
    Enums: { [K in never]: never };
    CompositeTypes: { [K in never]: never };
  };
};

export type TableName = keyof Database["public"]["Tables"];
export type TableRow<T extends TableName> = Database["public"]["Tables"][T]["Row"];
