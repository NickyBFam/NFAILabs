-- NFAI Labs local development seed. SYNTHETIC DATA ONLY.
--
-- Every record here is fictional and obviously so (AGENTS.md rule 11): "Example AI Corp",
-- "Test Model Alpha", "Synthetic Benchmark", the reserved ".test" domain, and the ISO 4217
-- test currency XTS. None of it describes a real provider, model, benchmark, score or price.
-- It is applied by `supabase db reset` on a local stack, by the database tests, and, with the
-- owner's involvement, to a dedicated DEVELOPMENT Supabase project for the Phase 2 remote
-- validation (docs/DATABASE.md §8). It must never be applied to a preview or production database.
--
-- Rows go through the real lifecycle (draft -> validated -> published) with provenance, so
-- the seed exercises the same rules as real data entry. All ids start with 5eed.

-- Session-level so it applies whether or not the runner wraps the file in a transaction.
select set_config('nfai.actor_kind', 'system', false), set_config('nfai.actor_label', 'synthetic-seed', false);

-- Source registry: one approved synthetic T1 source, document and retrieval.
insert into public.sources (id, slug, name, publisher_name, tier, source_kind, homepage_url, registry_status)
values ('5eed0000-0000-4000-8000-000000000001', 'example-ai-corp-docs', 'Example AI Corp Docs (synthetic)',
        'Example AI Corp', 'T1', 'provider_documentation', 'https://docs.example-ai.test', 'approved');

insert into public.source_documents (id, source_id, title, document_kind, original_url, published_on)
values ('5eed0000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000001',
        'Example AI Corp model reference (synthetic)', 'api_reference',
        'https://docs.example-ai.test/models', '2026-01-01');

insert into public.source_observations (id, source_document_id, retrieved_at, retrieved_url)
values ('5eed0000-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000002',
        '2026-01-15 12:00:00+00', 'https://docs.example-ai.test/models');

-- Catalog: provider -> family -> exact versions, and a channel.
insert into public.providers (id, slug, name, organization_type, website_url)
values ('5eed0000-0000-4000-8000-000000000101', 'example-ai-corp', 'Example AI Corp', 'company', 'https://example-ai.test');

insert into public.deployment_channels (id, provider_id, slug, name, channel_type)
values ('5eed0000-0000-4000-8000-000000000102', '5eed0000-0000-4000-8000-000000000101', 'example-api',
        'Example API', 'first_party_api');

insert into public.model_families (id, provider_id, slug, name)
values ('5eed0000-0000-4000-8000-000000000103', '5eed0000-0000-4000-8000-000000000101', 'test-model', 'Test Model');

insert into public.model_versions (id, model_family_id, slug, display_name, version_label)
values
  ('5eed0000-0000-4000-8000-000000000104', '5eed0000-0000-4000-8000-000000000103', 'test-model-alpha',
   'Test Model Alpha', 'alpha'),
  -- Stays a draft: must never be visible to the public API.
  ('5eed0000-0000-4000-8000-000000000105', '5eed0000-0000-4000-8000-000000000103', 'test-model-beta',
   'Test Model Beta', 'beta');

-- Measurements: benchmark -> version -> metric, a configuration, one result.
insert into public.benchmarks (id, slug, name, maintainer_name)
values ('5eed0000-0000-4000-8000-000000000201', 'synthetic-benchmark', 'Synthetic Benchmark', 'Example Benchmark Org');

insert into public.benchmark_versions (id, benchmark_id, version_label, scoring_method)
values ('5eed0000-0000-4000-8000-000000000202', '5eed0000-0000-4000-8000-000000000201', '1.0', 'Fraction of synthetic tasks solved.');

insert into public.benchmark_metrics (id, benchmark_version_id, key, name, unit, higher_is_better, min_value, max_value)
values ('5eed0000-0000-4000-8000-000000000203', '5eed0000-0000-4000-8000-000000000202', 'accuracy',
        'Accuracy', 'percent', true, 0, 100);

