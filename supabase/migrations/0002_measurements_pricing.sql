-- NFAI Labs, Phase 2: measurements and pricing schema.
--
-- Owns: benchmarks, benchmark versions, benchmark metrics, evaluation harnesses and
-- harness versions, evaluation configurations, benchmark results, and pricing records.
-- Depends on 0001 (catalog tables and the shared nfai_* trigger functions). Sources and
-- provenance links (every published result and price must cite a source), supersession
-- and correction records, and audit history live in 0003. RLS and grants live in 0004.
-- Conventions: docs/DATABASE.md and the header of 0001.
--
-- Core rule (METHODOLOGY.md §1, D-003): a benchmark result belongs to exactly one exact
-- model version, one benchmark version (and one of its metrics), and one evaluation
-- configuration. There is no column through which a result can attach to a provider or
-- a model family.
--
-- Deliberately not here yet:
--   * evaluation_runs (run-level artifacts for NFAI's own suites) — Phase 14.
--   * benchmark version score-compatibility declarations and comparability grouping
--     logic — Phase 5 (METHODOLOGY.md §6, §8).
--   * ranking categories, methodology versions, snapshots, derived scores — Phase 6.
--
-- This migration contains structure only. It inserts no data.

-- ---------------------------------------------------------------------------
-- benchmarks
-- ---------------------------------------------------------------------------

create table public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  maintainer_name text,
  homepage_url text,
  description text,
  measures text,
  inclusion_status text not null default 'candidate',
  inclusion_rationale text,
  known_limitations text,
  contamination_notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmarks_slug_key unique (slug),
  constraint benchmarks_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  constraint benchmarks_name_check check (length(btrim(name)) > 0),
  constraint benchmarks_homepage_url_check check (homepage_url ~ '^https?://'),
  constraint benchmarks_inclusion_status_check check (
    inclusion_status in ('candidate', 'included', 'included_limited', 'deprecated', 'excluded')
  ),
  constraint benchmarks_inclusion_rationale_check check (
    inclusion_status = 'candidate' or inclusion_rationale is not null
  )
);

comment on table public.benchmarks is
  'The conceptual identity of an evaluation, independent of its versions. Results never reference a benchmark directly, only a benchmark version.';
comment on column public.benchmarks.maintainer_name is 'Owning/maintaining organization as named by the benchmark. NULL means not yet recorded.';
comment on column public.benchmarks.inclusion_status is
  'METHODOLOGY.md §2. Any status other than candidate needs a rationale. The inclusion decision itself is recorded in DECISIONS.md (Phase 5).';

create trigger benchmarks_set_updated_at
  before update on public.benchmarks
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- benchmark_versions
-- ---------------------------------------------------------------------------

create table public.benchmark_versions (
  id uuid primary key default gen_random_uuid(),
  benchmark_id uuid not null references public.benchmarks (id) on delete restrict,
  version_label text not null,
  dataset_revision text,
  released_on date,
  task_count integer,
  scoring_method text,
  test_set_public boolean,
  has_private_holdout boolean,
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmark_versions_benchmark_id_version_label_key unique (benchmark_id, version_label),
  constraint benchmark_versions_version_label_check check (length(btrim(version_label)) > 0),
  constraint benchmark_versions_task_count_check check (task_count > 0)
);

comment on table public.benchmark_versions is
  'A pinned version of a benchmark: fixed task set, scoring method, and rules. Results from different versions are separate and never merged unless the owner declares them score-compatible (recorded in a later phase).';
comment on column public.benchmark_versions.version_label is 'The owner''s version label, or an NFAI pin such as a dataset revision or date when the owner has none.';
comment on column public.benchmark_versions.dataset_revision is 'Exact dataset revision, commit, or content hash, when known.';
comment on column public.benchmark_versions.test_set_public is 'Contamination context (METHODOLOGY.md §9). NULL means unknown.';

create index benchmark_versions_benchmark_id_idx on public.benchmark_versions (benchmark_id);

create trigger benchmark_versions_set_updated_at
  before update on public.benchmark_versions
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- benchmark_metrics
-- ---------------------------------------------------------------------------

