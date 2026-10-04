-- =============================================================================
-- NFAI Labs, Phase 3 migration 0006: internal admin identity
-- =============================================================================
--
-- Owner: Phase 3 Thread A (authentication and identity). Conventions: docs/DATABASE.md.
-- Depends on 0003 (nfai_audit_row_change, nfai_touch_updated_at) and 0004 (API-role
-- baseline: no default privileges for anon/authenticated, RLS on every table).
--
-- Model:
--
--   * Supabase Auth (auth.users) holds credentials and sessions. NFAI never stores
--     passwords, tokens or emails.
--   * public.admin_identities maps an authenticated Supabase user to an internal admin
--     identity. Its primary key IS the Supabase auth user id (the JWT `sub`): one
--     immutable uuid for sign-in, authorization and audit attribution. Email is never an
--     identity (it can change and is personal data).
--   * Having a Supabase account grants nothing. Only a row here with status 'active'
--     admits a user to /admin. Accounts are created by the owner (invite or
--     admin-created); there is no self-service sign-up path.
--   * No foreign key to auth.users, by the same rule as Phase 2 actor ids (0003): audit
--     history must outlive account deletion and must not depend on Supabase's auth schema.
--   * Identities are never deleted. Disabling keeps the row, so every actor_id already
--     written to audit_log and publication_events stays resolvable to a display name.
--     Every change to this table is itself written to audit_log.
--   * Roles and permissions are not here; they reference this table from 0007.
--
-- Access:
--
--   * anon: nothing.
--   * authenticated: SELECT on its OWN row only (RLS: id = auth.uid()), on a limited set
--     of columns, so the server can check "is this signed-in user an active admin" with
--     the user's own token instead of the service-role key. No direct writes: identity
--     changes go through the nfai_admin_* functions in section 4, which require the
--     manage_admins permission (0007) and attribute the change to the caller.
--   * service_role: read only. It cannot create, change, delete or truncate identities,
--     so a leaked service-role key cannot mint an administrator.
--   * Nobody, including the owner, can delete an identity or change its id.
--
-- SQLSTATEs raised by the identity functions (shared with 0007, see docs/ADMIN.md):
-- NFA01 no admin identity (or not signed in), NFA02 identity disabled, NFA03 permission
-- missing, 22023 invalid argument, P0002 target identity not found.
--
-- Bootstrapping the first admin (development project, synthetic identity only): create
-- the user in the Supabase dashboard (Authentication > Users > Add user, auto-confirm),
-- then run as postgres in the SQL editor:
--
--   insert into public.admin_identities (id, display_name)
--   values ('<auth user uuid>', '<display name>');
--
-- This migration inserts no data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------

create table public.admin_identities (
  id uuid primary key,
  display_name text not null,
  status text not null default 'active',
  disabled_at timestamptz,
  disabled_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_identities_display_name_check check (
    display_name = btrim(display_name) and length(display_name) between 1 and 120
  ),
  constraint admin_identities_status_check check (status in ('active', 'disabled')),
  constraint admin_identities_disabled_consistency_check check (
    (status = 'active' and disabled_at is null and disabled_reason is null)
    or (status = 'disabled' and disabled_at is not null
        and disabled_reason is not null and length(btrim(disabled_reason)) > 0)
  ),
  constraint admin_identities_metadata_check check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096
  )
);

comment on table public.admin_identities is
  'Internal admin identity for a Supabase Auth user. Only an active row admits a user to the admin area. Rows are never deleted; disable instead so audit attribution stays resolvable.';
comment on column public.admin_identities.id is
  'The Supabase auth user id (auth.users.id, the JWT sub). Immutable. Equals actor_id in audit_log and publication_events. No foreign key to auth.users by design.';
comment on column public.admin_identities.display_name is
  'Name shown in the admin UI and audit views. Not an identifier; may change (changes are audited).';
comment on column public.admin_identities.status is
  'active: may sign in to the admin area. disabled: kept for history, admitted nowhere.';
comment on column public.admin_identities.disabled_reason is
  'Why the identity was disabled. Required while disabled; cleared when re-activated (the audit log keeps it).';
comment on column public.admin_identities.metadata is
  'Optional audit-safe operational notes as a small JSON object. Never store secrets, tokens, passwords or email addresses here.';


-- -----------------------------------------------------------------------------
-- 2. Integrity triggers
-- -----------------------------------------------------------------------------

create function public.nfai_admin_identity_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'admin identities are never deleted; set status = ''disabled'' instead'
      using errcode = 'restrict_violation';
  end if;

  if new.id is distinct from old.id then
    raise exception 'admin_identities.id is immutable (it is the Supabase auth user id)'
      using errcode = 'restrict_violation';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'admin_identities.created_at is immutable'
      using errcode = 'restrict_violation';
  end if;

  -- Stamp the disable time on the server; clear the disable fields on re-activation.
  if new.status = 'disabled' and old.status = 'active' then
    new.disabled_at := now();
  elsif new.status = 'active' then
    new.disabled_at := null;
    new.disabled_reason := null;
  elsif new.disabled_at is distinct from old.disabled_at then
    raise exception 'admin_identities.disabled_at is set by the database'
      using errcode = 'restrict_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.nfai_admin_identity_guard() is
  'BEFORE UPDATE/DELETE on admin_identities: id and created_at immutable, no deletion, server-stamped disabled_at and updated_at.';