insert into public.evaluation_configurations
  (id, label, disclosure_level, reasoning_mode, aggregation_method, attempts_per_task, prompting_style,
   tool_access, harness_disclosure)
values ('5eed0000-0000-4000-8000-000000000204', 'Synthetic zero-shot, single attempt', 'full', 'disabled',
        'single_attempt', 1, 'zero_shot', array['none'], 'not_applicable');

insert into public.benchmark_results
  (id, model_version_id, benchmark_version_id, benchmark_metric_id, evaluation_configuration_id,
   score, origin_type, reproducibility_grade, evaluated_on, evaluated_on_precision)
values ('5eed0000-0000-4000-8000-000000000205', '5eed0000-0000-4000-8000-000000000104',
        '5eed0000-0000-4000-8000-000000000202', '5eed0000-0000-4000-8000-000000000203',
        '5eed0000-0000-4000-8000-000000000204', 42.5, 'independent', 'R2', '2026-01-10', 'day');

-- Pricing: Test Model Alpha input tokens, 1.00 XTS per million until 2026-04-01, then 0.80.
insert into public.pricing_records
  (id, model_version_id, deployment_channel_id, billing_dimension, currency, price_amount, unit, unit_quantity, valid_from)
values
  ('5eed0000-0000-4000-8000-000000000301', '5eed0000-0000-4000-8000-000000000104',
   '5eed0000-0000-4000-8000-000000000102', 'input_tokens', 'XTS', 1.00, 'token', 1000000, '2026-01-01 00:00:00+00'),
  -- A draft price for the draft version: never public.
  ('5eed0000-0000-4000-8000-000000000303', '5eed0000-0000-4000-8000-000000000105',
   '5eed0000-0000-4000-8000-000000000102', 'input_tokens', 'XTS', 2.00, 'token', 1000000, '2026-01-01 00:00:00+00');

-- Provenance for every fact that will be published, then review and publication.
insert into public.provenance_links (subject_table, subject_id, source_document_id, source_observation_id, role, evidence_note)
select t.subject_table, t.subject_id, '5eed0000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000003',
       'primary', 'Synthetic seed record.'
from (values
  ('public.providers', '5eed0000-0000-4000-8000-000000000101'::uuid),
  ('public.deployment_channels', '5eed0000-0000-4000-8000-000000000102'),
  ('public.model_families', '5eed0000-0000-4000-8000-000000000103'),
  ('public.model_versions', '5eed0000-0000-4000-8000-000000000104'),
  ('public.benchmarks', '5eed0000-0000-4000-8000-000000000201'),
  ('public.benchmark_versions', '5eed0000-0000-4000-8000-000000000202'),
  ('public.benchmark_metrics', '5eed0000-0000-4000-8000-000000000203'),
  ('public.benchmark_results', '5eed0000-0000-4000-8000-000000000205'),
  ('public.pricing_records', '5eed0000-0000-4000-8000-000000000301')
) as t (subject_table, subject_id);

do $$
declare
  r record;
begin
  for r in
    select * from (values
      (1, 'public.providers', '5eed0000-0000-4000-8000-000000000101'::uuid),
      (2, 'public.deployment_channels', '5eed0000-0000-4000-8000-000000000102'),
      (3, 'public.model_families', '5eed0000-0000-4000-8000-000000000103'),
      (4, 'public.model_versions', '5eed0000-0000-4000-8000-000000000104'),
      (5, 'public.benchmarks', '5eed0000-0000-4000-8000-000000000201'),
      (6, 'public.benchmark_versions', '5eed0000-0000-4000-8000-000000000202'),
      (7, 'public.benchmark_metrics', '5eed0000-0000-4000-8000-000000000203'),
      (8, 'public.evaluation_configurations', '5eed0000-0000-4000-8000-000000000204'),
      (9, 'public.benchmark_results', '5eed0000-0000-4000-8000-000000000205'),
      (10, 'public.pricing_records', '5eed0000-0000-4000-8000-000000000301')
    ) as t (ord, tbl, id)
    order by ord
  loop
    perform public.nfai_transition(r.tbl, r.id, 'validated', 'Synthetic seed: validated.');
    perform public.nfai_transition(r.tbl, r.id, 'published', 'Synthetic seed: approved.');
  end loop;