create table public.benchmark_metrics (
  id uuid primary key default gen_random_uuid(),
  benchmark_version_id uuid not null references public.benchmark_versions (id) on delete restrict,
  key text not null,
  name text not null,
  unit text not null,
  higher_is_better boolean not null,
  min_value numeric,
  max_value numeric,
  description text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmark_metrics_benchmark_version_id_key_key unique (benchmark_version_id, key),
  -- Target of the composite foreign key from benchmark_results, which guarantees a
  -- result's metric belongs to the result's benchmark version.
  constraint benchmark_metrics_benchmark_version_id_id_key unique (benchmark_version_id, id),
  constraint benchmark_metrics_key_check check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and length(key) <= 100),
  constraint benchmark_metrics_name_check check (length(btrim(name)) > 0),
  constraint benchmark_metrics_unit_check check (
    unit in ('percent', 'fraction', 'score', 'elo', 'count', 'seconds', 'tokens_per_second', 'currency', 'other')
  ),
  constraint benchmark_metrics_range_check check (min_value is null or max_value is null or max_value > min_value)
);

comment on table public.benchmark_metrics is
  'The metrics a benchmark version reports (for example a resolve rate or an accuracy). Unit, direction, and bounds live here once instead of being retyped on every result.';
comment on column public.benchmark_metrics.min_value is 'Lowest possible value, when bounded. Results outside [min_value, max_value] are rejected.';

create trigger benchmark_metrics_set_updated_at
  before update on public.benchmark_metrics
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- evaluation_harnesses and evaluation_harness_versions
-- ---------------------------------------------------------------------------

create table public.evaluation_harnesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  harness_class text not null,
  maintainer_name text,
  homepage_url text,
  description text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_harnesses_slug_key unique (slug),
  constraint evaluation_harnesses_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  constraint evaluation_harnesses_name_check check (length(btrim(name)) > 0),
  constraint evaluation_harnesses_harness_class_check check (
    harness_class in ('no_tools', 'benchmark_official', 'standardized_agent', 'vendor_custom_agent', 'commercial_product_agent', 'other')
  ),
  constraint evaluation_harnesses_homepage_url_check check (homepage_url ~ '^https?://')
);

comment on table public.evaluation_harnesses is
  'Scaffolding used to run a model on a benchmark (prompts, tools, agent loop, scoring). First-class because agentic results depend heavily on it (METHODOLOGY.md §7).';
comment on column public.evaluation_harnesses.harness_class is
  'Results in different harness classes are never ranked against each other as if only the model differed.';

create trigger evaluation_harnesses_set_updated_at
  before update on public.evaluation_harnesses
  for each row execute function public.nfai_set_updated_at();

create table public.evaluation_harness_versions (
  id uuid primary key default gen_random_uuid(),
  evaluation_harness_id uuid not null references public.evaluation_harnesses (id) on delete restrict,
  version_label text not null,
  source_code_url text,
  source_revision text,
  released_on date,
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_harness_versions_evaluation_harness_id_version_label_key unique (evaluation_harness_id, version_label),
  constraint evaluation_harness_versions_version_label_check check (length(btrim(version_label)) > 0),
  constraint evaluation_harness_versions_source_code_url_check check (source_code_url ~ '^https?://')
);

comment on table public.evaluation_harness_versions is 'A pinned version of a harness.';

create index evaluation_harness_versions_evaluation_harness_id_idx
  on public.evaluation_harness_versions (evaluation_harness_id);

create trigger evaluation_harness_versions_set_updated_at
  before update on public.evaluation_harness_versions
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- evaluation_configurations
-- ---------------------------------------------------------------------------

