-- NFAI Labs, Phase 2: core catalog schema.
--
-- Owns: providers, deployment channels, model families, exact model versions,
-- model identifiers/aliases, release and lifecycle events, capability definitions,
-- and model capabilities. Measurements and pricing live in 0002. Sources, provenance
-- links, supersession/correction records and audit history live in 0003. RLS and
-- grants live in 0004. Conventions: docs/DATABASE.md.
--
-- Choices specific to the Phase 2A tables:
--   * Identity: `id uuid` is the durable identity. Slugs are routing labels only:
--     unique within their scope, format-checked, editable, and never referenced.
--   * Deletes: every foreign key is ON DELETE RESTRICT; nothing cascades.
--   * Publication lifecycle: every table has `publication_state text not null default
--     'draft'`. 0003 adds the foreign key to public.publication_states and registers
--     the tables (nfai_register_fact_table), which enforces state transitions, freezes
--     reviewed content, blocks deletion past draft, and requires provenance before a
--     record is validated or published. This migration therefore adds no status check.
--   * History: a change in the world (a new price, an alias moving, a capability
--     changing) is a new row with its own effective period; a mistake is corrected by
--     supersession (0003). Rows are never overwritten.
--   * Effective dating: half-open [valid_from, valid_to) timestamptz intervals;
--     valid_to NULL means still in effect. Once a row is past review, valid_to may only
--     be set once, from NULL to a value (nfai_guard_valid_to_close_once).
--   * Unknown values are NULL or an explicit 'undisclosed'/'unknown' value. Nothing is
--     defaulted to a guess.
--
-- This migration contains structure only. It inserts no data.

-- ---------------------------------------------------------------------------
-- Shared helper functions
-- ---------------------------------------------------------------------------

create function public.nfai_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.nfai_set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at.';

-- On effective-dated tables, closing an open interval is the one change allowed to a
-- reviewed row (it is how a successor record takes over). Once valid_to is set it is
-- final; correcting it goes through supersession. Draft and extracted rows are still
-- editable proposals, so they are exempt.
create function public.nfai_guard_valid_to_close_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publication_state not in ('draft', 'extracted')
     and old.valid_to is not null
     and new.valid_to is distinct from old.valid_to then
    raise exception '%.% row %: valid_to is already set and cannot change (supersede the record instead)',
      tg_table_schema, tg_table_name, old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.nfai_guard_valid_to_close_once() is
  'BEFORE UPDATE OF valid_to trigger: after review, valid_to may go from NULL to a value once and never change again.';

-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  legal_name text,
  organization_type text,
  website_url text,
  description text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_slug_key unique (slug),
  constraint providers_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  constraint providers_name_check check (length(btrim(name)) > 0),
  constraint providers_organization_type_check check (
    organization_type in ('company', 'research_lab', 'nonprofit', 'academic', 'community', 'government', 'other')
  ),
  constraint providers_website_url_check check (website_url ~ '^https?://')
);

comment on table public.providers is
  'Organizations that develop and/or serve AI models. A provider never holds benchmark results, prices, or capabilities directly.';
comment on column public.providers.organization_type is 'NULL means not yet recorded.';
comment on column public.providers.description is 'NFAI''s own short summary; never copied provider text.';

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- deployment_channels
-- ---------------------------------------------------------------------------

create table public.deployment_channels (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  slug text not null,
  name text not null,
  channel_type text not null,
  description text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deployment_channels_provider_id_slug_key unique (provider_id, slug),
  constraint deployment_channels_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  constraint deployment_channels_name_check check (length(btrim(name)) > 0),
  constraint deployment_channels_channel_type_check check (
    channel_type in ('first_party_api', 'cloud_platform', 'inference_host', 'consumer_app', 'open_weights_distribution', 'other')
  )
);

comment on table public.deployment_channels is
  'A way models are made available, operated by the serving provider (which may differ from the developing provider). Identifiers, releases, prices and per-channel capabilities are scoped to a channel.';
comment on column public.deployment_channels.provider_id is 'The serving/operating provider.';

create index deployment_channels_provider_id_idx on public.deployment_channels (provider_id);

create trigger deployment_channels_set_updated_at
  before update on public.deployment_channels
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- model_families
-- ---------------------------------------------------------------------------

create table public.model_families (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  slug text not null,
  name text not null,
  description text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_families_provider_id_slug_key unique (provider_id, slug),
  constraint model_families_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  constraint model_families_name_check check (length(btrim(name)) > 0)
);

comment on table public.model_families is
  'A navigational grouping of related model versions from one developing provider. Never holds results, prices, or capabilities.';
comment on column public.model_families.provider_id is 'The developing provider. Should be frozen after review (0003 registration).';

create index model_families_provider_id_idx on public.model_families (provider_id);

