-- NFAI Labs, Phase 2: provenance, publication lifecycle, correction/supersession, audit.
--
-- Owns: the source registry (sources, source_documents, source_document_locations,
-- source_observations, source_archives), provenance_links, the publication lifecycle
-- (publication_states, publication_state_transitions, publication_events),
-- supersessions, audit_log, the fact-table registry (fact_tables), and the triggers and
-- functions that attach all of this to the catalog, measurement and pricing tables from
-- 0001 and 0002. RLS and grants live in 0004. Conventions: docs/DATABASE.md.
--
-- Questions this migration makes answerable for every registered fact row:
--   * Where did this fact come from?              provenance_links -> source_documents -> sources
--   * Which version of the source supported it?    provenance_links.source_observation_id
--   * When was it true in the world?               the row's own valid_from / valid_to (0001/0002)
--   * When did NFAI learn it?                      created_at and the first publication_events row
--   * Was it reviewed and approved, by whom, why?  publication_events (state, actor, reason, time)
--   * Has it been corrected? What replaced it?     supersessions (old -> new, kind, reason)
--   * What did NFAI publish at an earlier time?    nfai_state_as_of(), nfai_is_current_as_of()
--
-- Publication lifecycle. Every registered fact table has
--   publication_state text not null default 'draft' references publication_states (code)
-- and the lifecycle below is enforced by nfai_fact_lifecycle_guard():
--
--   draft ─┬─> validated ──> published ─┬─> superseded   (only via a supersessions row)
--          │      │  ▲                  └─> withdrawn    (retracted/invalidated; reason required)
--   extracted ────┘  └── back to draft
--   draft / extracted / validated ──> rejected (reason required)
--
--   * Rows are created as draft (manual entry) or extracted (automated/AI-assisted
--     proposal). Only draft/extracted rows are editable or deletable.
--   * validated and published require qualifying provenance (checked at commit).
--   * validated -> published is the human approval step (D-011); the approver is the
--     actor recorded on that publication_events row.
--   * From validated on, content is frozen. Columns registered as post-review mutable
--     (valid_to on effective-dated tables) may only go from NULL to a value, once.
--   * Nothing past draft/extracted is ever deleted, and no registered table can be
--     TRUNCATEd.
--
-- Time semantics (bitemporal where it matters, nothing more):
--   * Valid time: [valid_from, valid_to) on the fact rows (0001/0002).
--   * Source time: source_documents.published_on; source_observations.retrieved_at.
--   * Record time: created_at on the fact row; publication_events.occurred_at;
--     supersessions.decided_at. Together these reconstruct what NFAI believed when.
--
-- A change in the world (for example a price change) is NOT a supersession: it is a new
-- row with its own valid_from, and the old row's valid_to is closed while it stays
-- published. Supersession is only for corrections, restatements and duplicate merges.
--
-- The only rows inserted here are methodology vocabulary (source tiers, publication
-- states and transitions) from docs/DATA_SOURCES.md and the Phase 2 brief. No provider,
-- model, benchmark, score or price is inserted.


-- ---------------------------------------------------------------------------
-- Source tiers (DATA_SOURCES.md §2)
-- ---------------------------------------------------------------------------

create table public.source_tiers (
  code text primary key,
  rank smallint not null,
  label text not null,
  description text not null,
  may_be_supporting_link boolean not null,
  satisfies_publication_gate boolean not null,
  created_at timestamptz not null default now(),
  constraint source_tiers_rank_key unique (rank),
  constraint source_tiers_code_check check (code ~ '^T[0-9]$'),
  constraint source_tiers_rank_check check (rank between 1 and 9),
  constraint source_tiers_gate_implies_support_check check (not satisfies_publication_gate or may_be_supporting_link)
);

comment on table public.source_tiers is
  'Source trust tiers from DATA_SOURCES.md §2 (methodology vocabulary). A lookup table rather than an enum so tiers can be refined by a later migration.';
comment on column public.source_tiers.may_be_supporting_link is
  'Whether a link to a source of this tier may take a supporting role (primary, corroborating, verification). T4 may (as corroborating evidence); T5 never may, it is discovery/context only.';
comment on column public.source_tiers.satisfies_publication_gate is
  'Whether a supporting link to an approved source of this tier satisfies the normal provenance gate for validation and publication (D-028). T1-T3 only. T4-only evidence never satisfies it; an audited override for T4-only facts is deferred to Phase 3.';

insert into public.source_tiers (code, rank, label, description, may_be_supporting_link, satisfies_publication_gate) values
  ('T1', 1, 'Official provider / API documentation', 'Authoritative for facts about the provider''s own product.', true, true),
  ('T2', 2, 'Original benchmark organization', 'Authoritative for the benchmark''s own definition and official results.', true, true),
  ('T3', 3, 'Reproducible independent evaluator', 'Eligible when methodology, dates and configurations are published.', true, true),
  ('T4', 4, 'Credible secondary reporting', 'Context, leads and corroboration. Never satisfies the publication gate on its own.', true, false),
  ('T5', 5, 'Untrusted', 'Social posts, forums, leaks, aggregators, AI summaries. Never supports a published fact; may be a discovery path.', false, false);


-- ---------------------------------------------------------------------------
-- Publication states and transitions
-- ---------------------------------------------------------------------------

create table public.publication_states (
  code text primary key,
  label text not null,
  description text not null,
  sort_order smallint not null,
  is_initial boolean not null default false,
  content_mutable boolean not null default false,
  deletable boolean not null default false,
  requires_provenance boolean not null default false,
  requires_reason boolean not null default false,
  is_public boolean not null default false,
  is_current boolean not null default false,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint publication_states_sort_order_key unique (sort_order),
  constraint publication_states_code_check check (code ~ '^[a-z][a-z_]*$'),
  constraint publication_states_is_current_check check (not is_current or is_public),
  constraint publication_states_deletable_check check (not deletable or content_mutable)
);

comment on table public.publication_states is
  'Publication/review lifecycle for every registered fact table. A lookup table rather than an enum so states can evolve by migration. RLS (0004) and queries read the flags, not hard-coded state names.';
comment on column public.publication_states.is_initial is 'A row may be created in this state.';
comment on column public.publication_states.content_mutable is 'Content columns may be edited in this state. Reviewed content is frozen.';
comment on column public.publication_states.deletable is 'The row may be physically deleted (never-reviewed work only).';
comment on column public.publication_states.requires_provenance is 'The row must have qualifying provenance (checked at commit).';
comment on column public.publication_states.requires_reason is 'Entering this state needs a reason (nfai.change_reason).';
comment on column public.publication_states.is_public is 'Part of the public record: the current fact or public history (superseded, withdrawn).';
comment on column public.publication_states.is_current is 'A current, in-force published fact: the default for "current data" reads.';

insert into public.publication_states
  (code, label, description, sort_order, is_initial, content_mutable, deletable, requires_provenance, requires_reason, is_public, is_current, is_terminal)