create table public.evaluation_configurations (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  disclosure_level text not null,
  -- Reasoning settings (METHODOLOGY.md §5).
  reasoning_mode text not null,
  reasoning_effort text,
  reasoning_budget_tokens integer,
  -- Sampling and output.
  temperature numeric,
  top_p numeric,
  max_output_tokens integer,
  -- Attempts and aggregation.
  aggregation_method text not null,
  attempts_per_task integer,
  -- Prompting.
  prompting_style text not null,
  few_shot_examples integer,
  -- Tools and harness (METHODOLOGY.md §7).
  tool_access text[] not null,
  harness_disclosure text not null,
  evaluation_harness_version_id uuid references public.evaluation_harness_versions (id) on delete restrict,
  step_limit integer,
  time_limit_seconds integer,
  token_budget bigint,
  -- Open-weights deployment detail.
  weights_precision text,
  -- Residual, genuinely open-ended settings. Anything needed for comparability is a column.
  extra_settings jsonb not null default '{}'::jsonb,
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_configurations_label_check check (length(btrim(label)) > 0),
  constraint evaluation_configurations_disclosure_level_check check (disclosure_level in ('full', 'partial', 'undisclosed')),
  constraint evaluation_configurations_reasoning_mode_check check (
    reasoning_mode in ('disabled', 'enabled', 'adaptive', 'not_applicable', 'undisclosed')
  ),
  constraint evaluation_configurations_reasoning_budget_tokens_check check (reasoning_budget_tokens > 0),
  constraint evaluation_configurations_reasoning_settings_check check (
    reasoning_mode in ('enabled', 'adaptive') or (reasoning_effort is null and reasoning_budget_tokens is null)
  ),
  constraint evaluation_configurations_temperature_check check (temperature >= 0),
  constraint evaluation_configurations_top_p_check check (top_p > 0 and top_p <= 1),
  constraint evaluation_configurations_max_output_tokens_check check (max_output_tokens > 0),
  constraint evaluation_configurations_aggregation_method_check check (
    aggregation_method in ('single_attempt', 'pass_at_k', 'majority_vote', 'best_of_n', 'mean_of_n', 'other', 'undisclosed')
  ),
  constraint evaluation_configurations_attempts_per_task_check check (
    attempts_per_task > 0
    and (aggregation_method <> 'single_attempt' or attempts_per_task = 1)
  ),
  constraint evaluation_configurations_attempts_required_check check (
    aggregation_method not in ('pass_at_k', 'majority_vote', 'best_of_n', 'mean_of_n') or attempts_per_task is not null
  ),
  constraint evaluation_configurations_prompting_style_check check (
    prompting_style in ('zero_shot', 'few_shot', 'benchmark_default', 'other', 'undisclosed')
  ),
  constraint evaluation_configurations_few_shot_examples_check check (
    (prompting_style = 'few_shot') = (few_shot_examples is not null and few_shot_examples > 0)
  ),
  constraint evaluation_configurations_tool_access_check check (
    cardinality(tool_access) > 0
    and tool_access <@ array['none', 'code_execution', 'web_search', 'web_browsing', 'file_system', 'custom_tools', 'undisclosed']::text[]
    and (not ('none' = any (tool_access)) or cardinality(tool_access) = 1)
    and (not ('undisclosed' = any (tool_access)) or cardinality(tool_access) = 1)
  ),
  constraint evaluation_configurations_harness_disclosure_check check (
    harness_disclosure in ('disclosed', 'undisclosed', 'not_applicable')
  ),
  constraint evaluation_configurations_harness_version_check check (
    (harness_disclosure = 'disclosed') = (evaluation_harness_version_id is not null)
  ),
  constraint evaluation_configurations_limits_check check (
    (step_limit is null or step_limit > 0)
    and (time_limit_seconds is null or time_limit_seconds > 0)
    and (token_budget is null or token_budget > 0)
  ),
  constraint evaluation_configurations_extra_settings_check check (jsonb_typeof(extra_settings) = 'object')
);

comment on table public.evaluation_configurations is
  'The conditions a model was evaluated under (METHODOLOGY.md §5). Reusable across results; not tied to one model version, because the same settings can be applied to many. Categorical fields must be declared, using ''undisclosed'' when a source does not say; numeric fields are NULL when unknown. Results with different configurations are distinct and never silently merged.';
comment on column public.evaluation_configurations.reasoning_effort is 'Provider-specific effort label, stored verbatim (no universal scale is assumed).';
comment on column public.evaluation_configurations.attempts_per_task is 'k for pass@k, n for best-of-n / majority vote / mean-of-n; 1 for single attempt; NULL when undisclosed.';
comment on column public.evaluation_configurations.tool_access is
  'Tools available to the model: {none}, {undisclosed}, or a set of code_execution, web_search, web_browsing, file_system, custom_tools.';
comment on column public.evaluation_configurations.harness_disclosure is
  'disclosed requires evaluation_harness_version_id; not_applicable for plain prompting without scaffolding.';