create function public.nfai_admin_identity_insert_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.updated_at := new.created_at;
  if new.status = 'disabled' then
    new.disabled_at := new.created_at;
  end if;
  return new;
end;
$$;

comment on function public.nfai_admin_identity_insert_defaults() is
  'BEFORE INSERT on admin_identities: server-stamped created_at, updated_at and disabled_at.';

create function public.nfai_admin_identity_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin identities are never deleted; TRUNCATE is not permitted'
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.nfai_admin_identity_no_truncate() is
  'BEFORE TRUNCATE on admin_identities: always rejected.';

create trigger admin_identities_insert_defaults
  before insert on public.admin_identities
  for each row execute function public.nfai_admin_identity_insert_defaults();

create trigger admin_identities_guard
  before update or delete on public.admin_identities
  for each row execute function public.nfai_admin_identity_guard();

create trigger admin_identities_no_truncate
  before truncate on public.admin_identities
  for each statement execute function public.nfai_admin_identity_no_truncate();

-- Every change is audited with the acting identity and before/after images (0003).
create trigger admin_identities_audit
  after insert or update or delete on public.admin_identities
  for each row execute function public.nfai_audit_row_change();


-- -----------------------------------------------------------------------------
-- 3. Grants and Row Level Security
-- -----------------------------------------------------------------------------

revoke execute on function public.nfai_admin_identity_guard() from public, anon, authenticated;
revoke execute on function public.nfai_admin_identity_insert_defaults() from public, anon, authenticated;
revoke execute on function public.nfai_admin_identity_no_truncate() from public, anon, authenticated;

alter table public.admin_identities enable row level security;

revoke all on public.admin_identities from anon, authenticated;
revoke truncate on public.admin_identities from service_role;

-- A signed-in user may read only its own identity row, and only the columns the
-- sign-in check needs. metadata and disabled_reason stay server-side.
grant select (id, display_name, status, disabled_at, created_at, updated_at)
  on public.admin_identities to authenticated;

create policy admin_identities_select_own
  on public.admin_identities
  for select
  to authenticated
  using (id = (select auth.uid()));

