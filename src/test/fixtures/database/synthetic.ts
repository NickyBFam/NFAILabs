/**
 * SYNTHETIC TEST FIXTURES — NOT REAL DATA.
 *
 * Every provider, model, benchmark, price, score and source below is fictional
 * and exists only to exercise the data-access layer (AGENTS.md rule 11). None
 * of it describes a real organization, model, benchmark or price, and it must
 * never be seeded into a real database or displayed as real data.
 *
 * Ids use the reserved prefix 00000000-0000-4000-8000-5e... ("5e" for
 * synthetic) so fixture rows are recognizable anywhere they appear.
 *
 * Scenarios covered:
 *   - one provider with a family holding two published exact versions (v1, v2)
 *     plus a draft v3 that must never be public;
 *   - a draft provider and family that must never be public;
 *   - v1 input-token price that changed on 2026-04-01 (closed + open records);
 *   - a v1 output-token price corrected after publication (superseded record
 *     plus its published replacement over the same period);
 *   - a draft future v1 price that must not become current;
 *   - benchmark results tied to exact versions (v1 and v2) on one benchmark
 *     version, plus a superseded result, a withdrawn result and a draft result;
 *   - provenance: primary and corroborating citations, a revoked link, and a
 *     discovery link that must not be shown.
 */
import type {
  BenchmarkMetricRow,
  BenchmarkResultRow,
  BenchmarkRow,
  BenchmarkVersionRow,
  DeploymentChannelRow,
  EvaluationConfigurationRow,
  ModelFamilyRow,
  ModelVersionRow,
  PricingRecordRow,
  ProviderRow,
  ProvenanceLinkDetailsRow,
  PublicationState,
} from "@/types/database";

/** Deterministic synthetic UUID: kind (1–255) and sequence (1–65535). */
export function synthId(kind: number, sequence: number): string {
  const tail = `5e${kind.toString(16).padStart(2, "0")}${sequence.toString(16).padStart(8, "0")}`;
  return `00000000-0000-4000-8000-${tail}`;
}

const CREATED = "2026-01-01T00:00:00.000Z";