create index evaluation_configurations_evaluation_harness_version_id_idx
  on public.evaluation_configurations (evaluation_harness_version_id) where evaluation_harness_version_id is not null;

create trigger evaluation_configurations_set_updated_at
  before update on public.evaluation_configurations
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- benchmark_results
-- ---------------------------------------------------------------------------

create table public.benchmark_results (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions (id) on delete restrict,
  benchmark_version_id uuid not null references public.benchmark_versions (id) on delete restrict,
  benchmark_metric_id uuid not null,
  evaluation_configuration_id uuid not null references public.evaluation_configurations (id) on delete restrict,
  deployment_channel_id uuid references public.deployment_channels (id) on delete restrict,
  score numeric not null,
  score_ci_lower numeric,
  score_ci_upper numeric,
  trial_count integer,
  subset_label text not null default 'full',
  excluded_task_count integer,
  origin_type text not null,
  evaluator_name text,
  reproducibility_grade text not null,
  evaluated_on date,
  evaluated_on_precision text not null,
  reported_on date,
  contamination_status text not null default 'not_assessed',
  verification_status text not null default 'unverified',
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmark_results_benchmark_metric_fkey
    foreign key (benchmark_version_id, benchmark_metric_id)
    references public.benchmark_metrics (benchmark_version_id, id) on delete restrict,
  constraint benchmark_results_score_ci_check check (
    (score_ci_lower is null) = (score_ci_upper is null)
    and (score_ci_lower is null or (score_ci_lower <= score and score <= score_ci_upper))
  ),
  constraint benchmark_results_trial_count_check check (trial_count > 0),
  constraint benchmark_results_subset_label_check check (length(btrim(subset_label)) > 0),
  constraint benchmark_results_excluded_task_count_check check (excluded_task_count >= 0),
  constraint benchmark_results_origin_type_check check (
    origin_type in ('first_party', 'benchmark_owner', 'independent', 'nfai', 'community')
  ),
  constraint benchmark_results_reproducibility_grade_check check (reproducibility_grade in ('R0', 'R1', 'R2', 'R3')),
  constraint benchmark_results_evaluated_on_precision_check check (
    evaluated_on_precision in ('day', 'month', 'year', 'unknown')
    and ((evaluated_on_precision = 'unknown') = (evaluated_on is null))
  ),
  constraint benchmark_results_contamination_status_check check (
    contamination_status in ('not_assessed', 'no_known_concerns', 'suspected', 'confirmed')
  ),
  constraint benchmark_results_verification_status_check check (
    verification_status in ('unverified', 'source_checked', 'reproduced', 'disputed')
  )
);

comment on table public.benchmark_results is
  'One reported score for one exact model version on one benchmark version metric under one evaluation configuration, from one source (the provenance link lives in 0003). Append-only: results are never updated in place; corrections supersede (0003); a score its source withdraws moves to the withdrawn state. Several sources may report results for the same combination; all are kept and conflicts are flagged, never averaged.';
comment on column public.benchmark_results.deployment_channel_id is 'Channel the model was accessed through, when known (METHODOLOGY.md §5).';
comment on column public.benchmark_results.subset_label is 'Task subset or split used; ''full'' for the complete version. Part of the comparability key (METHODOLOGY.md §6).';
comment on column public.benchmark_results.origin_type is 'Who produced the result (METHODOLOGY.md §3). first_party results are labelled vendor-reported.';
comment on column public.benchmark_results.evaluator_name is 'Organization that ran the evaluation, when different from or more specific than the source publisher.';
comment on column public.benchmark_results.reproducibility_grade is 'METHODOLOGY.md §4. R0 is display-only by default.';
comment on column public.benchmark_results.evaluated_on is 'When the model was actually run (METHODOLOGY.md §10), distinct from reported_on and from the source retrieval date. Month or year precision stores the first day of the period.';
comment on column public.benchmark_results.contamination_status is 'Contamination concern for this model on this benchmark version (METHODOLOGY.md §9).';

create index benchmark_results_model_version_id_idx on public.benchmark_results (model_version_id);
create index benchmark_results_benchmark_idx
  on public.benchmark_results (benchmark_version_id, benchmark_metric_id, evaluation_configuration_id);
create index benchmark_results_evaluation_configuration_id_idx on public.benchmark_results (evaluation_configuration_id);
create index benchmark_results_deployment_channel_id_idx
  on public.benchmark_results (deployment_channel_id) where deployment_channel_id is not null;

