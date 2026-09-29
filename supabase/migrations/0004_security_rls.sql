-- =============================================================================
-- NFAI Labs, Phase 2 migration 0004: database security (grants and RLS)
-- =============================================================================
--
-- Owner: Phase 2 Thread C (database security). Conventions: docs/DATABASE.md.
-- Depends on 0001 (catalog), 0002 (measurements, pricing) and 0003 (provenance,
-- history, publication_states). This is the only migration that uses Supabase API
-- roles (anon, authenticated, service_role).
--
-- Model (least privilege, two independent layers):
--
--   1. Grants. anon and authenticated start with NO privileges on anything in the
--      public schema (tables, views, sequences, functions), including objects created
--      by later migrations (default privileges are revoked too). They then receive
--      SELECT only, and only on tables that hold public data. No INSERT, UPDATE,
--      DELETE, TRUNCATE, REFERENCES or TRIGGER is ever granted to them.
--   2. Row Level Security. RLS is enabled on every table in public. The only policies
--      are SELECT policies for anon and authenticated. A fact row is readable only
--      when its publication_state is part of the public historical record
--      (publication_states.is_public: published, superseded, withdrawn) AND every
--      parent row it references is itself readable, so the public never sees a
--      published child of an unpublished parent. Draft, extracted, validated and
--      rejected rows are never readable through the API.
--
-- Roles:
--   * anon: public website visitors. Read-only access to the public record.
--   * authenticated: identical to anon in Phase 2. Signing in grants nothing extra.
--     Admin roles and write paths are designed in Phase 3 (D-009); until then no
--     authenticated user can write, approve, or read internal data.
--   * service_role: trusted server-side code and workers only (never the browser).
--     It has BYPASSRLS on Supabase, so it can read everything and perform the
--     data workflow (insert drafts, attach provenance, transition, supersede). It is
--     still bound by the 0001-0003 triggers (append-only history, frozen reviewed
--     content, no deletion past draft, provenance before publication). It may NOT
--     truncate any table, forge audit or publication-event rows, rewrite the
--     publication-state vocabulary, or register fact tables. Those change only
--     through migrations.
--
-- Internal tables (RLS on, no policies, no API-role grants): audit_log,
-- publication_events, source_archives, fact_tables. The view publication_intervals
-- (built on publication_events) is not granted either.
--
-- Provenance is public where it supports a public fact, with internal columns
-- withheld by column-level grants (actor ids, operational notes, fetch details).
-- Callers must name columns explicitly on those tables (no select *).
--
-- SECURITY DEFINER: none created here. The two in 0003 (audit and publication-event
-- trigger functions) are the only ones allowed; nfai_security_audit() flags any other.
--
-- This migration inserts no data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Visibility helpers (used by policies; callable by API roles)
-- -----------------------------------------------------------------------------

-- The single public-visibility predicate for publication states. Driven by the
-- publication_states vocabulary, which only migrations can change (see section 3).
create function public.nfai_is_public_state(p_state text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.publication_states s
     where s.code = p_state and s.is_public
  );
$$;

comment on function public.nfai_is_public_state(text) is
  'True when rows in this publication state belong to the public historical record (publication_states.is_public). The only state predicate used by RLS.';

-- "Current" facts for normal public queries: published and not superseded or
-- withdrawn. Effective dating (valid_from/valid_to) is applied by the caller.
create function public.nfai_is_current_state(p_state text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.publication_states s
     where s.code = p_state and s.is_current
  );
$$;

comment on function public.nfai_is_current_state(text) is
  'True when rows in this publication state are current, in-force facts (publication_states.is_current). For current-data queries; RLS itself also exposes superseded and withdrawn history.';