values
  ('draft', 'Draft', 'Entered manually; not yet reviewed.', 10, true, true, true, false, false, false, false, false),
  ('extracted', 'Extracted', 'Proposed by automated or AI-assisted extraction; untrusted until reviewed.', 20, true, true, true, false, false, false, false, false),
  ('validated', 'Validated', 'Checked against its sources; awaiting human approval.', 30, false, false, false, true, false, false, false, false),
  ('published', 'Published', 'Approved by a human reviewer and in force.', 40, false, false, false, true, false, true, true, false),
  ('rejected', 'Rejected', 'Reviewed and not accepted. Kept for audit; never public.', 50, false, false, false, false, true, false, false, true),
  ('superseded', 'Superseded', 'Was published; replaced by a newer row through a supersessions record. Public history.', 60, false, false, false, false, true, true, false, true),
  ('withdrawn', 'Withdrawn', 'Was published; retracted or invalidated without a replacement. Public history.', 70, false, false, false, false, true, true, false, true);

create table public.publication_state_transitions (
  from_state text not null references public.publication_states (code) on delete restrict,
  to_state text not null references public.publication_states (code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (from_state, to_state),
  constraint publication_state_transitions_check check (from_state <> to_state)
);

comment on table public.publication_state_transitions is
  'Allowed publication_state transitions. There is no way back from published: a published fact changes only through supersession or withdrawal.';

insert into public.publication_state_transitions (from_state, to_state) values
  ('draft', 'extracted'),
  ('draft', 'validated'),
  ('draft', 'rejected'),
  ('extracted', 'draft'),
  ('extracted', 'validated'),
  ('extracted', 'rejected'),
  ('validated', 'draft'),
  ('validated', 'published'),
  ('validated', 'rejected'),
  ('published', 'superseded'),
  ('published', 'withdrawn');


-- ---------------------------------------------------------------------------
-- Actor and reason context
-- ---------------------------------------------------------------------------
-- Phase 2 has no admin accounts (Phase 3). The acting identity is read, in order, from
-- transaction settings nfai.actor_id / nfai.actor_kind / nfai.actor_label (set by
-- trusted server-side jobs), the Supabase request JWT claims, then the database role.
-- The reason for a change is read from nfai.change_reason and nfai.change_reason_code.
-- Actor ids deliberately have no foreign key to auth.users: history must outlive
-- account deletion and must not depend on Supabase's auth schema.

create function public.nfai_setting(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting(p_name, true), '');
$$;

comment on function public.nfai_setting(text) is
  'current_setting(name, true) with empty strings treated as unset.';

create function public.nfai_current_actor(
  out actor_id uuid,
  out actor_kind text,
  out actor_label text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_sub text;
  v_role text;
begin
  begin
    v_claims := public.nfai_setting('request.jwt.claims')::jsonb;
  exception when others then
    v_claims := null;
  end;
  v_sub := coalesce(public.nfai_setting('nfai.actor_id'), v_claims ->> 'sub');
  v_role := v_claims ->> 'role';

  begin
    actor_id := v_sub::uuid;
  exception when others then
    actor_id := null;
  end;

  actor_kind := coalesce(
    public.nfai_setting('nfai.actor_kind'),
    case
      when v_role = 'service_role' then 'service'
      when actor_id is not null then 'user'
      else 'database'
    end
  );
  if actor_kind not in ('user', 'service', 'system', 'database') then
    actor_kind := 'database';
  end if;
  actor_label := coalesce(public.nfai_setting('nfai.actor_label'), v_role, session_user::text);
end;
$$;

comment on function public.nfai_current_actor() is
  'Acting identity for publication events and audit: nfai.actor_* settings, else Supabase JWT claims, else the database role.';


-- ---------------------------------------------------------------------------
-- Generic trigger functions
-- ---------------------------------------------------------------------------

create function public.nfai_reject_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%.%: % is not permitted; this table is append-only', tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.nfai_reject_modification() is
  'Trigger for append-only tables: rejects UPDATE, DELETE and TRUNCATE.';

create function public.nfai_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.nfai_touch_updated_at() is 'BEFORE UPDATE trigger: stamps updated_at.';


-- ---------------------------------------------------------------------------
-- sources: the source registry (DATA_SOURCES.md §8)
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  publisher_name text not null,
  tier text not null references public.source_tiers (code) on delete restrict,
  source_kind text not null,
  homepage_url text,
  fetch_method text,
  terms_notes text,
  registry_status text not null default 'proposed',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_slug_key unique (slug),
  constraint sources_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  constraint sources_name_check check (length(btrim(name)) > 0),
  constraint sources_publisher_name_check check (length(btrim(publisher_name)) > 0),
  constraint sources_source_kind_check check (source_kind in (
    'provider_documentation', 'provider_announcement', 'model_card', 'technical_report',
    'benchmark_organization', 'paper', 'independent_evaluator', 'news', 'dataset', 'other'
  )),
  constraint sources_fetch_method_check check (fetch_method in ('manual', 'api', 'feed', 'page')),
  constraint sources_registry_status_check check (registry_status in ('proposed', 'approved', 'retired')),
  constraint sources_homepage_url_check check (homepage_url ~* '^https?://')
);

comment on table public.sources is
  'Source registry: a publisher or outlet with a tier, kind and terms notes. Not a citation; citations point at source_documents. Only approved sources can support validated or published facts.';
comment on column public.sources.tier is
  'Current classification. The tier used by each citation is frozen on provenance_links.tier_at_citation, so a reclassification never rewrites history.';
comment on column public.sources.registry_status is
  'proposed: not yet reviewed; approved: may support facts; retired: kept for history, supports nothing new.';

create trigger sources_touch_updated_at
  before update on public.sources
  for each row execute function public.nfai_touch_updated_at();

create function public.nfai_guard_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'public.sources row % cannot be deleted; set registry_status = ''retired'' instead', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'public.sources id and created_at are immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger sources_guard
  before update or delete on public.sources
  for each row execute function public.nfai_guard_source();


-- ---------------------------------------------------------------------------
-- source_documents: a specific citable document
-- ---------------------------------------------------------------------------

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete restrict,
  title text not null,
  document_kind text not null,
  original_url text,
  external_identifier text,
  citation_text text,
  published_on date,
  publisher_version text,
  language text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_documents_title_check check (length(btrim(title)) > 0),
  constraint source_documents_reference_check check (
    original_url is not null or external_identifier is not null or citation_text is not null
  ),
  constraint source_documents_original_url_check check (original_url ~* '^https?://'),
  constraint source_documents_document_kind_check check (document_kind in (
    'web_page', 'api_reference', 'pricing_page', 'changelog', 'announcement', 'model_card',
    'technical_report', 'paper', 'leaderboard', 'dataset_card', 'repository', 'other'
  ))
);

comment on table public.source_documents is
  'A citable document: page, paper, report, changelog. Stores references and metadata only, never copied content (D-014).';
comment on column public.source_documents.original_url is
  'The URL as first cited. Immutable. Later moves are recorded in source_document_locations, so old citations stay intelligible.';
comment on column public.source_documents.external_identifier is
  'Non-URL identifier such as a DOI, arXiv id, report number or documentation version tag.';
comment on column public.source_documents.citation_text is
  'Bibliographic reference for sources with neither a URL nor an identifier. Not an excerpt.';
comment on column public.source_documents.published_on is
  'Publication date stated by the source, when known (DATA_SOURCES.md §3 published_at). Optional.';

create index source_documents_source_id_idx on public.source_documents (source_id);
create index source_documents_original_url_idx on public.source_documents (original_url)
  where original_url is not null;
