-- Test-only stand-in for the parts of a Supabase database that migrations rely on.
-- Loaded by src/test/db/harness.ts into an in-process PGlite database BEFORE the
-- migrations in supabase/migrations/. It is never applied to a real Supabase project,
-- where these objects already exist.
--
-- It mirrors Supabase behaviour that matters for security tests:
--   * the API roles anon, authenticated and service_role (service_role bypasses RLS);
--   * default privileges that grant API roles access to new public tables, so Row Level
--     Security (not missing grants) is what must protect data, exactly as on Supabase;
--   * auth.uid(), auth.role() and auth.jwt() reading the request.jwt.claims setting;
--   * a minimal auth.users table and an extensions schema.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
