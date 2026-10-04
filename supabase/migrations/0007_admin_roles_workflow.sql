-- =============================================================================
-- NFAI Labs, Phase 3 migration 0007: admin roles, permissions and review workflow
-- =============================================================================
--
-- Owner: Phase 3 Thread B (roles, permissions, approval workflow). Contract:
-- docs/ADMIN.md sections 4 to 6. Conventions: docs/DATABASE.md.
-- Depends on 0003 (lifecycle, publication_events, audit_log, nfai_transition,
-- nfai_supersede, nfai_withdraw), 0004 (grants, RLS, nfai_security_audit) and 0006
-- (admin_identities, nfai_admin_current_identity, nfai_admin_require_permission and the
-- fail-closed nfai_admin_has_permission stubs this migration replaces).
--
-- Model:
--
--   * Permissions are what code checks; roles are bundles of permissions. Both are
--     vocabulary tables changed only by migrations. A person may hold several roles.
--   * admin_role_assignments is append-only: a role is granted with a reason and later
--     revoked once, with a reason. Nothing is deleted, so "who could publish on date D"
--     stays answerable. Status (0006) and assignments are read on every call, so
--     disabling a person or revoking a role applies to their next request, whatever
--     their JWT still says.
--   * fact_approval_policies gives every registered fact table an approval class:
--       standard  - one person holding the permissions may validate and publish, even
--                   a draft they wrote;
--       separated - the publisher must differ from the validator of the current review
--                   cycle AND from everyone who created or edited the row's content
--                   (audit_log), so at least two people are involved.
--     A missing policy is treated as separated (fail closed) and reported by
--     nfai_security_audit().
--   * workflow_actions is the append-only log of human workflow decisions (submit,
--     recall, validate, return to draft, publish, reject, supersede, withdraw, close
--     period). "Submitted" is not a publication state: a draft is submitted while its
--     latest submit is not followed by a recall, return, validation or rejection.
--     extracted rows count as submitted. While submitted, a draft cannot be edited.
--   * All human writes go through the SECURITY DEFINER nfai_admin_* functions below,
--     called with the signed-in user's own JWT as `authenticated`. Each derives the
--     actor from auth.uid() only (never an argument), checks identity, status and
--     permission in SQL, overwrites nfai.actor_* and calls the Phase 2 primitives.
--   * A guard trigger on every registered fact table refuses any publication_state
--     change other than draft <-> extracted when the statement runs as an API role
--     (anon, authenticated, service_role). Inside the definer functions current_user is
--     the function owner, so only they (and migrations / the synthetic seed, which run
--     as the owner) can validate, publish, reject, supersede or withdraw.
--   * Admin reads use SECURITY DEFINER read functions gated on view_admin / view_audit /
--     manage_admins, returning explicit columns. D-030 stays: API roles still have no
--     direct access to internal tables or unpublished rows.
--
-- Error codes: NFA01 not an admin, NFA02 disabled, NFA03 missing permission (0006),
-- NFA04 separation of duties, NFA05 workflow precondition, 22023 invalid input,
-- P0002 record not found. Phase 2 errors (23514 lifecycle / provenance) pass through.
--
-- This migration inserts vocabulary and policy rows only; no people, no facts.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permission and role vocabulary
-- -----------------------------------------------------------------------------

create table public.admin_permissions (
  code text primary key,
  description text not null,
  created_at timestamptz not null default now(),
  constraint admin_permissions_code_check check (code ~ '^[a-z][a-z_]*$')
);

comment on table public.admin_permissions is
  'Admin permission vocabulary (docs/ADMIN.md §4). Code and SQL check permissions, never role names. Changed only by migrations.';

insert into public.admin_permissions (code, description) values
  ('view_admin', 'Enter the admin area; read records, review queues and provenance.'),
  ('edit_draft', 'Create and edit drafts, delete never-reviewed drafts, create sources, documents and observations, attach and revoke provenance.'),
  ('submit_review', 'Submit a draft for review and recall the submission.'),
  ('validate_fact', 'Move a submitted draft or extracted row to validated; send a validated row back to draft.'),
  ('reject_fact', 'Reject a submitted draft, extracted or validated row, with a reason.'),
  ('publish_fact', 'Publish a validated row; approve or retire sources; close the effective period of a published row.'),
  ('supersede_fact', 'Correct a published row by publishing a replacement that supersedes it.'),
  ('withdraw_fact', 'Withdraw a published row without replacement, with a reason.'),
  ('view_audit', 'Read the audit log, publication events and workflow history.'),
  ('manage_admins', 'Create and disable admin identities; grant and revoke roles.');

create table public.admin_roles (
  code text primary key,
  label text not null,
  description text not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  constraint admin_roles_code_check check (code ~ '^[a-z][a-z_]*$'),
  constraint admin_roles_sort_order_key unique (sort_order)
);

comment on table public.admin_roles is
  'Admin roles: named bundles of permissions (docs/ADMIN.md §4). Changed only by migrations.';

insert into public.admin_roles (code, label, description, sort_order) values
  ('viewer', 'Viewer', 'Reads the admin area.', 10),
  ('editor', 'Editor', 'Enters drafts with their sources and submits them for review.', 20),
  ('reviewer', 'Reviewer', 'Checks submitted records against their sources: validates, rejects or sends back.', 30),
  ('publisher', 'Publisher', 'Approves validated records into the public record; corrects and withdraws published ones.', 40),
  ('administrator', 'Administrator', 'Manages admin identities and roles. Does not edit or publish facts.', 50);

create table public.admin_role_permissions (
  role_code text not null references public.admin_roles (code) on delete restrict,
  permission_code text not null references public.admin_permissions (code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_code, permission_code)
);

comment on table public.admin_role_permissions is
  'Which permissions each role grants (the docs/ADMIN.md §4 matrix). Changed only by migrations.';

create index admin_role_permissions_permission_code_idx on public.admin_role_permissions (permission_code);

insert into public.admin_role_permissions (role_code, permission_code) values
  ('viewer', 'view_admin'),
  ('editor', 'view_admin'),
  ('editor', 'edit_draft'),
  ('editor', 'submit_review'),
  ('reviewer', 'view_admin'),
  ('reviewer', 'validate_fact'),
  ('reviewer', 'reject_fact'),
  ('reviewer', 'view_audit'),
  ('publisher', 'view_admin'),
  ('publisher', 'reject_fact'),
  ('publisher', 'publish_fact'),
  ('publisher', 'supersede_fact'),
  ('publisher', 'withdraw_fact'),
  ('publisher', 'view_audit'),
  ('administrator', 'view_admin'),
  ('administrator', 'view_audit'),
  ('administrator', 'manage_admins');

create trigger admin_permissions_immutable
  before update or delete on public.admin_permissions
  for each row execute function public.nfai_reject_modification();
create trigger admin_roles_immutable
  before update or delete on public.admin_roles
  for each row execute function public.nfai_reject_modification();
create trigger admin_role_permissions_immutable
  before update or delete on public.admin_role_permissions
  for each row execute function public.nfai_reject_modification();


-- -----------------------------------------------------------------------------
-- 2. Role assignments (append-only, revocable once)
-- -----------------------------------------------------------------------------

create table public.admin_role_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_identities (id) on delete restrict,
  role_code text not null references public.admin_roles (code) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.admin_identities (id) on delete restrict,
  grant_reason text not null,
  revoked_at timestamptz,
  revoked_by uuid references public.admin_identities (id) on delete restrict,
  revoke_reason text,
  created_at timestamptz not null default now(),
  constraint admin_role_assignments_grant_reason_check check (
    length(btrim(grant_reason)) between 1 and 1000
  ),
  constraint admin_role_assignments_revoked_check check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and length(btrim(revoke_reason)) between 1 and 1000)
  ),
  constraint admin_role_assignments_self_grant_check check (granted_by is distinct from admin_id),
  constraint admin_role_assignments_self_revoke_check check (revoked_by is distinct from admin_id)
);

comment on table public.admin_role_assignments is
  'Append-only history of role grants. Active = revoked_at is null. A grant is revoked once and never deleted, so past authority stays auditable. granted_by is null only for the owner''s SQL bootstrap. Nobody grants or revokes their own roles.';

create unique index admin_role_assignments_active_key
  on public.admin_role_assignments (admin_id, role_code)
  where revoked_at is null;
create index admin_role_assignments_admin_id_idx on public.admin_role_assignments (admin_id, granted_at);
create index admin_role_assignments_role_code_idx on public.admin_role_assignments (role_code);
create index admin_role_assignments_granted_by_idx on public.admin_role_assignments (granted_by)
  where granted_by is not null;
create index admin_role_assignments_revoked_by_idx on public.admin_role_assignments (revoked_by)
  where revoked_by is not null;