create index source_documents_external_identifier_idx on public.source_documents (external_identifier)
  where external_identifier is not null;

create trigger source_documents_touch_updated_at
  before update on public.source_documents
  for each row execute function public.nfai_touch_updated_at();

create function public.nfai_guard_source_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'public.source_documents row % cannot be deleted', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id
     or new.source_id is distinct from old.source_id
     or new.original_url is distinct from old.original_url
     or new.created_at is distinct from old.created_at then
    raise exception 'public.source_documents id, source_id, original_url and created_at are immutable; record a new location or a new document instead'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger source_documents_guard
  before update or delete on public.source_documents
  for each row execute function public.nfai_guard_source_document();


-- ---------------------------------------------------------------------------
-- source_document_locations: append-only URL history
-- ---------------------------------------------------------------------------

create table public.source_document_locations (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents (id) on delete restrict,
  url text not null,
  relation text not null,
  observed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint source_document_locations_url_check check (url ~* '^https?://'),
  constraint source_document_locations_relation_check check (
    relation in ('canonical', 'alternate', 'redirect', 'archive', 'dead')
  )
);

comment on table public.source_document_locations is
  'Append-only URL history for a document. When a page moves, a new canonical location is added; the original URL and each observation''s retrieved URL stay as they were.';

create index source_document_locations_source_document_id_idx
  on public.source_document_locations (source_document_id, observed_at desc);


-- ---------------------------------------------------------------------------
-- source_observations: NFAI looked at a document at a point in time
-- ---------------------------------------------------------------------------

create table public.source_observations (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents (id) on delete restrict,
  retrieved_at timestamptz not null,
  retrieved_url text,
  http_status smallint,
  content_type text,
  content_sha256 text,
  observed_version text,
  retrieval_method text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  constraint source_observations_id_source_document_id_key unique (id, source_document_id),
  constraint source_observations_retrieved_url_check check (retrieved_url ~* '^https?://'),
  constraint source_observations_http_status_check check (http_status between 100 and 599),
  constraint source_observations_content_sha256_check check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint source_observations_retrieval_method_check check (
    retrieval_method in ('manual', 'api', 'feed', 'page_fetch')
  ),
  constraint source_observations_retrieved_at_check check (retrieved_at <= created_at + interval '5 minutes')
);

comment on table public.source_observations is
  'Append-only retrieval record (DATA_SOURCES.md §3 retrieved_at, snapshot hash). Pins which version of a source supported a fact.';
comment on column public.source_observations.retrieved_url is 'The URL actually read at retrieval time.';
comment on column public.source_observations.content_sha256 is 'Lowercase hex SHA-256 of the retrieved content, when captured.';
comment on column public.source_observations.observed_version is 'Revision label visible on the document at retrieval (for example a "last updated" date).';

create index source_observations_source_document_id_idx
  on public.source_observations (source_document_id, retrieved_at desc);
create index source_observations_content_sha256_idx
  on public.source_observations (content_sha256) where content_sha256 is not null;


-- ---------------------------------------------------------------------------
-- source_archives: INTERNAL references to archived evidence
-- ---------------------------------------------------------------------------

create table public.source_archives (
  id uuid primary key default gen_random_uuid(),
  source_observation_id uuid not null references public.source_observations (id) on delete restrict,
  storage_kind text not null,
  storage_ref text not null,
  content_sha256 text,
  byte_size bigint,
  created_at timestamptz not null default now(),
  constraint source_archives_source_observation_id_storage_ref_key unique (source_observation_id, storage_ref),
  constraint source_archives_storage_kind_check check (storage_kind in ('object_storage', 'external_archive', 'other')),
  constraint source_archives_content_sha256_check check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint source_archives_byte_size_check check (byte_size >= 0)
);

comment on table public.source_archives is
  'INTERNAL ONLY. Where an archived evidence copy of an observation is stored. Never republished (DATA_SOURCES.md §6). Kept apart from source_observations so public read policies need no column exceptions.';

create index source_archives_source_observation_id_idx on public.source_archives (source_observation_id);


-- ---------------------------------------------------------------------------
-- fact_tables: registry of tables that take part in the lifecycle
-- ---------------------------------------------------------------------------