-- Whether the CALLER can see row p_id of table p_table. SECURITY INVOKER on purpose:
-- the lookup runs under the caller's own grants and RLS, so for anon it answers
-- "is this row public?" and can never reveal more than the caller could select.
-- Used for polymorphic references (provenance_links.subject_*, supersessions).
create function public.nfai_record_visible(p_table text, p_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rel   regclass;
  v_found boolean;
begin
  v_rel := pg_catalog.to_regclass(p_table);
  if v_rel is null
     or (select c.relnamespace from pg_catalog.pg_class c where c.oid = v_rel) <> 'public'::regnamespace
     or not pg_catalog.has_table_privilege(v_rel, 'SELECT') then
    return false;
  end if;
  execute pg_catalog.format('select exists (select 1 from %s where id = $1)', v_rel)
    into v_found using p_id;
  return v_found;
end;
$$;

comment on function public.nfai_record_visible(text, uuid) is
  'True when the calling role can see the row (grants + RLS). Security invoker: never reveals rows the caller cannot already select.';


-- -----------------------------------------------------------------------------
-- 2. Security self-check
-- -----------------------------------------------------------------------------
-- Returns one row per violation of the Phase 2 security model. Empty means the
-- model holds. Run at the end of this migration (which fails on any violation)
-- and from tests after all migrations. Not callable by API roles.

create function public.nfai_security_audit()
returns table (check_name text, object_name text, detail text)
language sql
stable
set search_path = ''
as $$
  -- Every table in public has RLS enabled.
  select 'rls_disabled', c.oid::regclass::text, 'row level security is not enabled'
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p')
     and not c.relrowsecurity

  union all
  -- API client roles never hold write-type privileges on any public relation.
  select 'api_role_write_privilege', c.oid::regclass::text, r.role || ' has ' || p.priv
    from pg_catalog.pg_class c
   cross join (values ('anon'), ('authenticated')) as r(role)
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and pg_catalog.has_table_privilege(r.role, c.oid, p.priv)

  union all
  -- Columns too (column-level INSERT/UPDATE would bypass the table-level check).
  select 'api_role_column_write_privilege', c.oid::regclass::text, r.role || ' has column ' || p.priv
    from pg_catalog.pg_class c
   cross join (values ('anon'), ('authenticated')) as r(role)
   cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) as p(priv)
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and pg_catalog.has_any_column_privilege(r.role, c.oid, p.priv)

  union all
  -- Internal tables and views are not readable by API client roles at all.
  select 'internal_relation_readable', c.oid::regclass::text, r.role || ' can select'
    from pg_catalog.pg_class c
   cross join (values ('anon'), ('authenticated')) as r(role)
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('audit_log', 'publication_events', 'source_archives', 'fact_tables', 'publication_intervals')
     and pg_catalog.has_any_column_privilege(r.role, c.oid, 'SELECT')

  union all
  -- API client roles can execute only the visibility helpers.
  select 'api_role_function_execute', p.oid::regprocedure::text, r.role || ' can execute'
    from pg_catalog.pg_proc p
   cross join (values ('anon'), ('authenticated')) as r(role)
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('nfai_is_public_state', 'nfai_is_current_state', 'nfai_record_visible')
     and pg_catalog.has_function_privilege(r.role, p.oid, 'EXECUTE')

  union all
  -- SECURITY DEFINER only where reviewed, and always with a pinned search_path.
  select 'security_definer_unreviewed', p.oid::regprocedure::text, 'security definer function is not on the reviewed list'
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and p.proname not in ('nfai_audit_row_change', 'nfai_fact_log_event')

  union all
  select 'security_definer_search_path', p.oid::regprocedure::text, 'security definer function has no pinned search_path'
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and not exists (select 1 from pg_catalog.unnest(p.proconfig) as cfg where cfg like 'search_path=%')

  union all
  -- Views readable by API roles must run with the caller's rights, so RLS applies.
  select 'view_not_security_invoker', c.oid::regclass::text, 'view readable by API roles without security_invoker'
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('v', 'm')
     and (pg_catalog.has_any_column_privilege('anon', c.oid, 'SELECT')
          or pg_catalog.has_any_column_privilege('authenticated', c.oid, 'SELECT'))
     and (c.relkind = 'm'
          or not coalesce(c.reloptions @> array['security_invoker=true'] or c.reloptions @> array['security_invoker=on'], false))

  union all
  -- service_role never truncates (TRUNCATE skips row triggers and history guards).
  select 'service_role_truncate', c.oid::regclass::text, 'service_role has TRUNCATE'
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p')
     and pg_catalog.has_table_privilege('service_role', c.oid, 'TRUNCATE')

  union all
  -- Audit history and workflow vocabulary are written only by triggers and migrations.
  select 'service_role_protected_write', c.oid::regclass::text, 'service_role has ' || p.priv
    from pg_catalog.pg_class c
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('audit_log', 'publication_events', 'fact_tables', 'source_tiers',
                       'publication_states', 'publication_state_transitions')
     and (pg_catalog.has_table_privilege('service_role', c.oid, p.priv)
          or (p.priv <> 'DELETE' and pg_catalog.has_any_column_privilege('service_role', c.oid, p.priv)))

  union all
  select 'service_role_register_fact_table', p.oid::regprocedure::text, 'service_role can register fact tables'
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'nfai_register_fact_table'
     and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')

  union all
  -- Every registered fact table is readable by anon only through a policy (RLS on and
  -- at least one policy for anon), never by a blanket grant without row filtering.
  select 'fact_table_without_public_policy', f.table_name, 'registered fact table has no SELECT policy for anon'
    from public.fact_tables f
   where not exists (
     select 1 from pg_catalog.pg_policy pol
      where pol.polrelid = pg_catalog.to_regclass(f.table_name)
        and pol.polcmd in ('r', '*')
        and 'anon'::regrole = any (pol.polroles)
   );