create trigger model_families_set_updated_at
  before update on public.model_families
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- model_versions
-- ---------------------------------------------------------------------------

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  model_family_id uuid not null references public.model_families (id) on delete restrict,
  slug text not null,
  display_name text not null,
  version_label text,
  snapshot_date date,
  base_model_version_id uuid references public.model_versions (id) on delete restrict,
  description text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_versions_model_family_id_slug_key unique (model_family_id, slug),
  constraint model_versions_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  constraint model_versions_display_name_check check (length(btrim(display_name)) > 0),
  constraint model_versions_base_model_version_id_check check (base_model_version_id <> id)
);

comment on table public.model_versions is
  'An exact, identifiable model artifact (a specific version or snapshot). The only unit to which benchmark results, prices, and capabilities attach. The developing provider is reached through the family. Rolling "latest" names are aliases (model_version_aliases), never versions.';
comment on column public.model_versions.version_label is
  'The provider''s own version string, stored verbatim. No naming scheme is assumed.';
comment on column public.model_versions.snapshot_date is
  'Date that identifies a dated snapshot when the provider uses one. NULL when not applicable or unknown.';
comment on column public.model_versions.base_model_version_id is
  'For derived models (fine-tunes, distillations, re-releases treated as separate versions): the exact version they derive from.';

create index model_versions_model_family_id_idx on public.model_versions (model_family_id);
create index model_versions_base_model_version_id_idx on public.model_versions (base_model_version_id)
  where base_model_version_id is not null;

create trigger model_versions_set_updated_at
  before update on public.model_versions
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- model_version_aliases
-- ---------------------------------------------------------------------------

create table public.model_version_aliases (
  id uuid primary key default gen_random_uuid(),
  deployment_channel_id uuid not null references public.deployment_channels (id) on delete restrict,
  alias text not null,
  alias_kind text not null,
  model_version_id uuid not null references public.model_versions (id) on delete restrict,
  valid_from timestamptz,
  valid_to timestamptz,
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_version_aliases_alias_check check (length(alias) > 0 and alias = btrim(alias)),
  constraint model_version_aliases_alias_kind_check check (alias_kind in ('pinned_identifier', 'rolling_alias')),
  constraint model_version_aliases_valid_from_check check (alias_kind <> 'rolling_alias' or valid_from is not null),
  constraint model_version_aliases_valid_to_check check (valid_to is null or (valid_from is not null and valid_to > valid_from))
);

comment on table public.model_version_aliases is
  'Strings that identify a model version on a channel. pinned_identifier: a permanent identifier of one exact version (for example an API model ID or an open-weights repository name). rolling_alias: one row per assignment of a moving name to an exact version over [valid_from, valid_to).';
comment on column public.model_version_aliases.valid_from is
  'Required for rolling aliases. For pinned identifiers, when the identifier became available; NULL means unknown.';

create index model_version_aliases_lookup_idx
  on public.model_version_aliases (deployment_channel_id, alias, valid_from desc);
create index model_version_aliases_model_version_id_idx on public.model_version_aliases (model_version_id);

-- A string is either a pinned identifier or a rolling alias on a channel, never both.
create function public.nfai_check_alias_kind_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.model_version_aliases a
    where a.deployment_channel_id = new.deployment_channel_id
      and a.alias = new.alias
      and a.alias_kind <> new.alias_kind
      and a.id <> new.id
      and a.publication_state not in ('rejected', 'superseded', 'withdrawn')
  ) then
    raise exception 'alias % on channel % is already recorded with a different alias_kind',
      new.alias, new.deployment_channel_id
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger model_version_aliases_check_kind
  before insert or update of alias, alias_kind, deployment_channel_id on public.model_version_aliases
  for each row execute function public.nfai_check_alias_kind_consistency();
create trigger model_version_aliases_valid_to_close_once
  before update of valid_to on public.model_version_aliases
  for each row execute function public.nfai_guard_valid_to_close_once();
create trigger model_version_aliases_set_updated_at
  before update on public.model_version_aliases
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- model_releases (lifecycle events)
-- ---------------------------------------------------------------------------

create table public.model_releases (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions (id) on delete restrict,
  deployment_channel_id uuid references public.deployment_channels (id) on delete restrict,
  lifecycle_stage text not null,
  announced_on date,
  effective_on date,
  date_precision text not null default 'day',
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_releases_lifecycle_stage_check check (
    lifecycle_stage in ('announced', 'preview', 'limited_availability', 'general_availability', 'deprecated', 'retired')
  ),
  constraint model_releases_date_check check (announced_on is not null or effective_on is not null),
  constraint model_releases_date_precision_check check (date_precision in ('day', 'month', 'year'))
);

comment on table public.model_releases is
  'Append-only lifecycle events for an exact model version, optionally per channel (announced, preview, limited availability, GA, deprecated, retired). A version''s stage on date D is its latest published event effective on or before D. A scheduled deprecation or retirement is an event with a future effective_on.';