-- Identities are written only through the attributed functions in section 4 (and by
-- the owner's SQL bootstrap). A leaked service-role key cannot create an admin.
revoke insert, update, delete on public.admin_identities from service_role;


-- -----------------------------------------------------------------------------
-- 4. Identity resolution, permission hook and identity management functions
-- -----------------------------------------------------------------------------
-- Every nfai_admin_* function resolves the caller from auth.uid() (the verified JWT
-- sub PostgREST sets), never from an argument, and overwrites the nfai.actor_*
-- settings so audit_log and publication_events attribute the change to that identity
-- whatever the caller set beforehand.

-- The caller's active admin identity. NFA01 when signed out or no identity, NFA02 when
-- disabled. Used by every nfai_admin_* function.
create function public.nfai_admin_current_identity()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'NFA01';
  end if;
  select i.status into v_status from public.admin_identities i where i.id = v_uid;
  if v_status is null then
    raise exception 'no admin identity' using errcode = 'NFA01';
  elsif v_status <> 'active' then
    raise exception 'admin identity is disabled' using errcode = 'NFA02';
  end if;
  return v_uid;
end;
$$;

comment on function public.nfai_admin_current_identity() is
  'Returns auth.uid() when it has an active admin identity; raises NFA01 (none) or NFA02 (disabled).';

-- Permission hooks. 0006 has no roles, so both fail closed; 0007 (roles and permissions)
-- replaces both bodies with `create or replace`, keeping these names and signatures.
create function public.nfai_admin_has_permission(p_admin_id uuid, p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select false;
$$;

comment on function public.nfai_admin_has_permission(uuid, text) is
  'True when the admin identity is active and holds the permission. Fail-closed stub in 0006; defined by 0007.';

create function public.nfai_admin_has_permission(p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select false;
$$;

comment on function public.nfai_admin_has_permission(text) is
  'True when the caller (auth.uid()) is an active admin holding the permission. Fail-closed stub in 0006; defined by 0007.';

-- Standard preamble: resolve the caller, check one permission, set the audit actor.
create function public.nfai_admin_require_permission(p_permission text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := public.nfai_admin_current_identity();
begin
  if not coalesce(public.nfai_admin_has_permission(v_admin, p_permission), false) then
    raise exception 'permission % required', p_permission using errcode = 'NFA03';
  end if;
  perform pg_catalog.set_config('nfai.actor_id', v_admin::text, true);
  perform pg_catalog.set_config('nfai.actor_kind', 'user', true);
  perform pg_catalog.set_config('nfai.actor_label', v_admin::text, true);
  perform pg_catalog.set_config('nfai.change_reason', '', true);
  perform pg_catalog.set_config('nfai.change_reason_code', '', true);
  return v_admin;
end;
$$;

comment on function public.nfai_admin_require_permission(text) is
  'Resolves the caller''s active identity (NFA01/NFA02), requires the permission (NFA03), and overwrites nfai.actor_* and the change reason for audit attribution. Returns the admin id.';

-- Shared argument check for the identity functions.
create function public.nfai_admin_identity_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 1000 then
    raise exception 'a reason (1 to 1000 characters) is required' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

comment on function public.nfai_admin_identity_reason(text) is
  'Validates and trims the reason given for an identity change (22023 if missing or too long).';

-- SECURITY DEFINER below: callers have no write access to admin_identities (or read
-- access to auth.users); each function checks manage_admins itself first. search_path
-- is empty and every reference is schema-qualified. Arguments are stored as data only.

create function public.nfai_admin_create_identity(
  p_id uuid,
  p_display_name text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  perform public.nfai_admin_require_permission('manage_admins');
  v_reason := public.nfai_admin_identity_reason(p_reason);
  if p_id is null or not exists (select 1 from auth.users u where u.id = p_id) then
    raise exception 'no Supabase Auth user with that id' using errcode = '22023';
  end if;
  if exists (select 1 from public.admin_identities i where i.id = p_id) then
    raise exception 'that user already has an admin identity' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  insert into public.admin_identities (id, display_name, metadata)
  values (p_id, btrim(p_display_name), coalesce(p_metadata, '{}'::jsonb));
  return p_id;
end;
$$;

comment on function public.nfai_admin_create_identity(uuid, text, text, jsonb) is
  'Gives an existing Supabase Auth user an active admin identity (no roles). Requires manage_admins. Audited with the caller as actor and the reason.';

create function public.nfai_admin_set_identity_status(p_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_reason text;
begin
  v_admin := public.nfai_admin_require_permission('manage_admins');
  v_reason := public.nfai_admin_identity_reason(p_reason);
  if p_status is null or p_status not in ('active', 'disabled') then
    raise exception 'status must be active or disabled' using errcode = '22023';
  end if;
  if p_id = v_admin then
    raise exception 'an administrator cannot change their own status' using errcode = 'NFA03';
  end if;
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  update public.admin_identities i
     set status = p_status,
         disabled_reason = case when p_status = 'disabled' then v_reason end
   where i.id = p_id;
  if not found then
    raise exception 'no admin identity with that id' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.nfai_admin_set_identity_status(uuid, text, text) is
  'Disables or re-activates another admin identity with a reason. Requires manage_admins; never the caller''s own (NFA03). Audited.';

create function public.nfai_admin_set_identity_display_name(p_id uuid, p_display_name text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  perform public.nfai_admin_require_permission('manage_admins');
  v_reason := public.nfai_admin_identity_reason(p_reason);
  perform pg_catalog.set_config('nfai.change_reason', v_reason, true);
  update public.admin_identities i set display_name = btrim(p_display_name) where i.id = p_id;
  if not found then
    raise exception 'no admin identity with that id' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.nfai_admin_set_identity_display_name(uuid, text, text) is
  'Renames an admin identity with a reason. Requires manage_admins. Audited (old and new names kept).';

revoke execute on function public.nfai_admin_current_identity() from public, anon, authenticated, service_role;
revoke execute on function public.nfai_admin_has_permission(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.nfai_admin_has_permission(text) from public, anon, authenticated, service_role;
revoke execute on function public.nfai_admin_require_permission(text) from public, anon, authenticated, service_role;
revoke execute on function public.nfai_admin_identity_reason(text) from public, anon, authenticated, service_role;

revoke execute on function public.nfai_admin_create_identity(uuid, text, text, jsonb) from public, anon, service_role;
revoke execute on function public.nfai_admin_set_identity_status(uuid, text, text) from public, anon, service_role;
revoke execute on function public.nfai_admin_set_identity_display_name(uuid, text, text) from public, anon, service_role;
grant execute on function public.nfai_admin_create_identity(uuid, text, text, jsonb) to authenticated;
grant execute on function public.nfai_admin_set_identity_status(uuid, text, text) to authenticated;
grant execute on function public.nfai_admin_set_identity_display_name(uuid, text, text) to authenticated;

-- nfai_security_audit() from 0004 reports the three SECURITY DEFINER functions above
-- (and their authenticated EXECUTE grants) until 0007 replaces it with the Phase 3
-- allow-list, so 0006 does not run the self-audit; 0007 runs it once every Phase 3
-- function exists.