$$;

comment on function public.nfai_security_audit() is
  'Lists violations of the Phase 2 security model (RLS coverage, API-role privileges, SECURITY DEFINER review, view invoker rights, service_role limits). Empty result = model holds.';


-- -----------------------------------------------------------------------------
-- 3. Baseline: revoke everything, then grant back deliberately
-- -----------------------------------------------------------------------------
-- Supabase grants anon/authenticated/service_role ALL on new public objects by
-- default. Revoke it for existing objects and for objects later migrations create,
-- so a new table is invisible to the API until a migration grants and polices it.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- service_role: keep the data workflow, remove what no job legitimately needs.
revoke truncate on all tables in schema public from service_role;
alter default privileges in schema public revoke truncate on tables from service_role;

revoke insert, update, delete on
  public.audit_log,
  public.publication_events,
  public.fact_tables,
  public.source_tiers,
  public.publication_states,
  public.publication_state_transitions
from service_role;

revoke execute on function public.nfai_register_fact_table(regclass, text, boolean, text[]) from service_role;
revoke execute on function public.nfai_security_audit() from service_role;

-- API roles may call only the visibility helpers (policies need them).
grant execute on function public.nfai_is_public_state(text)      to anon, authenticated, service_role;
grant execute on function public.nfai_is_current_state(text)     to anon, authenticated, service_role;
grant execute on function public.nfai_record_visible(text, uuid) to anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 4. Enable RLS on every table in public
-- -----------------------------------------------------------------------------
-- A table with RLS and no policy is closed to anon/authenticated even if a grant
-- slips through. service_role bypasses RLS on Supabase.

do $$
declare
  v_rel regclass;
begin
  for v_rel in
    select c.oid::regclass
      from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
     order by c.relname
  loop
    execute pg_catalog.format('alter table %s enable row level security', v_rel);
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Public read: catalog (0001)
-- -----------------------------------------------------------------------------
-- Pattern: public state AND every referenced parent visible to the caller (the
-- parent's own policy decides). Parents are checked through exists() under the
-- caller's RLS, so the rule composes down the provider -> family -> version chain.
-- model_versions.base_model_version_id is not checked (a self-reference would make
-- the policy recursive); it is an optional pointer to another exact version.

grant select on public.providers to anon, authenticated;
create policy providers_public_read on public.providers
  for select to anon, authenticated
  using (public.nfai_is_public_state(publication_state));

grant select on public.deployment_channels to anon, authenticated;
create policy deployment_channels_public_read on public.deployment_channels
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.providers p where p.id = deployment_channels.provider_id)
  );

grant select on public.model_families to anon, authenticated;
create policy model_families_public_read on public.model_families
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.providers p where p.id = model_families.provider_id)
  );

grant select on public.model_versions to anon, authenticated;
create policy model_versions_public_read on public.model_versions
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.model_families f where f.id = model_versions.model_family_id)
  );

grant select on public.model_version_aliases to anon, authenticated;
create policy model_version_aliases_public_read on public.model_version_aliases
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.model_versions v where v.id = model_version_aliases.model_version_id)
    and exists (select 1 from public.deployment_channels ch where ch.id = model_version_aliases.deployment_channel_id)
  );