create table public.fact_tables (
  table_name text primary key,
  fact_kind text not null,
  requires_provenance boolean not null,
  post_review_mutable_columns text[] not null default '{}',
  registered_at timestamptz not null default now(),
  constraint fact_tables_table_name_check check (table_name ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  constraint fact_tables_fact_kind_check check (fact_kind ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.fact_tables is
  'Tables registered with nfai_register_fact_table(). subject_table columns elsewhere reference this, which keeps the polymorphic provenance, supersession and event links checkable.';
comment on column public.fact_tables.requires_provenance is
  'Whether validated/published rows need qualifying provenance. False only for pure vocabulary or structural tables.';
comment on column public.fact_tables.post_review_mutable_columns is
  'Columns that may still be set after review, only from NULL to a value, once (for example valid_to when a fact stops being in effect).';


-- ---------------------------------------------------------------------------
-- Record helpers
-- ---------------------------------------------------------------------------

create function public.nfai_assert_fact_table(p_table text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.fact_tables f where f.table_name = p_table) then
    raise exception '% is not a registered fact table', p_table using errcode = 'foreign_key_violation';
  end if;
end;
$$;

-- Current publication_state of a registered row, or null when the row does not exist.
-- The table name only ever comes from fact_tables, so the dynamic SQL is not injectable.
create function public.nfai_record_state(p_table text, p_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_state text;
begin
  perform public.nfai_assert_fact_table(p_table);
  execute pg_catalog.format('select publication_state from %s where id = $1', p_table)
    into v_state using p_id;
  return v_state;
end;
$$;

comment on function public.nfai_record_state(text, uuid) is
  'publication_state of a registered fact row, or null if it does not exist.';


-- ---------------------------------------------------------------------------
-- provenance_links: fact <-> source, many-to-many
-- ---------------------------------------------------------------------------

create table public.provenance_links (
  id uuid primary key default gen_random_uuid(),
  subject_table text not null references public.fact_tables (table_name) on delete restrict,
  subject_id uuid not null,
  source_document_id uuid not null references public.source_documents (id) on delete restrict,
  source_observation_id uuid,
  role text not null,
  tier_at_citation text not null references public.source_tiers (code) on delete restrict,
  locator text,
  evidence_note text,
  extraction_method text not null default 'manual',
  extractor_version text,
  confidence text not null default 'high',
  confidence_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text,
  constraint provenance_links_source_observation_fkey
    foreign key (source_observation_id, source_document_id)
    references public.source_observations (id, source_document_id) on delete restrict,
  constraint provenance_links_role_check check (role in (
    'primary', 'corroborating', 'verification', 'contradicting', 'retraction_notice', 'discovery', 'context'
  )),
  constraint provenance_links_extraction_method_check check (
    extraction_method in ('manual', 'automated-parser', 'ai-assisted')
  ),
  constraint provenance_links_extractor_version_check check (
    extraction_method = 'manual' or extractor_version is not null
  ),
  constraint provenance_links_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint provenance_links_confidence_reason_check check (confidence = 'high' or confidence_reason is not null),
  constraint provenance_links_locator_check check (length(locator) <= 500),
  constraint provenance_links_evidence_note_check check (length(evidence_note) <= 1000),
  constraint provenance_links_revoked_check check (
    (revoked_at is null and revoked_by is null and revoked_reason is null)
    or (revoked_at is not null and length(btrim(revoked_reason)) > 0)
  )
);

comment on table public.provenance_links is
  'Links any registered fact row to a source document, optionally pinned to one observation. A fact can have one primary source plus corroborating and verification sources; contradicting sources are stored, not discarded (DATA_SOURCES.md §5). Links are immutable; the only change is a one-time revocation.';
comment on column public.provenance_links.role is
  'primary | corroborating | verification support the fact; contradicting records disagreement; retraction_notice supports a withdrawal; discovery (may be T5) and context never count as support.';
comment on column public.provenance_links.tier_at_citation is
  'Tier of the source when cited, copied from sources.tier on insert.';
comment on column public.provenance_links.locator is 'Where in the document (section, table, anchor, page). Not copied content.';
comment on column public.provenance_links.evidence_note is 'NFAI''s own short note on what the source supports. Not a quotation.';
comment on column public.provenance_links.extractor_version is 'Parser or prompt version for automated-parser / ai-assisted extraction (DATA_SOURCES.md §3).';

create index provenance_links_subject_idx on public.provenance_links (subject_table, subject_id);
create index provenance_links_source_document_id_idx on public.provenance_links (source_document_id);
create index provenance_links_source_observation_id_idx on public.provenance_links (source_observation_id)
  where source_observation_id is not null;

create unique index provenance_links_one_primary_key
  on public.provenance_links (subject_table, subject_id)
  where role = 'primary' and revoked_at is null;

create unique index provenance_links_no_duplicate_key
  on public.provenance_links (subject_table, subject_id, source_document_id, role)
  where revoked_at is null;


-- ---------------------------------------------------------------------------
-- Provenance requirement (DATA_SOURCES.md §1-§2)
-- ---------------------------------------------------------------------------

create function public.nfai_assert_provenance(p_table text, p_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_required boolean;
begin
  select f.requires_provenance into v_required from public.fact_tables f where f.table_name = p_table;
  if not coalesce(v_required, true) then
    return;
  end if;

  -- The normal publication gate (D-028): at least one active supporting link to an
  -- approved source whose tier, frozen at citation, satisfies the gate (T1-T3). Links to
  -- T4 sources may exist as corroborating, contradicting or context evidence, and T5 as
  -- discovery or context, but neither ever satisfies the gate. There is deliberately no
  -- T4-only override in Phase 2: an exceptional, audited manual-review path needs the
  -- Phase 3 identity and approval model.
  if exists (
    select 1
      from public.provenance_links l
      join public.source_tiers t on t.code = l.tier_at_citation
      join public.source_documents d on d.id = l.source_document_id
      join public.sources s on s.id = d.source_id
     where l.subject_table = p_table
       and l.subject_id = p_id
       and l.revoked_at is null
       and l.role in ('primary', 'corroborating', 'verification')
       and t.satisfies_publication_gate
       and s.registry_status = 'approved'
  ) then
    return;
  end if;

  raise exception '%(%) needs an active supporting provenance link to an approved T1-T3 source; T4-only or T5 evidence does not satisfy the publication gate',
    p_table, p_id
    using errcode = 'check_violation';
end;
$$;

comment on function public.nfai_assert_provenance(text, uuid) is
  'Raises unless the row has an active primary/corroborating/verification link to an approved source whose tier at citation satisfies the publication gate (T1-T3). T4-only and T5 evidence never qualify (D-028).';


-- ---------------------------------------------------------------------------
-- supersessions: corrections, restatements, duplicate merges
-- ---------------------------------------------------------------------------

create table public.supersessions (
  id uuid primary key default gen_random_uuid(),
  subject_table text not null references public.fact_tables (table_name) on delete restrict,
  old_record_id uuid not null,
  new_record_id uuid not null,
  kind text not null,
  reason text not null,
  decided_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_kind text not null,
  created_at timestamptz not null default now(),
  constraint supersessions_subject_table_old_record_id_key unique (subject_table, old_record_id),
  constraint supersessions_check check (old_record_id <> new_record_id),
  constraint supersessions_kind_check check (kind in ('correction', 'restatement', 'duplicate_merge')),
  constraint supersessions_reason_check check (length(btrim(reason)) > 0),
  constraint supersessions_decided_by_kind_check check (decided_by_kind in ('user', 'service', 'system', 'database'))
);

comment on table public.supersessions is
  'Append-only replacement links. The old row stays stored and immutable in state superseded. Each row is superseded at most once, so chains are linear; cycles are rejected. Not used for changes in the world such as a new price: that is a new row with its own valid_from.';
comment on column public.supersessions.kind is
  'correction: the old row was wrong; restatement: the source restated or refined the fact; duplicate_merge: the old row duplicated the new one.';

create index supersessions_new_record_idx on public.supersessions (subject_table, new_record_id);

create function public.nfai_supersession_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_state text;
  v_new_state text;
  v_cursor uuid;
  v_depth integer := 0;
  v_actor record;
begin
  v_old_state := public.nfai_record_state(new.subject_table, new.old_record_id);
  v_new_state := public.nfai_record_state(new.subject_table, new.new_record_id);

  if v_old_state is null or v_new_state is null then
    raise exception 'both rows of a supersession must exist in %', new.subject_table
      using errcode = 'foreign_key_violation';
  end if;
  if v_old_state <> 'published' then
    raise exception 'only a published row can be superseded (%(%) is %)', new.subject_table, new.old_record_id, v_old_state
      using errcode = 'check_violation';
  end if;
  if v_new_state <> 'published' then
    raise exception 'the replacing row must be published first (%(%) is %)', new.subject_table, new.new_record_id, v_new_state
      using errcode = 'check_violation';
  end if;

  -- Walk forward from the new row; each row has at most one successor.
  v_cursor := new.new_record_id;
  loop
    select s.new_record_id into v_cursor
      from public.supersessions s
     where s.subject_table = new.subject_table and s.old_record_id = v_cursor;
    exit when not found;
    if v_cursor = new.old_record_id then
      raise exception 'supersession %(%) -> % would create a cycle', new.subject_table, new.old_record_id, new.new_record_id
        using errcode = 'check_violation';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100000 then
      raise exception 'supersession chain for % is too deep', new.subject_table;
    end if;
  end loop;

  select * into v_actor from public.nfai_current_actor();
  new.decided_by := coalesce(new.decided_by, v_actor.actor_id);
  new.decided_by_kind := coalesce(new.decided_by_kind, v_actor.actor_kind);
  new.decided_at := now();
  return new;
end;
$$;

create trigger supersessions_guard
  before insert on public.supersessions
  for each row execute function public.nfai_supersession_guard();
create trigger supersessions_append_only
  before update or delete on public.supersessions
  for each row execute function public.nfai_reject_modification();

-- After the supersession row exists, move the old row to superseded.
create function public.nfai_supersession_mark_old()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('nfai.change_reason',
    coalesce(public.nfai_setting('nfai.change_reason'), new.kind || ': ' || new.reason), true);
  execute pg_catalog.format('update %s set publication_state = ''superseded'' where id = $1', new.subject_table)
    using new.old_record_id;
  return null;
end;
$$;

create trigger supersessions_mark_old
  after insert on public.supersessions
  for each row execute function public.nfai_supersession_mark_old();


-- ---------------------------------------------------------------------------
-- publication_events: every lifecycle state entered (record time)
-- ---------------------------------------------------------------------------

create table public.publication_events (
  id bigint generated always as identity primary key,
  subject_table text not null references public.fact_tables (table_name) on delete restrict,
  record_id uuid not null,
  from_state text references public.publication_states (code) on delete restrict,
  to_state text not null references public.publication_states (code) on delete restrict,
  reason text,
  reason_code text,
  actor_id uuid,
  actor_kind text not null,
  actor_label text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint publication_events_reason_code_check check (reason_code in (
    'error_correction', 'source_retracted', 'source_changed', 'methodology_invalidated',
    'duplicate', 'insufficient_evidence', 'out_of_scope', 'other'
  )),
  constraint publication_events_actor_kind_check check (actor_kind in ('user', 'service', 'system', 'database'))
);

comment on table public.publication_events is
  'Append-only log of each registered row''s creation state and every publication_state change, with actor and reason. Answers who validated, approved, rejected or withdrew a fact and when, and reconstructs what NFAI had published at any past moment.';

create index publication_events_record_idx on public.publication_events (subject_table, record_id, id);
create index publication_events_occurred_at_idx on public.publication_events (occurred_at);

create trigger publication_events_append_only
  before update or delete on public.publication_events
  for each row execute function public.nfai_reject_modification();


-- ---------------------------------------------------------------------------
-- audit_log: row-level change history (INTERNAL)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  table_name text not null,
  record_key text,
  action text not null,
  actor_id uuid,
  actor_kind text not null,
  actor_label text,
  db_role text not null default current_user,
  transaction_id bigint not null default pg_catalog.txid_current(),
  reason text,
  changed_columns text[],
  old_row jsonb,
  new_row jsonb,
  constraint audit_log_action_check check (action in ('INSERT', 'UPDATE', 'DELETE')),
  constraint audit_log_actor_kind_check check (actor_kind in ('user', 'service', 'system', 'database'))
);

comment on table public.audit_log is
  'INTERNAL ONLY. Append-only row-change audit (who, what, when, why, before/after images) for fact tables and the provenance tables. Phase 2 strategy: trigger-captured row images, not event sourcing.';

create index audit_log_record_idx on public.audit_log (table_name, record_key, id);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at);

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.nfai_reject_modification();

-- SECURITY DEFINER: the audit row must be written even though 0004 is expected to deny
-- every API role INSERT on audit_log, and callers must not be able to skip it.
-- search_path is empty and every reference is schema-qualified; the only
-- caller-influenced input is the nfai.change_reason setting, which is stored as data.
create function public.nfai_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor record;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
begin
  select * into v_actor from public.nfai_current_actor();

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := pg_catalog.to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := pg_catalog.to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    select pg_catalog.array_agg(n.key order by n.key)
      into v_changed
      from pg_catalog.jsonb_each(v_new) as n
     where n.value is distinct from (v_old -> n.key);
    if v_changed is null then
      return null;
    end if;
  end if;

  insert into public.audit_log
    (table_name, record_key, action, actor_id, actor_kind, actor_label, reason, changed_columns, old_row, new_row)
  values (
    tg_table_schema || '.' || tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'code', v_old ->> 'code'),
    tg_op,
    v_actor.actor_id, v_actor.actor_kind, v_actor.actor_label,
    public.nfai_setting('nfai.change_reason'),
    v_changed, v_old, v_new
  );
  return null;
end;
$$;

comment on function public.nfai_audit_row_change() is
  'AFTER row trigger writing audit_log. SECURITY DEFINER so clients never need (or get) write access to audit_log.';


-- ---------------------------------------------------------------------------
-- provenance_links triggers
-- ---------------------------------------------------------------------------

create function public.nfai_provenance_link_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_state text;
  v_may_support boolean;
begin
  if tg_op = 'INSERT' then
    if public.nfai_record_state(new.subject_table, new.subject_id) is null then
      raise exception 'provenance subject %(%) does not exist', new.subject_table, new.subject_id
        using errcode = 'foreign_key_violation';
    end if;
    if new.revoked_at is not null then
      raise exception 'provenance links cannot be created already revoked' using errcode = 'check_violation';
    end if;

    select s.tier into new.tier_at_citation
      from public.source_documents d join public.sources s on s.id = d.source_id
     where d.id = new.source_document_id;

    select t.may_be_supporting_link into v_may_support
      from public.source_tiers t where t.code = new.tier_at_citation;
    if new.role in ('primary', 'corroborating', 'verification') and not v_may_support then
      raise exception 'a % source cannot be a % link; use discovery or context', new.tier_at_citation, new.role
        using errcode = 'check_violation';
    end if;

    new.created_by := coalesce(new.created_by, (select a.actor_id from public.nfai_current_actor() a));
    new.created_at := now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Only links of a never-reviewed draft may go, and only with (or before) that draft.
    v_state := public.nfai_record_state(old.subject_table, old.subject_id);
    if v_state is null or exists (
      select 1 from public.publication_states s where s.code = v_state and s.deletable
    ) then
      return old;
    end if;
    raise exception 'provenance link % belongs to a % record and cannot be deleted; revoke it instead', old.id, v_state
      using errcode = 'restrict_violation';
  end if;

  -- UPDATE: a single revocation, nothing else.
  if old.revoked_at is not null then
    raise exception 'provenance link % is revoked and immutable', old.id using errcode = 'check_violation';
  end if;
  if new.revoked_at is null
     or (pg_catalog.to_jsonb(new) - 'revoked_at' - 'revoked_by' - 'revoked_reason')
        is distinct from (pg_catalog.to_jsonb(old) - 'revoked_at' - 'revoked_by' - 'revoked_reason') then
    raise exception 'provenance links are immutable; the only permitted change is revocation (revoked_at, revoked_by, revoked_reason)'
      using errcode = 'check_violation';
  end if;
  new.revoked_by := coalesce(new.revoked_by, (select a.actor_id from public.nfai_current_actor() a));
  return new;
end;
$$;

create trigger provenance_links_guard
  before insert or update or delete on public.provenance_links
  for each row execute function public.nfai_provenance_link_guard();

-- Revoking a link must not leave a validated or published row unsupported.
create function public.nfai_provenance_link_recheck()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.publication_states s
     where s.code = public.nfai_record_state(new.subject_table, new.subject_id) and s.requires_provenance
  ) then
    perform public.nfai_assert_provenance(new.subject_table, new.subject_id);
  end if;
  return null;
end;
$$;

create constraint trigger provenance_links_recheck
  after update on public.provenance_links
  deferrable initially deferred
  for each row execute function public.nfai_provenance_link_recheck();


-- ---------------------------------------------------------------------------
-- Fact-table triggers (attached by nfai_register_fact_table)
-- ---------------------------------------------------------------------------

-- BEFORE INSERT/UPDATE/DELETE: the lifecycle rules.
create function public.nfai_fact_lifecycle_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_table text := tg_table_schema || '.' || tg_table_name;
  v_old_state public.publication_states%rowtype;
  v_new_state public.publication_states%rowtype;
  v_mutable text[];
  v_col text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    select * into v_old_state from public.publication_states s where s.code = old.publication_state;
    if not v_old_state.deletable then
      raise exception '%(%) is % and cannot be deleted; supersede or withdraw it instead',
        v_table, old.id, old.publication_state
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  select * into v_new_state from public.publication_states s where s.code = new.publication_state;
  if not found then
    raise exception 'unknown publication_state %', new.publication_state using errcode = 'foreign_key_violation';
  end if;

  if tg_op = 'INSERT' then
    if not v_new_state.is_initial then
      raise exception '% rows are created as draft or extracted, not %', v_table, new.publication_state
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception '% id is immutable', v_table using errcode = 'check_violation';
  end if;

  select * into v_old_state from public.publication_states s where s.code = old.publication_state;

  if new.publication_state is distinct from old.publication_state then
    if not exists (
      select 1 from public.publication_state_transitions t
       where t.from_state = old.publication_state and t.to_state = new.publication_state
    ) then
      raise exception '%(%) cannot move from % to %', v_table, old.id, old.publication_state, new.publication_state
        using errcode = 'check_violation';
    end if;
    if new.publication_state = 'superseded' and not exists (
      select 1 from public.supersessions s where s.subject_table = v_table and s.old_record_id = old.id
    ) then
      raise exception '%(%) becomes superseded only through a supersessions row (nfai_supersede)', v_table, old.id
        using errcode = 'check_violation';
    end if;
    if v_new_state.requires_reason and public.nfai_setting('nfai.change_reason') is null then
      raise exception 'moving %(%) to % requires a reason (nfai.change_reason, or nfai_transition/nfai_withdraw)',
        v_table, old.id, new.publication_state
        using errcode = 'check_violation';
    end if;
  end if;

  -- Reviewed content is frozen, except registered columns set once from NULL.
  if not v_old_state.content_mutable then
    select f.post_review_mutable_columns into v_mutable from public.fact_tables f where f.table_name = v_table;
    v_old := pg_catalog.to_jsonb(old);
    v_new := pg_catalog.to_jsonb(new);
    foreach v_col in array coalesce(v_mutable, '{}') loop
      if v_new -> v_col is distinct from v_old -> v_col and v_old -> v_col <> 'null'::jsonb then
        raise exception '%(%) %: already set after review and cannot change', v_table, old.id, v_col
          using errcode = 'check_violation';
      end if;
    end loop;
    if (v_old - 'publication_state' - 'updated_at' - coalesce(v_mutable, '{}'))
       is distinct from (v_new - 'publication_state' - 'updated_at' - coalesce(v_mutable, '{}')) then
      raise exception '%(%) is % and its content is frozen; record a new row (and supersede this one if it was wrong)',
        v_table, old.id, old.publication_state
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.nfai_fact_lifecycle_guard() is
  'Lifecycle rules for registered fact tables: initial states, allowed transitions, superseded only via supersessions, reasons where required, frozen reviewed content, no deletion past draft/extracted.';

-- AFTER INSERT / UPDATE OF publication_state: append publication_events.
-- SECURITY DEFINER for the same reason as the audit trigger.
create function public.nfai_fact_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor record;
begin
  if tg_op = 'UPDATE' and new.publication_state is not distinct from old.publication_state then
    return null;
  end if;

  select * into v_actor from public.nfai_current_actor();

  insert into public.publication_events
    (subject_table, record_id, from_state, to_state, reason, reason_code, actor_id, actor_kind, actor_label)
  values (
    tg_table_schema || '.' || tg_table_name,
    new.id,
    case when tg_op = 'UPDATE' then old.publication_state end,
    new.publication_state,
    public.nfai_setting('nfai.change_reason'),
    public.nfai_setting('nfai.change_reason_code'),
    v_actor.actor_id, v_actor.actor_kind, v_actor.actor_label
  );
  return null;
end;
$$;

comment on function public.nfai_fact_log_event() is
  'AFTER row trigger writing publication_events. SECURITY DEFINER so the log cannot be skipped and clients need no write access to it.';

-- AFTER DELETE: a deleted never-reviewed draft takes its provenance links with it.
create function public.nfai_fact_delete_draft_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.provenance_links
   where subject_table = tg_table_schema || '.' || tg_table_name
     and subject_id = old.id;
  return null;
end;
$$;

-- DEFERRED: at commit, a row in a state that requires provenance must have it.
-- Deferral lets one transaction create the row, attach sources and move it forward
-- in any order.
create function public.nfai_fact_check_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_table text := tg_table_schema || '.' || tg_table_name;
begin
  if exists (
    select 1 from public.publication_states s
     where s.code = public.nfai_record_state(v_table, new.id) and s.requires_provenance
  ) then
    perform public.nfai_assert_provenance(v_table, new.id);
  end if;
  return null;
end;
$$;


-- ---------------------------------------------------------------------------
-- Registration
-- ---------------------------------------------------------------------------

create function public.nfai_register_fact_table(
  p_table regclass,
  p_fact_kind text,
  p_requires_provenance boolean default true,
  p_post_review_mutable_columns text[] default '{}'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_id_attnum smallint;
  v_col text;
begin
  select n.nspname || '.' || c.relname into v_name
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.oid = p_table;

  select a.attnum into v_id_attnum
    from pg_catalog.pg_attribute a
   where a.attrelid = p_table and a.attname = 'id' and not a.attisdropped
     and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype;
  if v_id_attnum is null or not exists (
    select 1 from pg_catalog.pg_index i
     where i.indrelid = p_table and i.indisprimary and i.indnatts = 1 and i.indkey[0] = v_id_attnum
  ) then
    raise exception '% needs "id uuid primary key" to be registered', v_name;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute a
     where a.attrelid = p_table and a.attname = 'publication_state' and not a.attisdropped
       and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype and a.attnotnull
  ) then
    raise exception '% needs "publication_state text not null" to be registered', v_name;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
     where k.conrelid = p_table and k.contype = 'f'
       and k.confrelid = 'public.publication_states'::pg_catalog.regclass
       and a.attname = 'publication_state'
  ) then
    raise exception '%.publication_state must reference public.publication_states (code)', v_name;
  end if;

  foreach v_col in array coalesce(p_post_review_mutable_columns, '{}') loop
    if v_col in ('id', 'publication_state', 'created_at') or not exists (
      select 1 from pg_catalog.pg_attribute a
       where a.attrelid = p_table and a.attname = v_col and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception '% is not a valid post-review mutable column of %', v_col, v_name;
    end if;
  end loop;

  insert into public.fact_tables (table_name, fact_kind, requires_provenance, post_review_mutable_columns)
  values (v_name, p_fact_kind, p_requires_provenance, coalesce(p_post_review_mutable_columns, '{}'));

  execute pg_catalog.format(
    'create trigger nfai_lifecycle before insert or update or delete on %s
       for each row execute function public.nfai_fact_lifecycle_guard()', p_table);
  execute pg_catalog.format(
    'create trigger nfai_publication_event after insert or update of publication_state on %s
       for each row execute function public.nfai_fact_log_event()', p_table);
  execute pg_catalog.format(
    'create trigger nfai_delete_draft_links after delete on %s
       for each row execute function public.nfai_fact_delete_draft_links()', p_table);
  execute pg_catalog.format(
    'create constraint trigger nfai_provenance_required after insert or update on %s
       deferrable initially deferred
       for each row execute function public.nfai_fact_check_provenance()', p_table);
  execute pg_catalog.format(
    'create trigger nfai_audit after insert or update or delete on %s
       for each row execute function public.nfai_audit_row_change()', p_table);
  execute pg_catalog.format(
    'create trigger nfai_no_truncate before truncate on %s
       for each statement execute function public.nfai_reject_modification()', p_table);
end;
$$;

comment on function public.nfai_register_fact_table(regclass, text, boolean, text[]) is
  'Opts a fact table (id uuid PK; publication_state text not null referencing publication_states) into the lifecycle guard, provenance requirement, publication_events, audit_log and TRUNCATE protection. Called once per table from a migration.';


-- ---------------------------------------------------------------------------
-- Workflow helpers (server-side; 0004 decides who may execute them)
-- ---------------------------------------------------------------------------

create function public.nfai_transition(
  p_table text,
  p_id uuid,
  p_to_state text,
  p_reason text default null,
  p_reason_code text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_rows integer;
begin
  perform public.nfai_assert_fact_table(p_table);
  perform pg_catalog.set_config('nfai.change_reason', coalesce(p_reason, ''), true);
  perform pg_catalog.set_config('nfai.change_reason_code', coalesce(p_reason_code, ''), true);
  execute pg_catalog.format('update %s set publication_state = $1 where id = $2', p_table)
    using p_to_state, p_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception '%(%) not found', p_table, p_id using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.nfai_transition(text, uuid, text, text, text) is
  'Moves a fact row to another publication_state (validate, publish, reject, send back to draft) with a recorded reason. The lifecycle guard enforces the rules.';

create function public.nfai_withdraw(p_table text, p_id uuid, p_reason text, p_reason_code text default 'other')
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a withdrawal needs a reason' using errcode = 'check_violation';
  end if;
  perform public.nfai_transition(p_table, p_id, 'withdrawn', p_reason, p_reason_code);
end;
$$;

comment on function public.nfai_withdraw(text, uuid, text, text) is
  'Withdraws a published row without replacement (retracted or invalidated). The row stays stored and publicly visible as withdrawn. Attach a retraction_notice provenance link when a source announced it.';

create function public.nfai_supersede(p_table text, p_old_id uuid, p_new_id uuid, p_kind text, p_reason text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.nfai_assert_fact_table(p_table);
  if public.nfai_record_state(p_table, p_new_id) = 'validated' then
    perform public.nfai_transition(p_table, p_new_id, 'published', p_kind || ': ' || coalesce(p_reason, ''), null);
  end if;
  perform pg_catalog.set_config('nfai.change_reason', p_kind || ': ' || coalesce(p_reason, ''), true);
  perform pg_catalog.set_config('nfai.change_reason_code', '', true);
  insert into public.supersessions (subject_table, old_record_id, new_record_id, kind, reason, decided_by_kind)
  values (p_table, p_old_id, p_new_id, p_kind, p_reason, (select a.actor_kind from public.nfai_current_actor() a))
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.nfai_supersede(text, uuid, uuid, text, text) is
  'Publishes a validated replacement (if not yet published) and records that it supersedes a published row, which moves to superseded. Nothing is deleted or overwritten.';


-- ---------------------------------------------------------------------------
-- History queries
-- ---------------------------------------------------------------------------

create function public.nfai_state_as_of(p_table text, p_id uuid, p_as_of timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select e.to_state
    from public.publication_events e
   where e.subject_table = p_table and e.record_id = p_id and e.occurred_at <= p_as_of
   order by e.occurred_at desc, e.id desc
   limit 1;
$$;

comment on function public.nfai_state_as_of(text, uuid, timestamptz) is
  'publication_state NFAI held for a row at a past moment; null if the row did not exist yet.';

create function public.nfai_is_current_as_of(p_table text, p_id uuid, p_as_of timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s.is_current from public.publication_states s
      where s.code = public.nfai_state_as_of(p_table, p_id, p_as_of)),
    false
  );
$$;

comment on function public.nfai_is_current_as_of(text, uuid, timestamptz) is
  'Whether NFAI presented the row as a current published fact at a past moment. Combine with the row''s valid_from/valid_to for "what did NFAI say at time T about the world at time W".';

create view public.publication_intervals
with (security_invoker = true)
as
select
  e.subject_table,
  e.record_id,
  e.to_state as publication_state,
  e.occurred_at as entered_at,
  lead(e.occurred_at) over w as left_at,
  e.reason,
  e.reason_code,
  e.actor_kind
from public.publication_events e
window w as (partition by e.subject_table, e.record_id order by e.occurred_at, e.id);

comment on view public.publication_intervals is
  'Record-time intervals [entered_at, left_at) during which a row held each publication_state.';

create view public.supersession_chains
with (security_invoker = true)
as
with recursive chain as (
  select s.subject_table, s.old_record_id as origin_record_id, s.old_record_id, s.new_record_id,
         s.kind, s.reason, s.decided_at, 1 as depth
    from public.supersessions s
   where not exists (
     select 1 from public.supersessions p
      where p.subject_table = s.subject_table and p.new_record_id = s.old_record_id
   )
  union all
  select c.subject_table, c.origin_record_id, s.old_record_id, s.new_record_id,
         s.kind, s.reason, s.decided_at, c.depth + 1
    from chain c
    join public.supersessions s on s.subject_table = c.subject_table and s.old_record_id = c.new_record_id
)
select * from chain;

comment on view public.supersession_chains is
  'Every supersession step with the first row of its chain and its depth, to read a fact''s full correction history in order.';

create view public.provenance_link_details
with (security_invoker = true)
as
select
  l.id as provenance_link_id,
  l.subject_table,
  l.subject_id,
  l.role,
  l.tier_at_citation,
  l.confidence,
  l.confidence_reason,
  l.locator,
  l.evidence_note,
  l.extraction_method,
  l.extractor_version,
  l.created_at as cited_at,
  l.revoked_at,
  l.revoked_reason,
  d.id as source_document_id,
  d.title as document_title,
  d.document_kind,
  d.original_url,
  (select loc.url
     from public.source_document_locations loc
    where loc.source_document_id = d.id and loc.relation = 'canonical'
    order by loc.observed_at desc, loc.created_at desc
    limit 1) as current_url,
  d.external_identifier,
  d.published_on,
  o.id as source_observation_id,
  o.retrieved_at,
  o.retrieved_url,
  o.content_sha256,
  s.id as source_id,
  s.name as source_name,
  s.publisher_name,
  s.tier as source_current_tier,
  s.registry_status as source_registry_status
from public.provenance_links l
join public.source_documents d on d.id = l.source_document_id
join public.sources s on s.id = d.source_id
left join public.source_observations o on o.id = l.source_observation_id;

comment on view public.provenance_link_details is
  'Provenance links joined to document, latest canonical URL, observation and source. security_invoker, so it exposes only what RLS on the underlying tables allows.';


-- ---------------------------------------------------------------------------
-- Audit, append-only and TRUNCATE protection for this migration's own tables
-- ---------------------------------------------------------------------------

create trigger sources_audit after insert or update or delete on public.sources
  for each row execute function public.nfai_audit_row_change();
create trigger source_documents_audit after insert or update or delete on public.source_documents
  for each row execute function public.nfai_audit_row_change();
create trigger source_document_locations_audit after insert on public.source_document_locations
  for each row execute function public.nfai_audit_row_change();
create trigger source_observations_audit after insert on public.source_observations
  for each row execute function public.nfai_audit_row_change();
create trigger source_archives_audit after insert on public.source_archives
  for each row execute function public.nfai_audit_row_change();
create trigger provenance_links_audit after insert or update or delete on public.provenance_links
  for each row execute function public.nfai_audit_row_change();
create trigger supersessions_audit after insert on public.supersessions
  for each row execute function public.nfai_audit_row_change();
create trigger fact_tables_audit after insert on public.fact_tables
  for each row execute function public.nfai_audit_row_change();
create trigger source_tiers_audit after insert or update or delete on public.source_tiers
  for each row execute function public.nfai_audit_row_change();
create trigger publication_states_audit after insert or update or delete on public.publication_states
  for each row execute function public.nfai_audit_row_change();
create trigger publication_state_transitions_audit after insert or update or delete on public.publication_state_transitions
  for each row execute function public.nfai_audit_row_change();

create trigger source_document_locations_append_only before update or delete on public.source_document_locations
  for each row execute function public.nfai_reject_modification();
create trigger source_observations_append_only before update or delete on public.source_observations
  for each row execute function public.nfai_reject_modification();
create trigger source_archives_append_only before update or delete on public.source_archives
  for each row execute function public.nfai_reject_modification();
create trigger fact_tables_append_only before update or delete on public.fact_tables
  for each row execute function public.nfai_reject_modification();
create trigger source_tiers_no_delete before delete on public.source_tiers
  for each row execute function public.nfai_reject_modification();
create trigger publication_states_no_delete before delete on public.publication_states
  for each row execute function public.nfai_reject_modification();

create trigger sources_no_truncate before truncate on public.sources
  for each statement execute function public.nfai_reject_modification();
create trigger source_documents_no_truncate before truncate on public.source_documents
  for each statement execute function public.nfai_reject_modification();
create trigger source_document_locations_no_truncate before truncate on public.source_document_locations
  for each statement execute function public.nfai_reject_modification();
create trigger source_observations_no_truncate before truncate on public.source_observations
  for each statement execute function public.nfai_reject_modification();
create trigger source_archives_no_truncate before truncate on public.source_archives
  for each statement execute function public.nfai_reject_modification();
create trigger provenance_links_no_truncate before truncate on public.provenance_links
  for each statement execute function public.nfai_reject_modification();
create trigger supersessions_no_truncate before truncate on public.supersessions
  for each statement execute function public.nfai_reject_modification();
create trigger publication_events_no_truncate before truncate on public.publication_events
  for each statement execute function public.nfai_reject_modification();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.nfai_reject_modification();
create trigger fact_tables_no_truncate before truncate on public.fact_tables
  for each statement execute function public.nfai_reject_modification();
create trigger source_tiers_no_truncate before truncate on public.source_tiers
  for each statement execute function public.nfai_reject_modification();
create trigger publication_states_no_truncate before truncate on public.publication_states
  for each statement execute function public.nfai_reject_modification();
create trigger publication_state_transitions_no_truncate before truncate on public.publication_state_transitions
  for each statement execute function public.nfai_reject_modification();


-- ---------------------------------------------------------------------------
-- Attach the 0001/0002 fact tables
-- ---------------------------------------------------------------------------
-- For each table: the foreign key that makes publication_state part of the shared
-- vocabulary, then registration. Effective-dated tables register valid_to as the one
-- column that may still be set after review (NULL to a value, once), matching 0001's
-- nfai_guard_valid_to_close_once.
--
-- requires_provenance = false only for two tables whose rows are NFAI-defined
-- structure rather than externally sourced claims:
--   * capabilities: the vocabulary of capability types (values live in
--     model_capabilities, which require provenance);
--   * evaluation_configurations: reusable descriptions of evaluation conditions; the
--     source that disclosed a configuration is cited on the benchmark result that uses it.

do $$
declare
  v_table record;
begin
  for v_table in
    select * from (values
      ('providers', 'provider', true, '{}'::text[]),
      ('deployment_channels', 'deployment_channel', true, '{}'),
      ('model_families', 'model_family', true, '{}'),
      ('model_versions', 'model_version', true, '{}'),
      ('model_version_aliases', 'model_version_alias', true, '{valid_to}'),
      ('model_releases', 'model_release', true, '{}'),
      ('capabilities', 'capability_definition', false, '{}'),
      ('model_capabilities', 'model_capability', true, '{valid_to}'),
      ('benchmarks', 'benchmark', true, '{}'),
      ('benchmark_versions', 'benchmark_version', true, '{}'),
      ('benchmark_metrics', 'benchmark_metric', true, '{}'),
      ('evaluation_harnesses', 'evaluation_harness', true, '{}'),
      ('evaluation_harness_versions', 'evaluation_harness_version', true, '{}'),
      ('evaluation_configurations', 'evaluation_configuration', false, '{}'),
      ('benchmark_results', 'benchmark_result', true, '{}'),
      ('pricing_records', 'pricing_record', true, '{valid_to}')
    ) as t (table_name, fact_kind, requires_provenance, mutable_columns)
  loop
    execute pg_catalog.format(
      'alter table public.%I add constraint %I foreign key (publication_state) references public.publication_states (code) on delete restrict',
      v_table.table_name, v_table.table_name || '_publication_state_fkey');
    execute pg_catalog.format('create index %I on public.%I (publication_state)',
      v_table.table_name || '_publication_state_idx', v_table.table_name);
    perform public.nfai_register_fact_table(
      pg_catalog.format('public.%I', v_table.table_name)::regclass,
      v_table.fact_kind, v_table.requires_provenance, v_table.mutable_columns);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase's default
-- privileges also grant it to anon and authenticated. Revoke all three for every
-- function defined here so nothing is callable through the Data API until 0004 grants
-- it deliberately. Trigger functions fire regardless of EXECUTE privilege.

do $$
declare
  v_fn regprocedure;
  v_role text;
begin
  for v_fn in
    select p.oid::regprocedure
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nfai_setting', 'nfai_current_actor', 'nfai_reject_modification', 'nfai_touch_updated_at',
         'nfai_guard_source', 'nfai_guard_source_document', 'nfai_assert_fact_table', 'nfai_record_state',
         'nfai_assert_provenance', 'nfai_supersession_guard', 'nfai_supersession_mark_old',
         'nfai_audit_row_change', 'nfai_provenance_link_guard', 'nfai_provenance_link_recheck',
         'nfai_fact_lifecycle_guard', 'nfai_fact_log_event', 'nfai_fact_delete_draft_links',
         'nfai_fact_check_provenance', 'nfai_register_fact_table', 'nfai_transition', 'nfai_withdraw',
         'nfai_supersede', 'nfai_state_as_of', 'nfai_is_current_as_of'
       )
  loop
    execute pg_catalog.format('revoke execute on function %s from public', v_fn);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles r where r.rolname = v_role) then
        execute pg_catalog.format('revoke execute on function %s from %I', v_fn, v_role);
      end if;
    end loop;
  end loop;
end;
$$;
