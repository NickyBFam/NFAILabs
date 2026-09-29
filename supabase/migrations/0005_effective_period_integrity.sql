-- NFAI Labs, Phase 2 migration 0005: effective-period integrity (integration).
--
-- Owner: Phase 2 coordinator. Added during integration of 0001-0004; see
-- docs/DECISIONS.md D-029 and docs/DATABASE.md.
--
-- 0001/0002 define effective-dated series ([valid_from, valid_to)) and 0003 defines the
-- publication lifecycle, but neither prevents two PUBLISHED rows of the same series from
-- being in effect at the same moment. Without that, "the price (or capability, or alias
-- target) on date D" could be ambiguous. These exclusion constraints make it unambiguous:
--
--   * among published rows of one series, effective periods never overlap;
--   * a pinned identifier names at most one published row per channel.
--
-- Only rows in state 'published' (the only is_current state) take part. Drafts and
-- proposals may overlap freely, and superseded or withdrawn rows are history.
--
-- The constraints are DEFERRABLE INITIALLY DEFERRED, so one transaction can publish a
-- replacement and then supersede the old row (nfai_supersede), or publish a new price and
-- close the previous row's valid_to, in either order. They are checked at commit.
--
-- Nullable series-key columns are coalesced so that NULL ("not tiered", "not
-- region-specific", "applies to all channels") compares equal to itself.

create extension if not exists btree_gist with schema extensions;

alter table public.pricing_records
  add constraint pricing_records_published_period_excl
  exclude using gist (
    model_version_id with =,
    deployment_channel_id with =,
    billing_dimension with =,
    (coalesce(dimension_detail, '')) with =,
    service_tier with =,
    (coalesce(context_threshold_tokens, 0)) with =,
    (coalesce(region, '')) with =,
    currency with =,
    unit with =,
    unit_quantity with =,
    tstzrange(valid_from, valid_to, '[)') with &&
  )
  where (publication_state = 'published')
  deferrable initially deferred;

comment on constraint pricing_records_published_period_excl on public.pricing_records is
  'Published prices of one series never overlap in effect, so the price at any date is unique.';

alter table public.model_capabilities
  add constraint model_capabilities_published_period_excl
  exclude using gist (
    model_version_id with =,
    capability_id with =,
    (coalesce(deployment_channel_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    tstzrange(valid_from, valid_to, '[)') with &&
  )
  where (publication_state = 'published')
  deferrable initially deferred;

comment on constraint model_capabilities_published_period_excl on public.model_capabilities is
  'Published values of one capability for one version (and channel scope) never overlap in effect.';

alter table public.model_version_aliases
  add constraint model_version_aliases_published_rolling_excl
  exclude using gist (
    deployment_channel_id with =,
    alias with =,
    tstzrange(valid_from, valid_to, '[)') with &&
  )
  where (publication_state = 'published' and alias_kind = 'rolling_alias')
  deferrable initially deferred;

comment on constraint model_version_aliases_published_rolling_excl on public.model_version_aliases is
  'A rolling alias points to exactly one exact version at any moment on a channel.';

alter table public.model_version_aliases
  add constraint model_version_aliases_published_pinned_excl
  exclude using gist (
    deployment_channel_id with =,
    alias with =
  )
  where (publication_state = 'published' and alias_kind = 'pinned_identifier')
  deferrable initially deferred;

comment on constraint model_version_aliases_published_pinned_excl on public.model_version_aliases is
  'A pinned identifier identifies at most one published exact version on a channel.';