create function public.nfai_admin_role_assignment_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'role assignments are never deleted; revoke them instead'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.revoked_at is not null then
      raise exception 'role assignments cannot be created already revoked' using errcode = 'check_violation';
    end if;
    new.granted_at := now();
    new.created_at := new.granted_at;
    return new;
  end if;

  -- UPDATE: a single revocation, nothing else.
  if old.revoked_at is not null then
    raise exception 'role assignment % is revoked and immutable', old.id using errcode = 'check_violation';
  end if;
  if new.revoked_at is null
     or (pg_catalog.to_jsonb(new) - 'revoked_at' - 'revoked_by' - 'revoke_reason')
        is distinct from (pg_catalog.to_jsonb(old) - 'revoked_at' - 'revoked_by' - 'revoke_reason') then
    raise exception 'role assignments are immutable; the only permitted change is revocation'
      using errcode = 'check_violation';
  end if;
  new.revoked_at := now();
  return new;
end;
$$;

comment on function public.nfai_admin_role_assignment_guard() is
  'BEFORE INSERT/UPDATE/DELETE on admin_role_assignments: server-stamped times, one-time revocation, no deletion.';

create trigger admin_role_assignments_guard
  before insert or update or delete on public.admin_role_assignments
  for each row execute function public.nfai_admin_role_assignment_guard();
create trigger admin_role_assignments_audit
  after insert or update or delete on public.admin_role_assignments
  for each row execute function public.nfai_audit_row_change();


-- -----------------------------------------------------------------------------
-- 3. Permission checks (replace the 0006 fail-closed stubs)
-- -----------------------------------------------------------------------------

create or replace function public.nfai_admin_has_permission(p_admin_id uuid, p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_identities i
      join public.admin_role_assignments a on a.admin_id = i.id and a.revoked_at is null
      join public.admin_role_permissions rp on rp.role_code = a.role_code
     where i.id = p_admin_id
       and i.status = 'active'
       and rp.permission_code = p_permission
  );
$$;

comment on function public.nfai_admin_has_permission(uuid, text) is
  'True when the admin identity is active and holds the permission through an unrevoked role assignment. False for unknown or disabled identities.';

create or replace function public.nfai_admin_has_permission(p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null and public.nfai_admin_has_permission(auth.uid(), p_permission);
$$;

comment on function public.nfai_admin_has_permission(text) is
  'True when the caller (auth.uid()) is an active admin holding the permission.';

-- Effective permissions and roles of an identity (empty when disabled).
create function public.nfai_admin_effective_permissions(p_admin_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct rp.permission_code order by rp.permission_code), '{}')
    from public.admin_identities i
    join public.admin_role_assignments a on a.admin_id = i.id and a.revoked_at is null
    join public.admin_role_permissions rp on rp.role_code = a.role_code
   where i.id = p_admin_id and i.status = 'active';
$$;

create function public.nfai_admin_active_roles(p_admin_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(a.role_code order by r.sort_order), '{}')
    from public.admin_role_assignments a
    join public.admin_roles r on r.code = a.role_code
   where a.admin_id = p_admin_id and a.revoked_at is null;
$$;


-- -----------------------------------------------------------------------------
-- 4. Approval policies (D-031)
-- -----------------------------------------------------------------------------

create table public.fact_approval_policies (
  table_name text primary key references public.fact_tables (table_name) on delete restrict,
  approval_class text not null,
  rationale text not null,
  created_at timestamptz not null default now(),
  constraint fact_approval_policies_approval_class_check check (approval_class in ('standard', 'separated')),
  constraint fact_approval_policies_rationale_check check (length(btrim(rationale)) > 0)
);

comment on table public.fact_approval_policies is
  'Approval class per registered fact table (docs/ADMIN.md §6). standard: one qualified person may validate and publish. separated: the publisher differs from the validator and from every content author. Missing policy = separated. Changed only by migrations with a recorded decision.';

insert into public.fact_approval_policies (table_name, approval_class, rationale) values
  ('public.providers', 'standard', 'Catalog identity; low direct impact on derived scores.'),
  ('public.deployment_channels', 'standard', 'Catalog identity; low direct impact on derived scores.'),
  ('public.model_families', 'standard', 'Grouping only; no measurements attach to families (D-003).'),
  ('public.model_versions', 'standard', 'Catalog identity; values that affect scores live in separated tables.'),
  ('public.model_version_aliases', 'standard', 'Naming and routing facts.'),
  ('public.model_releases', 'standard', 'Lifecycle events.'),
  ('public.capabilities', 'standard', 'NFAI-defined capability vocabulary.'),
  ('public.model_capabilities', 'separated', 'Methodology-relevant capability values that feed comparisons and future derived scores.'),
  ('public.benchmarks', 'standard', 'Benchmark identity.'),
  ('public.benchmark_versions', 'separated', 'Version definitions decide comparability of every result (METHODOLOGY.md §5).'),
  ('public.benchmark_metrics', 'separated', 'Metric direction and units drive ranking inputs.'),
  ('public.evaluation_harnesses', 'standard', 'Harness identity.'),
  ('public.evaluation_harness_versions', 'standard', 'Harness version identity.'),
  ('public.evaluation_configurations', 'separated', 'Evaluation conditions decide comparability of results (METHODOLOGY.md §6).'),
  ('public.benchmark_results', 'separated', 'Measurements: primary ranking inputs.'),
  ('public.pricing_records', 'separated', 'Prices: value rankings and cost calculations.');

create trigger fact_approval_policies_immutable
  before update or delete on public.fact_approval_policies
  for each row execute function public.nfai_reject_modification();
create trigger fact_approval_policies_audit
  after insert on public.fact_approval_policies
  for each row execute function public.nfai_audit_row_change();

create function public.nfai_admin_approval_class(p_table text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select p.approval_class from public.fact_approval_policies p where p.table_name = p_table),
    'separated'
  );
$$;

comment on function public.nfai_admin_approval_class(text) is
  'Approval class of a fact table; separated when no policy row exists (fail closed).';


-- -----------------------------------------------------------------------------
-- 5. workflow_actions: append-only log of human workflow decisions
-- -----------------------------------------------------------------------------

create table public.workflow_actions (
  id bigint generated always as identity primary key,
  subject_table text not null references public.fact_tables (table_name) on delete restrict,
  record_id uuid not null,
  action text not null,
  from_state text references public.publication_states (code) on delete restrict,
  to_state text references public.publication_states (code) on delete restrict,
  actor_id uuid not null references public.admin_identities (id) on delete restrict,
  reason text,
  reason_code text,
  cycle integer not null,
  transaction_id bigint not null default pg_catalog.txid_current(),
  occurred_at timestamptz not null default now(),
  constraint workflow_actions_action_check check (action in (
    'submit', 'recall', 'validate', 'return_to_draft', 'publish', 'reject',
    'supersede', 'withdraw', 'close_period'
  )),
  constraint workflow_actions_reason_check check (reason is null or length(reason) <= 2000),
  constraint workflow_actions_cycle_check check (cycle >= 1)
);

comment on table public.workflow_actions is
  'INTERNAL. Append-only log of human workflow decisions, one row per decision, attributed to an admin identity. Together with publication_events (state changes) and audit_log (row images) it answers who submitted, validated, approved, rejected or withdrew what, when and why. cycle is the review cycle (1, +1 after each recall or return to draft).';

create index workflow_actions_record_idx on public.workflow_actions (subject_table, record_id, id);
create index workflow_actions_actor_id_idx on public.workflow_actions (actor_id, occurred_at);
create index workflow_actions_occurred_at_idx on public.workflow_actions (occurred_at);

create trigger workflow_actions_append_only
  before update or delete on public.workflow_actions
  for each row execute function public.nfai_reject_modification();

-- Stamp time and transaction on the server whatever the insert said.
create function public.nfai_admin_workflow_action_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.occurred_at := now();
  new.transaction_id := pg_catalog.txid_current();
  return new;
end;
$$;

create trigger workflow_actions_stamp
  before insert on public.workflow_actions
  for each row execute function public.nfai_admin_workflow_action_stamp();


-- -----------------------------------------------------------------------------
-- 6. Publication-state guard on every registered fact table
-- -----------------------------------------------------------------------------
-- API roles (anon, authenticated, service_role) may not change publication_state,
-- except moving an unreviewed row between draft and extracted. The nfai_admin_*
-- workflow functions run as their owner, as do migrations and the synthetic seed.

create function public.nfai_admin_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.publication_state is not distinct from old.publication_state then
    return new;
  end if;
  if current_user in ('anon', 'authenticated', 'service_role')
     and not (old.publication_state in ('draft', 'extracted') and new.publication_state in ('draft', 'extracted')) then
    raise exception 'publication_state changes (% to %) go through the admin workflow functions',
      old.publication_state, new.publication_state
      using errcode = 'NFA05';
  end if;
  return new;