grant select on public.model_releases to anon, authenticated;
create policy model_releases_public_read on public.model_releases
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.model_versions v where v.id = model_releases.model_version_id)
    and (model_releases.deployment_channel_id is null
         or exists (select 1 from public.deployment_channels ch where ch.id = model_releases.deployment_channel_id))
  );

grant select on public.capabilities to anon, authenticated;
create policy capabilities_public_read on public.capabilities
  for select to anon, authenticated
  using (public.nfai_is_public_state(publication_state));

grant select on public.model_capabilities to anon, authenticated;
create policy model_capabilities_public_read on public.model_capabilities
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.model_versions v where v.id = model_capabilities.model_version_id)
    and exists (select 1 from public.capabilities c where c.id = model_capabilities.capability_id)
    and (model_capabilities.deployment_channel_id is null
         or exists (select 1 from public.deployment_channels ch where ch.id = model_capabilities.deployment_channel_id))
  );


-- -----------------------------------------------------------------------------
-- 6. Public read: measurements and pricing (0002)
-- -----------------------------------------------------------------------------

grant select on public.benchmarks to anon, authenticated;
create policy benchmarks_public_read on public.benchmarks
  for select to anon, authenticated
  using (public.nfai_is_public_state(publication_state));

grant select on public.benchmark_versions to anon, authenticated;
create policy benchmark_versions_public_read on public.benchmark_versions
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.benchmarks b where b.id = benchmark_versions.benchmark_id)
  );

grant select on public.benchmark_metrics to anon, authenticated;
create policy benchmark_metrics_public_read on public.benchmark_metrics
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.benchmark_versions bv where bv.id = benchmark_metrics.benchmark_version_id)
  );

grant select on public.evaluation_harnesses to anon, authenticated;
create policy evaluation_harnesses_public_read on public.evaluation_harnesses
  for select to anon, authenticated
  using (public.nfai_is_public_state(publication_state));

grant select on public.evaluation_harness_versions to anon, authenticated;
create policy evaluation_harness_versions_public_read on public.evaluation_harness_versions
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.evaluation_harnesses h where h.id = evaluation_harness_versions.evaluation_harness_id)
  );

grant select on public.evaluation_configurations to anon, authenticated;
create policy evaluation_configurations_public_read on public.evaluation_configurations
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and (evaluation_configurations.evaluation_harness_version_id is null
         or exists (select 1 from public.evaluation_harness_versions hv
                     where hv.id = evaluation_configurations.evaluation_harness_version_id))
  );

-- A result is public only when the exact model version, benchmark version, metric and
-- evaluation configuration it belongs to are all public too.
grant select on public.benchmark_results to anon, authenticated;
create policy benchmark_results_public_read on public.benchmark_results
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.model_versions v where v.id = benchmark_results.model_version_id)
    and exists (select 1 from public.benchmark_versions bv where bv.id = benchmark_results.benchmark_version_id)
    and exists (select 1 from public.benchmark_metrics m where m.id = benchmark_results.benchmark_metric_id)
    and exists (select 1 from public.evaluation_configurations ec where ec.id = benchmark_results.evaluation_configuration_id)
    and (benchmark_results.deployment_channel_id is null
         or exists (select 1 from public.deployment_channels ch where ch.id = benchmark_results.deployment_channel_id))
  );

grant select on public.pricing_records to anon, authenticated;
create policy pricing_records_public_read on public.pricing_records
  for select to anon, authenticated
  using (
    public.nfai_is_public_state(publication_state)
    and exists (select 1 from public.model_versions v where v.id = pricing_records.model_version_id)
    and exists (select 1 from public.deployment_channels ch where ch.id = pricing_records.deployment_channel_id)
  );


-- -----------------------------------------------------------------------------
-- 7. Public read: methodology vocabulary (0003)
-- -----------------------------------------------------------------------------
-- Source tiers and publication states are published methodology, not facts.

grant select on public.source_tiers to anon, authenticated;
create policy source_tiers_public_read on public.source_tiers
  for select to anon, authenticated using (true);

grant select on public.publication_states to anon, authenticated;
create policy publication_states_public_read on public.publication_states
  for select to anon, authenticated using (true);

grant select on public.publication_state_transitions to anon, authenticated;
create policy publication_state_transitions_public_read on public.publication_state_transitions
  for select to anon, authenticated using (true);