function lifecycle(state: PublicationState) {
  return {
    publication_state: state,
    created_at: CREATED,
    updated_at: CREATED,
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const ids = {
  provider: synthId(1, 1),
  draftProvider: synthId(1, 2),
  channel: synthId(2, 1),
  family: synthId(3, 1),
  draftFamily: synthId(3, 2),
  v1: synthId(4, 1),
  v2: synthId(4, 2),
  v3Draft: synthId(4, 3),
  draftFamilyVersion: synthId(4, 4),
  benchmark: synthId(5, 1),
  benchmarkV1: synthId(6, 1),
  benchmarkV2: synthId(6, 2),
  metricPassRate: synthId(7, 1),
  metricPassRateV2: synthId(7, 2),
  configuration: synthId(8, 1),
  draftConfiguration: synthId(8, 2),
} as const;

export const providers: ProviderRow[] = [
  {
    id: ids.provider,
    slug: "test-provider-labs",
    name: "Test Provider Labs",
    legal_name: null,
    organization_type: "company",
    website_url: "https://provider.example.test",
    description: "Synthetic provider for tests.",
    ...lifecycle("published"),
  },
  {
    id: ids.draftProvider,
    slug: "draft-provider-example",
    name: "Draft Provider Example",
    legal_name: null,
    organization_type: null,
    website_url: null,
    description: "Synthetic unpublished provider.",
    ...lifecycle("draft"),
  },
];

export const deploymentChannels: DeploymentChannelRow[] = [
  {
    id: ids.channel,
    provider_id: ids.provider,
    slug: "example-api",
    name: "Example API",
    channel_type: "first_party_api",
    description: null,
    ...lifecycle("published"),
  },
];

export const modelFamilies: ModelFamilyRow[] = [
  {
    id: ids.family,
    provider_id: ids.provider,
    slug: "example-model-family",
    name: "Example Model Family",
    description: null,
    ...lifecycle("published"),
  },
  {
    id: ids.draftFamily,
    provider_id: ids.provider,
    slug: "draft-model-family",
    name: "Draft Model Family",
    description: null,
    ...lifecycle("draft"),
  },
];

function version(
  id: string,
  familyId: string,
  slug: string,
  displayName: string,
  label: string,
  state: PublicationState,
): ModelVersionRow {
  return {
    id,
    model_family_id: familyId,
    slug,
    display_name: displayName,
    version_label: label,
    snapshot_date: null,
    base_model_version_id: null,
    description: null,
    ...lifecycle(state),
  };
}

export const modelVersions: ModelVersionRow[] = [
  version(ids.v1, ids.family, "example-model-v1", "Example Model v1", "v1", "published"),
  version(ids.v2, ids.family, "example-model-v2", "Example Model v2", "v2", "published"),
  version(ids.v3Draft, ids.family, "example-model-v3", "Example Model v3 Preview", "v3", "draft"),
  version(
    ids.draftFamilyVersion,
    ids.draftFamily,
    "hidden-model-v1",
    "Hidden Model v1",
    "v1",
    "published",
  ),
];

// ---------------------------------------------------------------------------
// Pricing (synthetic amounts in the reserved "XTS" test currency code)
// ---------------------------------------------------------------------------

export const priceIds = {
  inputBeforeChange: synthId(9, 1),
  inputAfterChange: synthId(9, 2),
  outputWrong: synthId(9, 3),
  outputCorrected: synthId(9, 4),
  inputFutureDraft: synthId(9, 5),
  v2Input: synthId(9, 6),
} as const;

function price(
  id: string,
  modelVersionId: string,
  dimension: PricingRecordRow["billing_dimension"],
  amount: string,
  validFrom: string,
  validTo: string | null,
  state: PublicationState,
): PricingRecordRow {
  return {
    id,
    model_version_id: modelVersionId,
    deployment_channel_id: ids.channel,
    billing_dimension: dimension,
    dimension_detail: null,
    service_tier: "standard",
    context_threshold_tokens: null,
    region: null,
    // ISO 4217 reserves XTS "for testing purposes": no real currency, no real price.
    currency: "XTS",
    price_amount: amount,
    unit: "token",
    unit_quantity: "1000000",
    valid_from: validFrom,
    valid_to: validTo,
    announced_on: null,
    notes: "Synthetic test price.",
    ...lifecycle(state),
  };
}

export const pricingRecords: PricingRecordRow[] = [
  price(
    priceIds.inputBeforeChange,
    ids.v1,
    "input_tokens",
    "10.00",
    "2026-01-01T00:00:00.000Z",
    "2026-04-01T00:00:00.000Z",
    "published",
  ),
  price(
    priceIds.inputAfterChange,
    ids.v1,
    "input_tokens",
    "8.00",
    "2026-04-01T00:00:00.000Z",
    null,
    "published",
  ),
  price(
    priceIds.outputWrong,
    ids.v1,
    "output_tokens",
    "99.00",
    "2026-01-01T00:00:00.000Z",
    null,
    "superseded",
  ),
  price(
    priceIds.outputCorrected,
    ids.v1,
    "output_tokens",
    "20.00",
    "2026-01-01T00:00:00.000Z",
    null,
    "published",
  ),
  price(
    priceIds.inputFutureDraft,
    ids.v1,
    "input_tokens",
    "5.00",
    "2026-09-01T00:00:00.000Z",
    null,
    "draft",
  ),
  price(
    priceIds.v2Input,
    ids.v2,
    "input_tokens",
    "12.00",
    "2026-02-01T00:00:00.000Z",
    null,
    "published",
  ),
];

// ---------------------------------------------------------------------------
// Benchmarks and results (synthetic scores)
// ---------------------------------------------------------------------------

export const benchmarks: BenchmarkRow[] = [
  {
    id: ids.benchmark,
    slug: "synthetic-coding-benchmark",
    name: "Synthetic Coding Benchmark",
    maintainer_name: "Synthetic Benchmark Org",
    homepage_url: "https://benchmark.example.test",
    description: "Synthetic benchmark for tests.",
    measures: "Nothing real.",
    inclusion_status: "candidate",
    inclusion_rationale: null,
    known_limitations: null,
    contamination_notes: null,
    ...lifecycle("published"),
  },
];

export const benchmarkVersions: BenchmarkVersionRow[] = [ids.benchmarkV1, ids.benchmarkV2].map(
  (id, index) => ({
    id,
    benchmark_id: ids.benchmark,
    version_label: `${index + 1}.0`,
    dataset_revision: null,
    released_on: null,
    task_count: 100,
    scoring_method: "Synthetic pass rate.",
    test_set_public: true,
    has_private_holdout: false,
    notes: null,
    ...lifecycle("published"),
  }),
);

export const benchmarkMetrics: BenchmarkMetricRow[] = [
  [ids.metricPassRate, ids.benchmarkV1],
  [ids.metricPassRateV2, ids.benchmarkV2],
].map(([id, benchmarkVersionId]) => ({
  id: id!,
  benchmark_version_id: benchmarkVersionId!,
  key: "pass_rate",
  name: "Pass rate",
  unit: "percent",
  higher_is_better: true,
  min_value: 0,
  max_value: 100,
  description: null,
  ...lifecycle("published"),
}));

function configuration(
  id: string,
  label: string,
  state: PublicationState,
): EvaluationConfigurationRow {
  return {
    id,
    label,
    disclosure_level: "full",
    reasoning_mode: "disabled",
    reasoning_effort: null,
    reasoning_budget_tokens: null,
    temperature: 0,
    top_p: null,
    max_output_tokens: 4096,
    aggregation_method: "single_attempt",
    attempts_per_task: 1,
    prompting_style: "zero_shot",
    few_shot_examples: null,
    tool_access: ["none"],
    harness_disclosure: "not_applicable",
    evaluation_harness_version_id: null,
    step_limit: null,
    time_limit_seconds: null,
    token_budget: null,
    weights_precision: null,
    extra_settings: {},
    notes: null,
    ...lifecycle(state),
  };
}

export const evaluationConfigurations: EvaluationConfigurationRow[] = [
  configuration(ids.configuration, "Synthetic default configuration", "published"),
  configuration(ids.draftConfiguration, "Synthetic draft configuration", "draft"),
];

export const resultIds = {
  v1: synthId(10, 1),
  v2: synthId(10, 2),
  v1Superseded: synthId(10, 3),
  v1Correction: synthId(10, 4),
  v2Withdrawn: synthId(10, 5),
  v2Draft: synthId(10, 6),
} as const;

function result(
  id: string,
  modelVersionId: string,
  score: number,
  state: PublicationState,
  overrides: Partial<BenchmarkResultRow> = {},
): BenchmarkResultRow {
  return {
    id,
    model_version_id: modelVersionId,
    benchmark_version_id: ids.benchmarkV1,
    benchmark_metric_id: ids.metricPassRate,
    evaluation_configuration_id: ids.configuration,
    deployment_channel_id: ids.channel,
    score,
    score_ci_lower: null,
    score_ci_upper: null,
    trial_count: null,
    subset_label: "full",
    excluded_task_count: null,
    origin_type: "independent",
    evaluator_name: "Synthetic Evaluator",
    reproducibility_grade: "R2",
    evaluated_on: "2026-02-01",
    evaluated_on_precision: "day",
    reported_on: "2026-02-15",
    contamination_status: "not_assessed",
    verification_status: "source_checked",
    notes: "Synthetic test score.",
    ...lifecycle(state),
    ...overrides,
  };
}

export const benchmarkResults: BenchmarkResultRow[] = [
  result(resultIds.v1, ids.v1, 40, "published"),
  result(resultIds.v2, ids.v2, 55, "published", {
    origin_type: "first_party",
    evaluator_name: null,
    score_ci_lower: 53,
    score_ci_upper: 57,
  }),
  result(resultIds.v1Superseded, ids.v1, 90, "superseded"),
  result(resultIds.v1Correction, ids.v1, 42, "published"),
  result(resultIds.v2Withdrawn, ids.v2, 70, "withdrawn"),
  result(resultIds.v2Draft, ids.v2, 60, "draft"),
];

// ---------------------------------------------------------------------------
// Provenance (view rows)
// ---------------------------------------------------------------------------

function citation(
  linkSequence: number,
  subjectId: string,
  role: ProvenanceLinkDetailsRow["role"],
  overrides: Partial<ProvenanceLinkDetailsRow> = {},
): ProvenanceLinkDetailsRow {
  return {
    provenance_link_id: synthId(11, linkSequence),
    subject_table: "public.benchmark_results",
    subject_id: subjectId,
    role,
    tier_at_citation: "T2",
    confidence: "high",
    confidence_reason: null,
    locator: "Synthetic table 1",
    evidence_note: "Internal synthetic note.",
    extraction_method: "manual",
    extractor_version: null,
    cited_at: CREATED,
    revoked_at: null,
    revoked_reason: null,
    source_document_id: synthId(12, linkSequence),
    document_title: `Synthetic Results Page ${linkSequence}`,
    document_kind: "leaderboard",
    original_url: `https://source.example.test/results/${linkSequence}`,
    current_url: null,
    external_identifier: null,
    published_on: "2026-02-15",
    source_observation_id: synthId(13, linkSequence),
    retrieved_at: "2026-02-16T00:00:00.000Z",
    retrieved_url: `https://source.example.test/results/${linkSequence}`,
    content_sha256: "0".repeat(64),
    source_id: synthId(14, 1),
    source_name: "Synthetic Test Source",
    publisher_name: "Synthetic Benchmark Org",
    source_current_tier: "T2",
    source_registry_status: "approved",
    ...overrides,
  };
}

export const provenanceLinkDetails: ProvenanceLinkDetailsRow[] = [
  citation(1, resultIds.v1, "corroborating"),
  citation(2, resultIds.v1, "primary", {
    current_url: "https://source.example.test/results/2-moved",
  }),
  citation(3, resultIds.v1, "verification", {
    revoked_at: "2026-03-01T00:00:00.000Z",
    revoked_reason: "Synthetic revocation.",
  }),
  citation(4, resultIds.v1, "discovery"),
];

/** Corrections: superseded record id → the record that replaced it. */
export const supersededBy: Readonly<Record<string, string>> = {
  [priceIds.outputWrong]: priceIds.outputCorrected,
  [resultIds.v1Superseded]: resultIds.v1Correction,
};

/** All synthetic rows by table, for the fake client and the fixture guard test. */
export const syntheticTables = {
  providers,
  deployment_channels: deploymentChannels,
  model_families: modelFamilies,
  model_versions: modelVersions,
  benchmarks,
  benchmark_versions: benchmarkVersions,
  benchmark_metrics: benchmarkMetrics,
  evaluation_configurations: evaluationConfigurations,
  benchmark_results: benchmarkResults,
  pricing_records: pricingRecords,
  supersessions: [],
  provenance_link_details: provenanceLinkDetails,
};