end;
$$;

comment on function public.nfai_admin_state_guard() is
  'BEFORE UPDATE OF publication_state on every registered fact table: API roles may only move rows between draft and extracted; review decisions go through the nfai_admin_* functions (D-011, docs/ADMIN.md §5).';

do $$
declare
  v_table text;
begin
  for v_table in select f.table_name from public.fact_tables f order by f.table_name loop
    execute pg_catalog.format(
      'create trigger nfai_admin_state_guard before update of publication_state on %s
         for each row execute function public.nfai_admin_state_guard()', v_table);
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7. Internal helpers (not executable by any API role)
-- -----------------------------------------------------------------------------

-- A registered fact table name, or 22023.
create function public.nfai_admin_fact_table(p_table text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_table is null or not exists (select 1 from public.fact_tables f where f.table_name = p_table) then
    raise exception 'unknown fact table %', coalesce(p_table, 'null') using errcode = '22023';
  end if;
  return p_table;
end;
$$;

-- Tables the generic admin read functions accept: fact tables plus the source registry.
create function public.nfai_admin_readable_table(p_table text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_table in ('public.sources', 'public.source_documents', 'public.source_observations') then
    return p_table;
  end if;
  return public.nfai_admin_fact_table(p_table);
end;
$$;

-- Validates the keys of a jsonb value object against a table's columns and returns the
-- column names to write. Keys must be real, writable columns; never id, timestamps,
-- publication_state, actor columns (*_by) or anything in p_deny; and, when p_allow is
-- given, only those columns. Anything else is 22023, so a caller can never smuggle a
-- protected column through.
create function public.nfai_admin_value_columns(p_table text, p_values jsonb, p_deny text[], p_allow text[] default null)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rel regclass := p_table::regclass;
  v_key text;
  v_cols text[] := '{}';
begin
  if p_values is null or pg_catalog.jsonb_typeof(p_values) <> 'object' then
    raise exception 'values must be a JSON object' using errcode = '22023';
  end if;
  for v_key in select k from pg_catalog.jsonb_object_keys(p_values) as k order by k loop
    if v_key in ('id', 'publication_state', 'created_at', 'updated_at')
       or v_key ~ '_by$'
       or v_key = any (coalesce(p_deny, '{}'))
       or (p_allow is not null and not v_key = any (p_allow))
       or not exists (
         select 1 from pg_catalog.pg_attribute a
          where a.attrelid = v_rel and a.attname = v_key and a.attnum > 0 and not a.attisdropped
            and a.attgenerated = '' and a.attidentity = ''
       ) then
      raise exception 'field % cannot be set on %', v_key, p_table using errcode = '22023';
    end if;
    v_cols := v_cols || v_key;
  end loop;
  return v_cols;
end;
$$;

create function public.nfai_admin_column_list(p_cols text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.string_agg(pg_catalog.format('%I', u.c), ', ' order by u.o)
    from pg_catalog.unnest(p_cols) with ordinality as u (c, o);
$$;

-- Inserts one row from a jsonb object into p_table (columns already validated).
create function public.nfai_admin_insert_row(p_table text, p_cols text[], p_values jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_list text := public.nfai_admin_column_list(p_cols);
  v_id uuid;
begin
  if v_list is null then
    execute pg_catalog.format('insert into %s default values returning id', p_table::regclass) into v_id;
  else
    execute pg_catalog.format(
      'insert into %1$s (%2$s) select %2$s from pg_catalog.jsonb_populate_record(null::%1$s, $1) returning id',
      p_table::regclass, v_list)
      into v_id using p_values;
  end if;
  return v_id;
end;
$$;

-- Current publication_state of a fact row, or P0002.
create function public.nfai_admin_state_of(p_table text, p_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_state text;
begin
  v_state := public.nfai_record_state(public.nfai_admin_fact_table(p_table), p_id);
  if v_state is null then
    raise exception '%(%) not found', p_table, p_id using errcode = 'P0002';
  end if;
  return v_state;
end;
$$;

create function public.nfai_admin_require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 2000 then
    raise exception 'a reason (1 to 2000 characters) is required' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

create function public.nfai_admin_optional_note(p_note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'a note may be at most 2000 characters' using errcode = '22023';
  end if;
  return nullif(btrim(p_note), '');
end;
$$;

create function public.nfai_admin_require_reason_code(p_reason_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason_code is null or p_reason_code not in (
    'error_correction', 'source_retracted', 'source_changed', 'methodology_invalidated',
    'duplicate', 'insufficient_evidence', 'out_of_scope', 'other'
  ) then
    raise exception 'unknown reason code %', coalesce(p_reason_code, 'null') using errcode = '22023';
  end if;
  return p_reason_code;
end;
$$;

-- Latest review-cycle decision for a record (submit, recall, return, validate, reject).
create function public.nfai_admin_last_review_action(p_table text, p_id uuid)
returns setof public.workflow_actions
language sql
stable
set search_path = ''
as $$
  select w.*
    from public.workflow_actions w
   where w.subject_table = p_table and w.record_id = p_id
     and w.action in ('submit', 'recall', 'return_to_draft', 'validate', 'reject')
   order by w.id desc
   limit 1;
$$;

-- A draft is submitted while its latest review decision is a submit.
create function public.nfai_admin_is_submitted(p_table text, p_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select l.action = 'submit' from public.nfai_admin_last_review_action(p_table, p_id) l), false);
$$;

create function public.nfai_admin_cycle(p_table text, p_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select 1 + pg_catalog.count(*)::integer
    from public.workflow_actions w
   where w.subject_table = p_table and w.record_id = p_id
     and w.action in ('recall', 'return_to_draft');
$$;

-- Who validated the row now in validated state (null if not validated through the workflow).
create function public.nfai_admin_validator(p_table text, p_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select l.actor_id from public.nfai_admin_last_review_action(p_table, p_id) l where l.action = 'validate';
$$;

-- Everyone who created or edited the row's content: audit_log INSERT, or UPDATE of any
-- column other than publication_state / updated_at.
create function public.nfai_admin_content_authors(p_table text, p_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct a.actor_id), '{}')
    from public.audit_log a
   where a.table_name = p_table
     and a.record_key = p_id::text
     and a.actor_id is not null
     and (
       a.action = 'INSERT'
       or (a.action = 'UPDATE' and exists (
             select 1 from pg_catalog.unnest(a.changed_columns) as c
              where c not in ('publication_state', 'updated_at')))
     );
$$;

-- Why p_admin may not publish this validated row under its approval class; null if allowed.
create function public.nfai_admin_publish_block(p_table text, p_id uuid, p_admin uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_validator uuid;
begin
  if public.nfai_admin_approval_class(p_table) = 'standard' then
    return null;
  end if;
  v_validator := public.nfai_admin_validator(p_table, p_id);
  if v_validator is null then
    return 'validator_unknown';
  elsif v_validator = p_admin then
    return 'validated_by_caller';
  elsif p_admin = any (public.nfai_admin_content_authors(p_table, p_id)) then
    return 'edited_by_caller';
  end if;
  return null;
end;
$$;

comment on function public.nfai_admin_publish_block(text, uuid, uuid) is
  'Separation of duties (D-031): for separated tables the publisher must differ from the validator of the current cycle and from every content author. Returns the blocking reason or null.';

create function public.nfai_admin_log_action(
  p_table text, p_id uuid, p_action text, p_from text, p_to text, p_actor uuid,
  p_reason text default null, p_reason_code text default null
)
returns void
language sql
set search_path = ''
as $$
  insert into public.workflow_actions
    (subject_table, record_id, action, from_state, to_state, actor_id, reason, reason_code, cycle)
  values
    (p_table, p_id, p_action, p_from, p_to, p_actor, p_reason, p_reason_code,
     public.nfai_admin_cycle(p_table, p_id));
$$;

-- Draft edits are refused once reviewed and while submitted.
create function public.nfai_admin_assert_editable(p_table text, p_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_state text := public.nfai_admin_state_of(p_table, p_id);
begin
  if v_state not in ('draft', 'extracted') then
    raise exception '%(%) is % and can no longer be edited', p_table, p_id, v_state using errcode = 'NFA05';
  end if;
  if v_state = 'draft' and public.nfai_admin_is_submitted(p_table, p_id) then
    raise exception '%(%) is submitted for review; recall it before editing', p_table, p_id using errcode = 'NFA05';
  end if;
  return v_state;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8. Write functions (SECURITY DEFINER; EXECUTE for authenticated only)
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER is required: authenticated has no write grants and no access to
-- unpublished rows (D-030), and the state guard admits review decisions only when made
-- as the owner. Every function pins search_path, takes the actor from auth.uid() via
-- nfai_admin_require_permission (which also overwrites nfai.actor_*), checks permission
-- and workflow rules here, and writes through the Phase 2 primitives and triggers.

create function public.nfai_admin_create_draft(p_table text, p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_cols text[];
begin
  perform public.nfai_admin_require_permission('edit_draft');
  v_table := public.nfai_admin_fact_table(p_table);
  v_cols := public.nfai_admin_value_columns(v_table, p_values, '{}');
  perform pg_catalog.set_config('nfai.change_reason', 'admin: create draft', true);
  return public.nfai_admin_insert_row(v_table, v_cols, p_values);
end;
$$;

create function public.nfai_admin_update_draft(p_table text, p_id uuid, p_values jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[];
begin
  perform public.nfai_admin_require_permission('edit_draft');
  perform public.nfai_admin_assert_editable(p_table, p_id);
  v_cols := public.nfai_admin_value_columns(p_table, p_values, '{}');
  if pg_catalog.cardinality(v_cols) = 0 then
    raise exception 'nothing to update' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', 'admin: edit draft', true);
  execute pg_catalog.format(
    'update %1$s set (%2$s) = (select %2$s from pg_catalog.jsonb_populate_record(null::%1$s, $1)) where id = $2',
    p_table::regclass, public.nfai_admin_column_list(v_cols))
    using p_values, p_id;
end;
$$;

create function public.nfai_admin_delete_draft(p_table text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  perform public.nfai_admin_require_permission('edit_draft');
  v_reason := public.nfai_admin_require_reason(p_reason);
  perform public.nfai_admin_assert_editable(p_table, p_id);
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  execute pg_catalog.format('delete from %s where id = $1', p_table::regclass) using p_id;
end;
$$;

create function public.nfai_admin_create_source(p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[];
begin
  perform public.nfai_admin_require_permission('edit_draft');
  -- New registry entries always start as proposed; approval is a publish_fact decision.
  v_cols := public.nfai_admin_value_columns('public.sources', p_values, array['registry_status']);
  perform pg_catalog.set_config('nfai.change_reason', 'admin: propose source', true);
  return public.nfai_admin_insert_row('public.sources', v_cols, p_values);
end;
$$;

create function public.nfai_admin_create_source_document(p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[];
begin
  perform public.nfai_admin_require_permission('edit_draft');
  v_cols := public.nfai_admin_value_columns('public.source_documents', p_values, '{}');
  perform pg_catalog.set_config('nfai.change_reason', 'admin: add source document', true);
  return public.nfai_admin_insert_row('public.source_documents', v_cols, p_values);
end;
$$;

create function public.nfai_admin_record_observation(p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[];
begin
  perform public.nfai_admin_require_permission('edit_draft');
  v_cols := public.nfai_admin_value_columns('public.source_observations', p_values, '{}', array[
    'source_document_id', 'retrieved_at', 'retrieved_url', 'http_status', 'content_type',
    'content_sha256', 'observed_version', 'retrieval_method', 'notes'
  ]);
  perform pg_catalog.set_config('nfai.change_reason', 'admin: record observation', true);
  return public.nfai_admin_insert_row('public.source_observations', v_cols, p_values);
end;
$$;

create function public.nfai_admin_set_source_status(p_source_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_current text;
begin
  perform public.nfai_admin_require_permission('publish_fact');
  v_reason := public.nfai_admin_require_reason(p_reason);
  if p_status is null or p_status not in ('approved', 'retired') then
    raise exception 'status must be approved or retired' using errcode = '22023';
  end if;
  select s.registry_status into v_current from public.sources s where s.id = p_source_id for update;
  if v_current is null then
    raise exception 'source % not found', p_source_id using errcode = 'P0002';
  end if;
  if not ((v_current = 'proposed' and p_status in ('approved', 'retired'))
          or (v_current = 'approved' and p_status = 'retired')) then
    raise exception 'a % source cannot become %', v_current, p_status using errcode = 'NFA05';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  update public.sources set registry_status = p_status where id = p_source_id;
end;
$$;

create function public.nfai_admin_attach_provenance(p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[];
  v_table text;
  v_subject uuid;
  v_state text;
begin
  perform public.nfai_admin_require_permission('edit_draft');
  v_cols := public.nfai_admin_value_columns('public.provenance_links', p_values, '{}', array[
    'subject_table', 'subject_id', 'source_document_id', 'source_observation_id', 'role',
    'locator', 'evidence_note', 'extraction_method', 'extractor_version', 'confidence',
    'confidence_reason'
  ]);
  v_table := p_values ->> 'subject_table';
  begin
    v_subject := (p_values ->> 'subject_id')::uuid;
  exception when others then
    raise exception 'subject_id must be a uuid' using errcode = '22023';
  end;
  v_state := public.nfai_admin_state_of(v_table, v_subject);
  -- Evidence may be added in any state (for example a contradicting source or a
  -- retraction notice on a published fact), but not to a draft frozen for review.
  if v_state = 'draft' and public.nfai_admin_is_submitted(v_table, v_subject) then
    raise exception '%(%) is submitted for review; recall it before changing its sources', v_table, v_subject
      using errcode = 'NFA05';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', 'admin: attach provenance', true);
  return public.nfai_admin_insert_row('public.provenance_links', v_cols, p_values);
end;
$$;

create function public.nfai_admin_revoke_provenance(p_link_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_link record;
  v_state text;
begin
  perform public.nfai_admin_require_permission('edit_draft');
  v_reason := public.nfai_admin_require_reason(p_reason);
  select l.subject_table, l.subject_id, l.revoked_at into v_link
    from public.provenance_links l where l.id = p_link_id for update;
  if not found then
    raise exception 'provenance link % not found', p_link_id using errcode = 'P0002';
  end if;
  if v_link.revoked_at is not null then
    raise exception 'provenance link % is already revoked', p_link_id using errcode = 'NFA05';
  end if;
  v_state := public.nfai_admin_state_of(v_link.subject_table, v_link.subject_id);
  if v_state = 'draft' and public.nfai_admin_is_submitted(v_link.subject_table, v_link.subject_id) then
    raise exception 'the record is submitted for review; recall it before changing its sources'
      using errcode = 'NFA05';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  -- revoked_by is stamped from nfai.actor_id by the Phase 2 link guard. A validated or
  -- published record left without qualifying provenance fails here, not at commit (D-028).
  update public.provenance_links set revoked_at = now(), revoked_reason = v_reason where id = p_link_id;
  if exists (select 1 from public.publication_states s where s.code = v_state and s.requires_provenance) then
    perform public.nfai_assert_provenance(v_link.subject_table, v_link.subject_id);
  end if;
end;
$$;

create function public.nfai_admin_submit(p_table text, p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('submit_review');
  v_note text := public.nfai_admin_optional_note(p_note);
  v_state text := public.nfai_admin_state_of(p_table, p_id);
begin
  if v_state <> 'draft' then
    raise exception 'only drafts are submitted for review (%(%) is %)', p_table, p_id, v_state using errcode = 'NFA05';
  end if;
  if public.nfai_admin_is_submitted(p_table, p_id) then
    raise exception '%(%) is already submitted', p_table, p_id using errcode = 'NFA05';
  end if;
  perform public.nfai_admin_log_action(p_table, p_id, 'submit', 'draft', 'draft', v_admin, v_note);
end;
$$;

create function public.nfai_admin_recall_submission(p_table text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('submit_review');
  v_reason text := public.nfai_admin_require_reason(p_reason);
begin
  if public.nfai_admin_state_of(p_table, p_id) <> 'draft' or not public.nfai_admin_is_submitted(p_table, p_id) then
    raise exception '%(%) is not a submitted draft', p_table, p_id using errcode = 'NFA05';
  end if;
  perform public.nfai_admin_log_action(p_table, p_id, 'recall', 'draft', 'draft', v_admin, v_reason);
end;
$$;

create function public.nfai_admin_validate(p_table text, p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('validate_fact');
  v_note text := public.nfai_admin_optional_note(p_note);
  v_state text := public.nfai_admin_state_of(p_table, p_id);
begin
  if not (v_state = 'extracted' or (v_state = 'draft' and public.nfai_admin_is_submitted(p_table, p_id))) then
    raise exception 'only a submitted draft or an extracted row can be validated (%(%) is %)', p_table, p_id, v_state
      using errcode = 'NFA05';
  end if;
  perform public.nfai_assert_provenance(p_table, p_id);
  perform public.nfai_transition(p_table, p_id, 'validated', v_note, null);
  perform public.nfai_admin_log_action(p_table, p_id, 'validate', v_state, 'validated', v_admin, v_note);
end;
$$;

create function public.nfai_admin_return_to_draft(p_table text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('validate_fact');
  v_reason text := public.nfai_admin_require_reason(p_reason);
  v_state text := public.nfai_admin_state_of(p_table, p_id);
begin
  if v_state = 'validated' then
    perform public.nfai_transition(p_table, p_id, 'draft', v_reason, null);
  elsif not (v_state = 'draft' and public.nfai_admin_is_submitted(p_table, p_id)) then
    raise exception 'only a validated row or a submitted draft can be returned (%(%) is %)', p_table, p_id, v_state
      using errcode = 'NFA05';
  end if;
  perform public.nfai_admin_log_action(p_table, p_id, 'return_to_draft', v_state, 'draft', v_admin, v_reason);
end;
$$;

create function public.nfai_admin_reject(p_table text, p_id uuid, p_reason text, p_reason_code text default 'other')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('reject_fact');
  v_reason text := public.nfai_admin_require_reason(p_reason);
  v_code text := public.nfai_admin_require_reason_code(p_reason_code);
  v_state text := public.nfai_admin_state_of(p_table, p_id);
begin
  if not (v_state in ('extracted', 'validated') or (v_state = 'draft' and public.nfai_admin_is_submitted(p_table, p_id))) then
    raise exception 'only a submitted draft, an extracted or a validated row can be rejected (%(%) is %)', p_table, p_id, v_state
      using errcode = 'NFA05';
  end if;
  perform public.nfai_transition(p_table, p_id, 'rejected', v_reason, v_code);
  perform public.nfai_admin_log_action(p_table, p_id, 'reject', v_state, 'rejected', v_admin, v_reason, v_code);
end;
$$;

create function public.nfai_admin_publish(p_table text, p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('publish_fact');
  v_note text := public.nfai_admin_optional_note(p_note);
  v_state text := public.nfai_admin_state_of(p_table, p_id);
  v_block text;
begin
  if v_state <> 'validated' then
    raise exception 'only a validated row can be published (%(%) is %)', p_table, p_id, v_state using errcode = 'NFA05';
  end if;
  v_block := public.nfai_admin_publish_block(p_table, p_id, v_admin);
  if v_block is not null then
    raise exception 'separation of duties: % needs a different publisher (%)', p_table, v_block using errcode = 'NFA04';
  end if;
  perform public.nfai_assert_provenance(p_table, p_id);
  perform public.nfai_transition(p_table, p_id, 'published', v_note, null);
  perform public.nfai_admin_log_action(p_table, p_id, 'publish', 'validated', 'published', v_admin, v_note);
end;
$$;

create function public.nfai_admin_supersede(p_table text, p_old_id uuid, p_new_id uuid, p_kind text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('supersede_fact');
  v_reason text := public.nfai_admin_require_reason(p_reason);
  v_old_state text := public.nfai_admin_state_of(p_table, p_old_id);
  v_new_state text := public.nfai_admin_state_of(p_table, p_new_id);
  v_block text;
  v_id uuid;
begin
  if not public.nfai_admin_has_permission(v_admin, 'publish_fact') then
    raise exception 'permission publish_fact required' using errcode = 'NFA03';
  end if;
  if p_kind is null or p_kind not in ('correction', 'restatement', 'duplicate_merge') then
    raise exception 'kind must be correction, restatement or duplicate_merge' using errcode = '22023';
  end if;
  if v_old_state <> 'published' then
    raise exception 'only a published row can be superseded (%(%) is %)', p_table, p_old_id, v_old_state using errcode = 'NFA05';
  end if;
  if v_new_state not in ('validated', 'published') then
    raise exception 'the replacement must be validated or published (%(%) is %)', p_table, p_new_id, v_new_state
      using errcode = 'NFA05';
  end if;
  if v_new_state = 'validated' then
    v_block := public.nfai_admin_publish_block(p_table, p_new_id, v_admin);
    if v_block is not null then
      raise exception 'separation of duties: the replacement in % needs a different publisher (%)', p_table, v_block
        using errcode = 'NFA04';
    end if;
    perform public.nfai_assert_provenance(p_table, p_new_id);
  end if;
  v_id := public.nfai_supersede(p_table, p_old_id, p_new_id, p_kind, v_reason);
  if v_new_state = 'validated' then
    perform public.nfai_admin_log_action(p_table, p_new_id, 'publish', 'validated', 'published', v_admin,
      p_kind || ': ' || v_reason);
  end if;
  perform public.nfai_admin_log_action(p_table, p_old_id, 'supersede', 'published', 'superseded', v_admin,
    p_kind || ': ' || v_reason);
  return v_id;
end;
$$;

create function public.nfai_admin_withdraw(p_table text, p_id uuid, p_reason text, p_reason_code text default 'other')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('withdraw_fact');
  v_reason text := public.nfai_admin_require_reason(p_reason);
  v_code text := public.nfai_admin_require_reason_code(p_reason_code);
  v_state text := public.nfai_admin_state_of(p_table, p_id);
begin
  if v_state <> 'published' then
    raise exception 'only a published row can be withdrawn (%(%) is %)', p_table, p_id, v_state using errcode = 'NFA05';
  end if;
  perform public.nfai_withdraw(p_table, p_id, v_reason, v_code);
  perform public.nfai_admin_log_action(p_table, p_id, 'withdraw', 'published', 'withdrawn', v_admin, v_reason, v_code);
end;
$$;

create function public.nfai_admin_close_period(p_table text, p_id uuid, p_valid_to timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('publish_fact');
  v_reason text := public.nfai_admin_require_reason(p_reason);
  v_state text := public.nfai_admin_state_of(p_table, p_id);
  v_row jsonb;
begin
  if not exists (
    select 1 from public.fact_tables f where f.table_name = p_table and 'valid_to' = any (f.post_review_mutable_columns)
  ) then
    raise exception '% has no effective period to close', p_table using errcode = '22023';
  end if;
  if p_valid_to is null then
    raise exception 'valid_to is required' using errcode = '22023';
  end if;
  if v_state <> 'published' then
    raise exception 'only a published row''s period is closed here (%(%) is %)', p_table, p_id, v_state using errcode = 'NFA05';
  end if;
  execute pg_catalog.format('select pg_catalog.to_jsonb(r) from %s r where r.id = $1', p_table::regclass)
    into v_row using p_id;
  if v_row ->> 'valid_to' is not null then
    raise exception '%(%) already has valid_to', p_table, p_id using errcode = 'NFA05';
  end if;
  if v_row ->> 'valid_from' is null or p_valid_to <= (v_row ->> 'valid_from')::timestamptz then
    raise exception 'valid_to must be after valid_from' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  execute pg_catalog.format('update %s set valid_to = $1 where id = $2', p_table::regclass) using p_valid_to, p_id;
  perform public.nfai_admin_log_action(p_table, p_id, 'close_period', 'published', 'published', v_admin, v_reason);
end;
$$;

create function public.nfai_admin_grant_role(p_admin_id uuid, p_role text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('manage_admins');
  v_reason text := public.nfai_admin_require_reason(p_reason);
  v_status text;
  v_id uuid;
begin
  if p_admin_id = v_admin then
    raise exception 'nobody can change their own roles' using errcode = 'NFA03';
  end if;
  if not exists (select 1 from public.admin_roles r where r.code = p_role) then
    raise exception 'unknown role %', coalesce(p_role, 'null') using errcode = '22023';
  end if;
  select i.status into v_status from public.admin_identities i where i.id = p_admin_id;
  if v_status is null then
    raise exception 'admin identity % not found', p_admin_id using errcode = 'P0002';
  elsif v_status <> 'active' then
    raise exception 'roles are granted to active identities only' using errcode = 'NFA05';
  end if;
  if exists (
    select 1 from public.admin_role_assignments a
     where a.admin_id = p_admin_id and a.role_code = p_role and a.revoked_at is null
  ) then
    raise exception 'the identity already holds role %', p_role using errcode = 'NFA05';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  insert into public.admin_role_assignments (admin_id, role_code, granted_by, grant_reason)
  values (p_admin_id, p_role, v_admin, v_reason)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.nfai_admin_revoke_role(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('manage_admins');
  v_reason text := public.nfai_admin_require_reason(p_reason);
  v_assignment record;
begin
  select a.admin_id, a.revoked_at into v_assignment
    from public.admin_role_assignments a where a.id = p_assignment_id for update;
  if not found then
    raise exception 'role assignment % not found', p_assignment_id using errcode = 'P0002';
  end if;
  if v_assignment.admin_id = v_admin then
    raise exception 'nobody can change their own roles' using errcode = 'NFA03';
  end if;
  if v_assignment.revoked_at is not null then
    raise exception 'role assignment % is already revoked', p_assignment_id using errcode = 'NFA05';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  update public.admin_role_assignments
     set revoked_at = now(), revoked_by = v_admin, revoke_reason = v_reason
   where id = p_assignment_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 9. Read functions (SECURITY DEFINER; EXECUTE for authenticated only)
-- -----------------------------------------------------------------------------
-- authenticated cannot read unpublished rows or internal tables (D-030). These
-- functions return explicit columns after checking the caller's permission in SQL.

-- The caller's identity, roles and effective permissions (for the admin shell).
create function public.nfai_admin_whoami()
returns table (admin_id uuid, display_name text, roles text[], permissions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_current_identity();
begin
  return query
    select i.id, i.display_name,
           public.nfai_admin_active_roles(i.id),
           public.nfai_admin_effective_permissions(i.id)
      from public.admin_identities i
     where i.id = v_admin;
end;
$$;

-- Review state of one fact row, for the review queue and record pages.
create function public.nfai_admin_review_state(p_table text, p_id uuid, p_state text, p_admin uuid)
returns table (
  approval_class text,
  submitted boolean,
  submitted_by uuid,
  submitted_at timestamptz,
  validated_by uuid,
  validated_at timestamptz,
  review_cycle integer,
  publish_blocked_reason text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_last public.workflow_actions%rowtype;
begin
  select * into v_last from public.nfai_admin_last_review_action(p_table, p_id);
  approval_class := public.nfai_admin_approval_class(p_table);
  submitted := p_state = 'extracted' or (p_state = 'draft' and coalesce(v_last.action = 'submit', false));
  if p_state = 'draft' and v_last.action = 'submit' then
    submitted_by := v_last.actor_id;
    submitted_at := v_last.occurred_at;
  end if;
  if p_state = 'validated' and v_last.action = 'validate' then
    validated_by := v_last.actor_id;
    validated_at := v_last.occurred_at;
  end if;
  review_cycle := public.nfai_admin_cycle(p_table, p_id);
  if p_state = 'validated' then
    publish_blocked_reason := public.nfai_admin_publish_block(p_table, p_id, p_admin);
  end if;
  return next;
end;
$$;

create function public.nfai_admin_review_queue(p_limit integer default 200)
returns table (
  subject_table text,
  record_id uuid,
  fact_kind text,
  publication_state text,
  approval_class text,
  submitted_by uuid,
  submitted_by_name text,
  submitted_at timestamptz,
  validated_by uuid,
  validated_by_name text,
  validated_at timestamptz,
  review_cycle integer,
  supporting_link_count integer,
  record_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('view_admin');
  v_rows text;
begin
  -- One union over every registered fact table (names come only from fact_tables).
  select pg_catalog.string_agg(pg_catalog.format(
           'select %1$L::text as subject_table, r.id as record_id, %2$L::text as fact_kind,
                   r.publication_state, r.created_at as record_created_at
              from %1$s r
             where r.publication_state in (''extracted'', ''validated'')
                or (r.publication_state = ''draft'' and public.nfai_admin_is_submitted(%1$L, r.id))',
           f.table_name, f.fact_kind), ' union all ' order by f.table_name)
    into v_rows
    from public.fact_tables f;

  return query execute pg_catalog.format(
    'select q.subject_table, q.record_id, q.fact_kind, q.publication_state, s.approval_class,
            s.submitted_by, si.display_name, s.submitted_at,
            s.validated_by, vi.display_name, s.validated_at,
            s.review_cycle,
            (select pg_catalog.count(*)::integer
               from public.provenance_links l
              where l.subject_table = q.subject_table and l.subject_id = q.record_id
                and l.revoked_at is null and l.role in (''primary'', ''corroborating'', ''verification'')),
            q.record_created_at
       from (%s) q
      cross join lateral public.nfai_admin_review_state(q.subject_table, q.record_id, q.publication_state, $1) s
       left join public.admin_identities si on si.id = s.submitted_by
       left join public.admin_identities vi on vi.id = s.validated_by
      order by coalesce(s.validated_at, s.submitted_at, q.record_created_at), q.subject_table, q.record_id
      limit $2', v_rows)
    using v_admin, greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;

comment on function public.nfai_admin_review_queue(integer) is
  'Records awaiting a decision: submitted drafts, extracted and validated rows across all fact tables (view_admin).';

-- One record's review state and the actions the caller may take on it now.
create function public.nfai_admin_record_status(p_table text, p_id uuid)
returns table (
  subject_table text,
  record_id uuid,
  publication_state text,
  approval_class text,
  required_approvals integer,
  submitted boolean,
  submitted_by uuid,
  submitted_at timestamptz,
  validated_by uuid,
  validated_at timestamptz,
  review_cycle integer,
  content_author_ids uuid[],
  available_actions text[],
  publish_blocked_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_require_permission('view_admin');
  v_state text := public.nfai_admin_state_of(p_table, p_id);
  v_perms text[] := public.nfai_admin_effective_permissions(v_admin);
  v_s record;
  v_actions text[] := '{}';
  v_row jsonb;
begin
  select * into v_s from public.nfai_admin_review_state(p_table, p_id, v_state, v_admin);

  if v_state in ('draft', 'extracted') then
    if 'edit_draft' = any (v_perms) and not (v_state = 'draft' and v_s.submitted) then
      v_actions := v_actions || array['update_draft', 'delete_draft', 'attach_provenance'];
    end if;
    if v_state = 'draft' and 'submit_review' = any (v_perms) then
      v_actions := v_actions || case when v_s.submitted then 'recall_submission' else 'submit' end;
    end if;
    if v_s.submitted and 'validate_fact' = any (v_perms) then
      v_actions := v_actions || 'validate'::text;
      if v_state = 'draft' then
        v_actions := v_actions || 'return_to_draft'::text;
      end if;
    end if;
    if v_s.submitted and 'reject_fact' = any (v_perms) then
      v_actions := v_actions || 'reject'::text;
    end if;
  elsif v_state = 'validated' then
    if 'publish_fact' = any (v_perms) and v_s.publish_blocked_reason is null then
      v_actions := v_actions || 'publish'::text;
    end if;
    if 'validate_fact' = any (v_perms) then
      v_actions := v_actions || 'return_to_draft'::text;
    end if;
    if 'reject_fact' = any (v_perms) then
      v_actions := v_actions || 'reject'::text;
    end if;
    if 'edit_draft' = any (v_perms) then
      v_actions := v_actions || 'attach_provenance'::text;
    end if;
  elsif v_state = 'published' then
    if 'supersede_fact' = any (v_perms) and 'publish_fact' = any (v_perms) then
      v_actions := v_actions || 'supersede'::text;
    end if;
    if 'withdraw_fact' = any (v_perms) then
      v_actions := v_actions || 'withdraw'::text;
    end if;
    if 'publish_fact' = any (v_perms) and exists (
      select 1 from public.fact_tables f where f.table_name = p_table and 'valid_to' = any (f.post_review_mutable_columns)
    ) then
      execute pg_catalog.format('select pg_catalog.to_jsonb(r) from %s r where r.id = $1', p_table::regclass)
        into v_row using p_id;
      if v_row ->> 'valid_to' is null and v_row ->> 'valid_from' is not null then
        v_actions := v_actions || 'close_period'::text;
      end if;
    end if;
    if 'edit_draft' = any (v_perms) then
      v_actions := v_actions || 'attach_provenance'::text;
    end if;
  end if;

  return query select
    p_table, p_id, v_state, v_s.approval_class,
    case when v_s.approval_class = 'separated' then 2 else 1 end,
    v_s.submitted, v_s.submitted_by, v_s.submitted_at, v_s.validated_by, v_s.validated_at,
    v_s.review_cycle,
    public.nfai_admin_content_authors(p_table, p_id),
    v_actions,
    v_s.publish_blocked_reason;
end;
$$;

comment on function public.nfai_admin_record_status(text, uuid) is
  'Review state of one fact row and the workflow actions the caller may take now (view_admin). The write functions re-check everything.';

create function public.nfai_admin_get_record(p_table text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform public.nfai_admin_require_permission('view_admin');
  execute pg_catalog.format('select pg_catalog.to_jsonb(r) from %s r where r.id = $1',
    public.nfai_admin_readable_table(p_table)::regclass)
    into v_row using p_id;
  if v_row is null then
    raise exception '%(%) not found', p_table, p_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- Rows of a fact table (optionally in given publication states) or of the source
-- registry (p_states then filters sources.registry_status), newest first.
create function public.nfai_admin_list_records(
  p_table text,
  p_states text[] default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_state_column text;
begin
  perform public.nfai_admin_require_permission('view_admin');
  v_table := public.nfai_admin_readable_table(p_table);
  v_state_column := case
    when v_table = 'public.sources' then 'registry_status'
    when v_table in ('public.source_documents', 'public.source_observations') then null
    else 'publication_state'
  end;
  if p_states is not null and v_state_column is null then
    raise exception '% has no state to filter on', v_table using errcode = '22023';
  end if;
  return query execute pg_catalog.format(
    'select pg_catalog.to_jsonb(r) from %s r where ($1::text[] is null or %s = any ($1)) order by r.created_at desc, r.id limit $2 offset $3',
    v_table::regclass, coalesce('r.' || pg_catalog.quote_ident(v_state_column), 'null'))
    using p_states,
          greatest(1, least(coalesce(p_limit, 50), 500)),
          greatest(0, coalesce(p_offset, 0));
end;
$$;

-- All provenance links of one fact row, including internal and revoked ones.
create function public.nfai_admin_provenance(p_table text, p_id uuid)
returns table (
  link_id uuid,
  role text,
  tier_at_citation text,
  source_id uuid,
  source_name text,
  source_tier text,
  source_registry_status text,
  source_document_id uuid,
  document_title text,
  document_original_url text,
  source_observation_id uuid,
  observation_retrieved_at timestamptz,
  locator text,
  evidence_note text,
  extraction_method text,
  extractor_version text,
  confidence text,
  confidence_reason text,
  created_at timestamptz,
  created_by uuid,
  created_by_name text,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_by_name text,
  revoked_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nfai_admin_require_permission('view_admin');
  perform public.nfai_admin_state_of(p_table, p_id);
  return query
    select l.id, l.role, l.tier_at_citation, s.id, s.name, s.tier, s.registry_status,
           d.id, d.title, d.original_url, o.id, o.retrieved_at,
           l.locator, l.evidence_note, l.extraction_method, l.extractor_version,
           l.confidence, l.confidence_reason, l.created_at, l.created_by, ci.display_name,
           l.revoked_at, l.revoked_by, ri.display_name, l.revoked_reason
      from public.provenance_links l
      join public.source_documents d on d.id = l.source_document_id
      join public.sources s on s.id = d.source_id
      left join public.source_observations o on o.id = l.source_observation_id
      left join public.admin_identities ci on ci.id = l.created_by
      left join public.admin_identities ri on ri.id = l.revoked_by
     where l.subject_table = p_table and l.subject_id = p_id
     order by l.created_at, l.id;
end;
$$;

-- Publication events and workflow decisions of one record, oldest first.
create function public.nfai_admin_record_history(p_table text, p_id uuid)
returns table (
  entry_kind text,
  entry_id bigint,
  occurred_at timestamptz,
  action text,
  from_state text,
  to_state text,
  actor_id uuid,
  actor_kind text,
  actor_name text,
  reason text,
  reason_code text,
  review_cycle integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nfai_admin_require_permission('view_audit');
  perform public.nfai_admin_fact_table(p_table);
  return query
    select h.entry_kind, h.entry_id, h.occurred_at, h.action, h.from_state, h.to_state,
           h.actor_id, h.actor_kind, i.display_name, h.reason, h.reason_code, h.review_cycle
      from (
        select 'publication_event'::text as entry_kind, e.id as entry_id, e.occurred_at,
               'state_change'::text as action, e.from_state, e.to_state, e.actor_id, e.actor_kind,
               e.reason, e.reason_code, null::integer as review_cycle
          from public.publication_events e
         where e.subject_table = p_table and e.record_id = p_id
        union all
        select 'workflow_action', w.id, w.occurred_at, w.action, w.from_state, w.to_state,
               w.actor_id, 'user', w.reason, w.reason_code, w.cycle
          from public.workflow_actions w
         where w.subject_table = p_table and w.record_id = p_id
      ) h
      left join public.admin_identities i on i.id = h.actor_id
     order by h.occurred_at, h.entry_kind, h.entry_id;
end;
$$;

create function public.nfai_admin_audit_log(
  p_table text default null,
  p_record_id uuid default null,
  p_actor_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 100
)
returns table (
  id bigint,
  occurred_at timestamptz,
  table_name text,
  record_key text,
  action text,
  actor_id uuid,
  actor_kind text,
  actor_label text,
  actor_name text,
  db_role text,
  reason text,
  changed_columns text[],
  old_row jsonb,
  new_row jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nfai_admin_require_permission('view_audit');
  return query
    select a.id, a.occurred_at, a.table_name, a.record_key, a.action, a.actor_id, a.actor_kind,
           a.actor_label, i.display_name, a.db_role, a.reason, a.changed_columns, a.old_row, a.new_row
      from public.audit_log a
      left join public.admin_identities i on i.id = a.actor_id
     where (p_table is null or a.table_name = p_table)
       and (p_record_id is null or a.record_key = p_record_id::text)
       and (p_actor_id is null or a.actor_id = p_actor_id)
       and (p_from is null or a.occurred_at >= p_from)
       and (p_to is null or a.occurred_at < p_to)
       and (p_before_id is null or a.id < p_before_id)
     order by a.id desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

comment on function public.nfai_admin_audit_log(text, uuid, uuid, timestamptz, timestamptz, bigint, integer) is
  'Audit log, newest first, filtered by table, record, actor and [p_from, p_to); page with p_before_id = the last id seen (view_audit).';

create function public.nfai_admin_list_admins()
returns table (
  admin_id uuid,
  display_name text,
  status text,
  disabled_at timestamptz,
  roles text[],
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nfai_admin_require_permission('manage_admins');
  return query
    select i.id, i.display_name, i.status, i.disabled_at, public.nfai_admin_active_roles(i.id), i.created_at
      from public.admin_identities i
     order by i.display_name, i.id;
end;
$$;

create function public.nfai_admin_role_history(p_admin_id uuid default null)
returns table (
  assignment_id uuid,
  admin_id uuid,
  admin_name text,
  role_code text,
  granted_at timestamptz,
  granted_by uuid,
  granted_by_name text,
  grant_reason text,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_by_name text,
  revoke_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nfai_admin_require_permission('manage_admins');
  return query
    select a.id, a.admin_id, i.display_name, a.role_code, a.granted_at, a.granted_by, gi.display_name,
           a.grant_reason, a.revoked_at, a.revoked_by, ri.display_name, a.revoke_reason
      from public.admin_role_assignments a
      join public.admin_identities i on i.id = a.admin_id
      left join public.admin_identities gi on gi.id = a.granted_by
      left join public.admin_identities ri on ri.id = a.revoked_by
     where p_admin_id is null or a.admin_id = p_admin_id
     order by a.granted_at desc, a.id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. Grants and Row Level Security
-- -----------------------------------------------------------------------------
-- New tables: RLS on with no policies, no API-role grants (internal; read through the
-- functions above). service_role may read them but never writes them: vocabulary and
-- policies change by migration, assignments and workflow decisions only through the
-- nfai_admin_* functions.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'admin_permissions', 'admin_roles', 'admin_role_permissions', 'admin_role_assignments',
    'fact_approval_policies', 'workflow_actions'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
    execute pg_catalog.format('revoke all on public.%I from anon, authenticated', v_table);
    execute pg_catalog.format('revoke insert, update, delete, truncate on public.%I from service_role', v_table);
  end loop;
end;
$$;

-- Functions: revoke EXECUTE from everyone (Postgres grants it to PUBLIC, Supabase to
-- service_role), then grant the admin API to authenticated only.
do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
      from pg_catalog.pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'nfai_admin_role_assignment_guard', 'nfai_admin_has_permission',
         'nfai_admin_effective_permissions', 'nfai_admin_active_roles', 'nfai_admin_approval_class',
         'nfai_admin_workflow_action_stamp', 'nfai_admin_state_guard', 'nfai_admin_fact_table',
         'nfai_admin_readable_table', 'nfai_admin_value_columns', 'nfai_admin_column_list',
         'nfai_admin_insert_row', 'nfai_admin_state_of', 'nfai_admin_require_reason',
         'nfai_admin_optional_note', 'nfai_admin_require_reason_code', 'nfai_admin_last_review_action',
         'nfai_admin_is_submitted', 'nfai_admin_cycle', 'nfai_admin_validator',
         'nfai_admin_content_authors', 'nfai_admin_publish_block', 'nfai_admin_log_action',
         'nfai_admin_assert_editable', 'nfai_admin_review_state',
         'nfai_admin_create_draft', 'nfai_admin_update_draft', 'nfai_admin_delete_draft',
         'nfai_admin_create_source', 'nfai_admin_create_source_document', 'nfai_admin_record_observation',
         'nfai_admin_set_source_status', 'nfai_admin_attach_provenance', 'nfai_admin_revoke_provenance',
         'nfai_admin_submit', 'nfai_admin_recall_submission', 'nfai_admin_validate',
         'nfai_admin_return_to_draft', 'nfai_admin_reject', 'nfai_admin_publish', 'nfai_admin_supersede',
         'nfai_admin_withdraw', 'nfai_admin_close_period', 'nfai_admin_grant_role', 'nfai_admin_revoke_role',
         'nfai_admin_whoami', 'nfai_admin_review_queue', 'nfai_admin_record_status', 'nfai_admin_get_record',
         'nfai_admin_list_records', 'nfai_admin_provenance', 'nfai_admin_record_history',
         'nfai_admin_audit_log', 'nfai_admin_list_admins', 'nfai_admin_role_history'
       )
  loop
    execute pg_catalog.format('revoke execute on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end;
$$;

grant execute on function
  public.nfai_admin_create_draft(text, jsonb),
  public.nfai_admin_update_draft(text, uuid, jsonb),
  public.nfai_admin_delete_draft(text, uuid, text),
  public.nfai_admin_create_source(jsonb),
  public.nfai_admin_create_source_document(jsonb),
  public.nfai_admin_record_observation(jsonb),
  public.nfai_admin_set_source_status(uuid, text, text),
  public.nfai_admin_attach_provenance(jsonb),
  public.nfai_admin_revoke_provenance(uuid, text),
  public.nfai_admin_submit(text, uuid, text),
  public.nfai_admin_recall_submission(text, uuid, text),
  public.nfai_admin_validate(text, uuid, text),
  public.nfai_admin_return_to_draft(text, uuid, text),
  public.nfai_admin_reject(text, uuid, text, text),
  public.nfai_admin_publish(text, uuid, text),
  public.nfai_admin_supersede(text, uuid, uuid, text, text),
  public.nfai_admin_withdraw(text, uuid, text, text),
  public.nfai_admin_close_period(text, uuid, timestamptz, text),
  public.nfai_admin_grant_role(uuid, text, text),
  public.nfai_admin_revoke_role(uuid, text),
  public.nfai_admin_whoami(),
  public.nfai_admin_review_queue(integer),
  public.nfai_admin_record_status(text, uuid),
  public.nfai_admin_get_record(text, uuid),
  public.nfai_admin_list_records(text, text[], integer, integer),
  public.nfai_admin_provenance(text, uuid),
  public.nfai_admin_record_history(text, uuid),
  public.nfai_admin_audit_log(text, uuid, uuid, timestamptz, timestamptz, bigint, integer),
  public.nfai_admin_list_admins(),
  public.nfai_admin_role_history(uuid)
to authenticated;


-- -----------------------------------------------------------------------------
-- 11. Security self-check, extended for Phase 3
-- -----------------------------------------------------------------------------
-- Same checks as 0004, plus:
--   * the reviewed admin API (definer functions granted to authenticated) is listed
--     here by name; any other SECURITY DEFINER or API-executable function is reported,
--     and listed admin functions must be SECURITY DEFINER, never executable by anon or
--     service_role;
--   * workflow vocabulary, policies, assignments and decisions are not writable by
--     service_role, and internal admin tables are not readable by API roles;
--   * every registered fact table has an approval policy and the state guard trigger.

create or replace function public.nfai_security_audit()
returns table (check_name text, object_name text, detail text)
language sql
stable
set search_path = ''
as $$
  with admin_api (proname) as (
    values
      -- 0006 (identity, Thread A)
      ('nfai_admin_create_identity'), ('nfai_admin_set_identity_status'),
      ('nfai_admin_set_identity_display_name'),
      -- 0007 writes
      ('nfai_admin_create_draft'), ('nfai_admin_update_draft'), ('nfai_admin_delete_draft'),
      ('nfai_admin_create_source'), ('nfai_admin_create_source_document'), ('nfai_admin_record_observation'),
      ('nfai_admin_set_source_status'), ('nfai_admin_attach_provenance'), ('nfai_admin_revoke_provenance'),
      ('nfai_admin_submit'), ('nfai_admin_recall_submission'), ('nfai_admin_validate'),
      ('nfai_admin_return_to_draft'), ('nfai_admin_reject'), ('nfai_admin_publish'), ('nfai_admin_supersede'),
      ('nfai_admin_withdraw'), ('nfai_admin_close_period'), ('nfai_admin_grant_role'), ('nfai_admin_revoke_role'),
      -- 0007 reads
      ('nfai_admin_whoami'), ('nfai_admin_review_queue'), ('nfai_admin_record_status'), ('nfai_admin_get_record'),
      ('nfai_admin_list_records'), ('nfai_admin_provenance'), ('nfai_admin_record_history'),
      ('nfai_admin_audit_log'), ('nfai_admin_list_admins'), ('nfai_admin_role_history')
  )
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
     and c.relname in ('audit_log', 'publication_events', 'source_archives', 'fact_tables', 'publication_intervals',
                       'admin_permissions', 'admin_roles', 'admin_role_permissions', 'admin_role_assignments',
                       'fact_approval_policies', 'workflow_actions')
     and pg_catalog.has_any_column_privilege(r.role, c.oid, 'SELECT')

  union all
  -- anon may execute only the visibility helpers; authenticated also the reviewed admin API.
  select 'api_role_function_execute', p.oid::regprocedure::text, r.role || ' can execute'
    from pg_catalog.pg_proc p
   cross join (values ('anon'), ('authenticated')) as r(role)
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('nfai_is_public_state', 'nfai_is_current_state', 'nfai_record_visible')
     and not (r.role = 'authenticated' and p.proname in (select a.proname from admin_api a))
     and pg_catalog.has_function_privilege(r.role, p.oid, 'EXECUTE')

  union all
  -- SECURITY DEFINER only where reviewed, and always with a pinned search_path.
  select 'security_definer_unreviewed', p.oid::regprocedure::text, 'security definer function is not on the reviewed list'
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and p.proname not in ('nfai_audit_row_change', 'nfai_fact_log_event')
     and p.proname not in (select a.proname from admin_api a)

  union all
  select 'security_definer_search_path', p.oid::regprocedure::text, 'security definer function has no pinned search_path'
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and not exists (select 1 from pg_catalog.unnest(p.proconfig) as cfg where cfg like 'search_path=%')

  union all
  -- The admin API derives the actor from auth.uid() and must run as its owner.
  select 'admin_api_not_definer', p.oid::regprocedure::text, 'admin API function is not SECURITY DEFINER'
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in (select a.proname from admin_api a)
     and not p.prosecdef

  union all
  select 'admin_api_execute', p.oid::regprocedure::text, r.role || ' can execute an admin API function'
    from pg_catalog.pg_proc p
   cross join (values ('anon'), ('service_role')) as r(role)
   where p.pronamespace = 'public'::regnamespace
     and p.proname in (select a.proname from admin_api a)
     and pg_catalog.has_function_privilege(r.role, p.oid, 'EXECUTE')

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
  -- Audit history, workflow vocabulary and admin authority are written only by
  -- triggers, migrations and the admin functions.
  select 'service_role_protected_write', c.oid::regclass::text, 'service_role has ' || p.priv
    from pg_catalog.pg_class c
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('audit_log', 'publication_events', 'fact_tables', 'source_tiers',
                       'publication_states', 'publication_state_transitions',
                       'admin_identities', 'admin_permissions', 'admin_roles', 'admin_role_permissions',
                       'admin_role_assignments', 'fact_approval_policies', 'workflow_actions')
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
   )

  union all
  -- D-031: every registered fact table has an approval class.
  select 'fact_table_without_approval_policy', f.table_name, 'registered fact table has no fact_approval_policies row'
    from public.fact_tables f
   where not exists (select 1 from public.fact_approval_policies p where p.table_name = f.table_name)

  union all
  -- Review decisions only through the workflow functions.
  select 'fact_table_without_state_guard', f.table_name, 'registered fact table has no nfai_admin_state_guard trigger'
    from public.fact_tables f
   where not exists (
     select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass(f.table_name)
        and t.tgname = 'nfai_admin_state_guard'
        and t.tgenabled <> 'D'
   );
$$;

comment on function public.nfai_security_audit() is
  'Lists violations of the security model (Phase 2 checks plus the Phase 3 admin API allow-list, approval policies and state guards). Empty result = model holds.';

revoke execute on function public.nfai_security_audit() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 12. Self-check
-- -----------------------------------------------------------------------------

do $$
declare
  v_findings text;
begin
  select pg_catalog.string_agg(a.check_name || ' ' || a.object_name || ': ' || a.detail, '; ')
    into v_findings
    from public.nfai_security_audit() a;
  if v_findings is not null then
    raise exception '0007 security self-audit failed: %', v_findings;
  end if;
end;
$$;