comment on column public.model_releases.deployment_channel_id is 'NULL means the event applies to the version as a whole, not to one channel.';
comment on column public.model_releases.announced_on is 'When the event was announced (DATA_SOURCES.md §4: announced vs effective dates).';
comment on column public.model_releases.effective_on is 'When the event takes or took effect. NULL when only the announcement date is known.';
comment on column public.model_releases.date_precision is 'Precision of both dates. Month or year precision stores the first day of the period.';

create index model_releases_model_version_id_idx on public.model_releases (model_version_id, effective_on desc);
create index model_releases_deployment_channel_id_idx
  on public.model_releases (deployment_channel_id) where deployment_channel_id is not null;

create trigger model_releases_set_updated_at
  before update on public.model_releases
  for each row execute function public.nfai_set_updated_at();

-- ---------------------------------------------------------------------------
-- capabilities (vocabulary) and model_capabilities (facts)
-- ---------------------------------------------------------------------------

create table public.capabilities (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  category text not null,
  value_type text not null,
  unit text,
  allowed_values text[],
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capabilities_key_key unique (key),
  constraint capabilities_key_check check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and length(key) <= 100),
  constraint capabilities_name_check check (length(btrim(name)) > 0),
  constraint capabilities_category_check check (
    category in ('input_modality', 'output_modality', 'limit', 'feature', 'deployment', 'metadata', 'other')
  ),
  constraint capabilities_value_type_check check (value_type in ('boolean', 'integer', 'numeric', 'text', 'enum', 'date')),
  constraint capabilities_allowed_values_check check (
    (value_type = 'enum') = (allowed_values is not null and cardinality(allowed_values) > 0)
  )
);

comment on table public.capabilities is
  'Vocabulary of capability types (for example an input modality or an output-length limit). Definitions only; values live in model_capabilities. Rows are added through review, not seeded as facts.';
comment on column public.capabilities.unit is 'Unit of numeric values, for example tokens. NULL for unitless types.';

create trigger capabilities_set_updated_at
  before update on public.capabilities
  for each row execute function public.nfai_set_updated_at();

create table public.model_capabilities (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions (id) on delete restrict,
  capability_id uuid not null references public.capabilities (id) on delete restrict,
  deployment_channel_id uuid references public.deployment_channels (id) on delete restrict,
  value_boolean boolean,
  value_integer bigint,
  value_numeric numeric,
  value_text text,
  value_date date,
  valid_from timestamptz not null,
  valid_to timestamptz,
  notes text,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_capabilities_value_check check (
    num_nonnulls(value_boolean, value_integer, value_numeric, value_text, value_date) = 1
  ),
  constraint model_capabilities_valid_to_check check (valid_to is null or valid_to > valid_from)
);

comment on table public.model_capabilities is
  'Append-only, effective-dated capability values for an exact model version, optionally per channel. A missing row means unknown, not unsupported; unsupported is an explicit false or 0 value. A change is a new row; the previous row''s valid_to is closed.';
comment on column public.model_capabilities.deployment_channel_id is
  'NULL means the value applies to the version generally; a channel-specific row is more specific.';

create index model_capabilities_lookup_idx
  on public.model_capabilities (model_version_id, capability_id, deployment_channel_id, valid_from desc);
create index model_capabilities_capability_id_idx on public.model_capabilities (capability_id);
create index model_capabilities_deployment_channel_id_idx
  on public.model_capabilities (deployment_channel_id) where deployment_channel_id is not null;

-- The value column used must match the capability's value_type, and enum values must be
-- allowed. A CHECK constraint cannot read another table, so a trigger enforces it.
create function public.nfai_check_model_capability_value()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap_value_type text;
  cap_allowed_values text[];
begin
  select c.value_type, c.allowed_values into cap_value_type, cap_allowed_values
  from public.capabilities c
  where c.id = new.capability_id;

  if not (
       (cap_value_type = 'boolean' and new.value_boolean is not null)
    or (cap_value_type = 'integer' and new.value_integer is not null)
    or (cap_value_type = 'numeric' and new.value_numeric is not null)
    or (cap_value_type = 'text' and new.value_text is not null)
    or (cap_value_type = 'date' and new.value_date is not null)
    or (cap_value_type = 'enum' and new.value_text = any (cap_allowed_values))
  ) then
    raise exception 'model_capabilities value does not match capability value_type % (allowed values: %)',
      cap_value_type, cap_allowed_values
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger model_capabilities_check_value
  before insert or update on public.model_capabilities
  for each row execute function public.nfai_check_model_capability_value();
create trigger model_capabilities_valid_to_close_once
  before update of valid_to on public.model_capabilities
  for each row execute function public.nfai_guard_valid_to_close_once();
create trigger model_capabilities_set_updated_at
  before update on public.model_capabilities
  for each row execute function public.nfai_set_updated_at();