-- -----------------------------------------------------------------------------
-- 8. Public read: provenance (0003)
-- -----------------------------------------------------------------------------
-- Provenance is visible exactly where it supports something the caller can see.
-- Chain: provenance_links (subject visible) -> source_documents (cited by a visible
-- link) -> sources (has a visible document); locations follow their document and
-- observations follow a visible link. Column grants withhold internal fields:
--   provenance_links: created_by, revoked_by (actor ids)
--   sources: fetch_method, terms_notes, notes (operations)
--   source_documents, source_document_locations: notes
--   source_observations: http_status, content_type, retrieval_method, notes
--   supersessions: decided_by (actor id)
-- Public links: active (not revoked) and not 'discovery' (a discovery path may be a
-- T5 source that must never appear as support). Revocation history stays internal
-- in audit_log.

grant select (
  id, subject_table, subject_id, source_document_id, source_observation_id, role, tier_at_citation,
  locator, evidence_note, extraction_method, extractor_version, confidence, confidence_reason,
  created_at, revoked_at, revoked_reason
) on public.provenance_links to anon, authenticated;
create policy provenance_links_public_read on public.provenance_links
  for select to anon, authenticated
  using (
    provenance_links.revoked_at is null
    and provenance_links.role <> 'discovery'
    and public.nfai_record_visible(provenance_links.subject_table, provenance_links.subject_id)
  );

grant select (
  id, source_id, title, document_kind, original_url, external_identifier, citation_text,
  published_on, publisher_version, language, created_at, updated_at
) on public.source_documents to anon, authenticated;
create policy source_documents_public_read on public.source_documents
  for select to anon, authenticated
  using (
    exists (select 1 from public.provenance_links l where l.source_document_id = source_documents.id)
  );

grant select (
  id, slug, name, publisher_name, tier, source_kind, homepage_url, registry_status, created_at, updated_at
) on public.sources to anon, authenticated;
create policy sources_public_read on public.sources
  for select to anon, authenticated
  using (
    exists (select 1 from public.source_documents d where d.source_id = sources.id)
  );

grant select (
  id, source_document_id, url, relation, observed_at, created_at
) on public.source_document_locations to anon, authenticated;
create policy source_document_locations_public_read on public.source_document_locations
  for select to anon, authenticated
  using (
    exists (select 1 from public.source_documents d where d.id = source_document_locations.source_document_id)
  );

grant select (
  id, source_document_id, retrieved_at, retrieved_url, content_sha256, observed_version, created_at
) on public.source_observations to anon, authenticated;
create policy source_observations_public_read on public.source_observations
  for select to anon, authenticated
  using (
    exists (select 1 from public.provenance_links l where l.source_observation_id = source_observations.id)
  );

-- Corrections are public once both sides of the supersession are public.
grant select (
  id, subject_table, old_record_id, new_record_id, kind, reason, decided_at, decided_by_kind, created_at
) on public.supersessions to anon, authenticated;
create policy supersessions_public_read on public.supersessions
  for select to anon, authenticated
  using (
    public.nfai_record_visible(supersessions.subject_table, supersessions.old_record_id)
    and public.nfai_record_visible(supersessions.subject_table, supersessions.new_record_id)
  );

-- Views from 0003 are security_invoker, so the policies above apply through them.
-- They reference only granted columns.
grant select on public.provenance_link_details to anon, authenticated;
grant select on public.supersession_chains     to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 9. Internal only (documented for completeness; nothing is granted)
-- -----------------------------------------------------------------------------
--   audit_log            row images, actor ids, reasons: admin/Phase 3 tooling only
--   publication_events   reviewer identities and internal reasons (and the
--                        publication_intervals view built on it)
--   source_archives      internal evidence copies, never republished (DATA_SOURCES §6)
--   fact_tables          lifecycle registry, migration-managed
-- RLS is enabled on the tables and they have no policies, so even an accidental
-- future grant to anon/authenticated returns no rows.


-- -----------------------------------------------------------------------------
-- 10. Verify
-- -----------------------------------------------------------------------------

do $$
declare
  v_report text;
begin
  select pg_catalog.string_agg(a.check_name || ': ' || a.object_name || ' (' || a.detail || ')', E'\n')
    into v_report
    from public.nfai_security_audit() a;
  if v_report is not null then
    raise exception E'nfai: security model violations:\n%', v_report;
  end if;
end;
$$;