-- Scores must fall within the metric's declared bounds.
create function public.nfai_check_benchmark_result_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  metric_min numeric;
  metric_max numeric;
begin
  select m.min_value, m.max_value into metric_min, metric_max
  from public.benchmark_metrics m
  where m.id = new.benchmark_metric_id;

  if (metric_min is not null and (new.score < metric_min or new.score_ci_lower < metric_min))
     or (metric_max is not null and (new.score > metric_max or new.score_ci_upper > metric_max)) then
    raise exception 'benchmark_results score % is outside the metric bounds [%, %]', new.score, metric_min, metric_max
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger benchmark_results_check_score
  before insert or update on public.benchmark_results
  for each row execute function public.nfai_check_benchmark_result_score();
create trigger benchmark_results_set_updated_at
  before update on public.benchmark_results
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- pricing_records
-- ---------------------------------------------------------------------------

create table public.pricing_records (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions (id) on delete restrict,
  deployment_channel_id uuid not null references public.deployment_channels (id) on delete restrict,
  billing_dimension text not null,
  dimension_detail text,
  service_tier text not null default 'standard',
  context_threshold_tokens bigint,
  region text,
  currency text not null,
  price_amount numeric not null,
  unit text not null,
  unit_quantity numeric not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  announced_on date,
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_records_billing_dimension_check check (
    billing_dimension in (
      'input_tokens', 'output_tokens', 'cached_input_read_tokens', 'cached_input_write_tokens', 'reasoning_tokens',
      'image_input', 'image_output', 'audio_input', 'audio_output', 'video_input', 'video_output',
      'request', 'tool_call', 'other'
    )
  ),
  constraint pricing_records_dimension_detail_check check (billing_dimension <> 'other' or dimension_detail is not null),
  constraint pricing_records_service_tier_check check (
    service_tier in ('standard', 'batch', 'priority', 'flex', 'provisioned', 'free_tier', 'other')
  ),
  constraint pricing_records_context_threshold_tokens_check check (context_threshold_tokens > 0),
  constraint pricing_records_region_check check (length(btrim(region)) > 0),
  constraint pricing_records_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint pricing_records_price_amount_check check (price_amount >= 0),
  constraint pricing_records_unit_check check (
    unit in ('token', 'character', 'image', 'megapixel', 'second', 'minute', 'hour', 'request', 'call', 'other')
  ),
  constraint pricing_records_unit_quantity_check check (unit_quantity > 0),
  constraint pricing_records_valid_to_check check (valid_to is null or valid_to > valid_from)
);

comment on table public.pricing_records is
  'Append-only, effective-dated prices for an exact model version on a channel. A price series is identified by (model_version_id, deployment_channel_id, billing_dimension, dimension_detail, service_tier, context_threshold_tokens, region, currency, unit, unit_quantity). A price change inserts a new row and closes the previous row''s valid_to; nothing is overwritten. The price on date D is the published, non-superseded row whose [valid_from, valid_to) contains D.';
comment on column public.pricing_records.price_amount is 'Price per unit_quantity units, in currency. 0 means free. An unknown price has no row.';
comment on column public.pricing_records.context_threshold_tokens is 'For context-length-tiered pricing: the price applies when the prompt exceeds this many tokens. NULL means untiered.';
comment on column public.pricing_records.region is 'Region or data-residency scope when the price is region-specific. NULL means not region-specific.';
comment on column public.pricing_records.valid_from is 'When the price takes or took effect. Date-only sources are stored at 00:00 UTC.';
comment on column public.pricing_records.announced_on is 'When the price (or change) was announced, if different from valid_from.';

create index pricing_records_series_idx
  on public.pricing_records (
    model_version_id, deployment_channel_id, billing_dimension, service_tier, currency, valid_from desc
  );
create index pricing_records_deployment_channel_id_idx on public.pricing_records (deployment_channel_id);

create trigger pricing_records_valid_to_close_once
  before update of valid_to on public.pricing_records
  for each row execute function public.nfai_guard_valid_to_close_once();
create trigger pricing_records_set_updated_at
  before update on public.pricing_records
  for each row execute function public.nfai_set_updated_at();