end;
$$;

-- A price change: close the old row's period, then publish the new price.
update public.pricing_records
   set valid_to = '2026-04-01 00:00:00+00'
 where id = '5eed0000-0000-4000-8000-000000000301';

insert into public.pricing_records
  (id, model_version_id, deployment_channel_id, billing_dimension, currency, price_amount, unit, unit_quantity, valid_from)
values ('5eed0000-0000-4000-8000-000000000302', '5eed0000-0000-4000-8000-000000000104',
        '5eed0000-0000-4000-8000-000000000102', 'input_tokens', 'XTS', 0.80, 'token', 1000000, '2026-04-01 00:00:00+00');

insert into public.provenance_links (subject_table, subject_id, source_document_id, source_observation_id, role, evidence_note)
values ('public.pricing_records', '5eed0000-0000-4000-8000-000000000302', '5eed0000-0000-4000-8000-000000000002',
        '5eed0000-0000-4000-8000-000000000003', 'primary', 'Synthetic seed record.');

select public.nfai_transition('public.pricing_records', '5eed0000-0000-4000-8000-000000000302', 'validated', 'Synthetic seed: validated.');
select public.nfai_transition('public.pricing_records', '5eed0000-0000-4000-8000-000000000302', 'published', 'Synthetic seed: approved.');

-- History: a corrected result (the original stays as superseded) and a withdrawn result.
insert into public.benchmark_results
  (id, model_version_id, benchmark_version_id, benchmark_metric_id, evaluation_configuration_id,
   score, origin_type, reproducibility_grade, evaluated_on, evaluated_on_precision)
values
  ('5eed0000-0000-4000-8000-000000000206', '5eed0000-0000-4000-8000-000000000104',
   '5eed0000-0000-4000-8000-000000000202', '5eed0000-0000-4000-8000-000000000203',
   '5eed0000-0000-4000-8000-000000000204', 43.0, 'independent', 'R2', '2026-01-10', 'day'),
  ('5eed0000-0000-4000-8000-000000000207', '5eed0000-0000-4000-8000-000000000104',
   '5eed0000-0000-4000-8000-000000000202', '5eed0000-0000-4000-8000-000000000203',
   '5eed0000-0000-4000-8000-000000000204', 40.0, 'first_party', 'R1', '2026-01-05', 'day');

insert into public.provenance_links (subject_table, subject_id, source_document_id, source_observation_id, role, evidence_note)
select 'public.benchmark_results', t.id, '5eed0000-0000-4000-8000-000000000002',
       '5eed0000-0000-4000-8000-000000000003', 'primary', 'Synthetic seed record.'
from (values ('5eed0000-0000-4000-8000-000000000206'::uuid), ('5eed0000-0000-4000-8000-000000000207')) as t (id);

select public.nfai_transition('public.benchmark_results', '5eed0000-0000-4000-8000-000000000206', 'validated', 'Synthetic seed: validated.');
select public.nfai_supersede('public.benchmark_results', '5eed0000-0000-4000-8000-000000000205',
                             '5eed0000-0000-4000-8000-000000000206', 'correction', 'Synthetic seed: corrected score.');

select public.nfai_transition('public.benchmark_results', '5eed0000-0000-4000-8000-000000000207', 'validated', 'Synthetic seed: validated.');
select public.nfai_transition('public.benchmark_results', '5eed0000-0000-4000-8000-000000000207', 'published', 'Synthetic seed: approved.');
select public.nfai_withdraw('public.benchmark_results', '5eed0000-0000-4000-8000-000000000207', 'Synthetic seed: withdrawn by its source.');
