-- NFAI Labs Phase 2: database acceptance checks for a real Supabase project.
--
-- Run as the `postgres` role (Supabase SQL Editor, or psql with the project's connection
-- string) AFTER migrations 0001-0005 and supabase/seed.sql have been applied to a
-- DEVELOPMENT project. See docs/DATABASE.md §8.
--
-- It changes nothing permanently: checks that write do so inside sub-transactions that are
-- always rolled back, and results go to a session-local temporary table. The final SELECT
-- lists every check with PASS / FAIL. The same script runs in CI against PGlite
-- (src/test/db/remote-checks.db.test.ts), so it is known to work before it is run remotely.

create temporary table if not exists nfai_remote_checks (
  id serial primary key,
  check_name text not null,
  passed boolean not null,
  detail text
);
truncate nfai_remote_checks;

-- 1. Migrations applied and recorded -------------------------------------------------------
do $$
declare
  v_expected text[] := array['0001', '0002', '0003', '0004', '0005'];
  v_found text[];
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    insert into nfai_remote_checks (check_name, passed, detail)
    values ('migrations recorded by Supabase CLI', true, 'not a Supabase CLI database (local test run); skipped');
    return;
  end if;
  execute 'select array_agg(version order by version) from supabase_migrations.schema_migrations' into v_found;
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('migrations recorded by Supabase CLI', v_found @> v_expected, 'recorded: ' || coalesce(v_found::text, 'none'));
end;
$$;

-- 2. Expected tables exist; 3. RLS enabled on every public table ---------------------------
do $$
declare
  v_expected text[] := array[
    'audit_log', 'benchmark_metrics', 'benchmark_results', 'benchmark_versions', 'benchmarks',
    'capabilities', 'deployment_channels', 'evaluation_configurations', 'evaluation_harness_versions',
    'evaluation_harnesses', 'fact_tables', 'model_capabilities', 'model_families', 'model_releases',
    'model_version_aliases', 'model_versions', 'pricing_records', 'provenance_links', 'providers',
    'publication_events', 'publication_state_transitions', 'publication_states', 'source_archives',
    'source_document_locations', 'source_documents', 'source_observations', 'source_tiers', 'sources',
    'supersessions'];
  v_missing text[];
  v_no_rls text[];
begin
  select array_agg(t) into v_missing
    from unnest(v_expected) t
   where to_regclass('public.' || t) is null;
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('all 29 expected tables exist', v_missing is null, 'missing: ' || coalesce(v_missing::text, 'none'));

  select array_agg(c.relname order by c.relname) into v_no_rls
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity;
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('RLS enabled on every public table', v_no_rls is null, 'without RLS: ' || coalesce(v_no_rls::text, 'none'));
end;
$$;

-- 4. Security self-audit --------------------------------------------------------------------
do $$
declare
  v_findings integer;
begin
  select count(*) into v_findings from public.nfai_security_audit();
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('nfai_security_audit() returns no findings', v_findings = 0, v_findings || ' finding(s)');
end;
$$;

-- 5. Anonymous reads never see draft/unapproved rows ------------------------------------------
do $$
declare
  v_tables text[];
  v_table text;
  v_hidden integer;
  v_leaks text := '';
  v_total_hidden integer := 0;
begin
  select array_agg(table_name order by table_name) into v_tables from public.fact_tables;
  foreach v_table in array v_tables loop
    -- Rows that exist but are not in a public state (counted as postgres).
    execute format(
      'select count(*) from %s where publication_state not in (select code from public.publication_states where is_public)',
      v_table) into v_hidden;
    v_total_hidden := v_total_hidden + v_hidden;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    execute format(
      'select count(*) from %s where publication_state not in (''published'', ''superseded'', ''withdrawn'')',
      v_table) into v_hidden;
    execute 'reset role';
    if v_hidden > 0 then
      v_leaks := v_leaks || v_table || '=' || v_hidden || ' ';
    end if;
  end loop;
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('anon sees no draft/extracted/validated/rejected rows', v_leaks = '',
          'non-public rows in database: ' || v_total_hidden || '; leaked to anon: ' || coalesce(nullif(v_leaks, ''), 'none'));
end;
$$;

-- 6. Anonymous and 7. authenticated (non-admin) writes fail --------------------------------
do $$
declare
  v_role text;
  v_attempt text;
  v_state text;
  v_attempts text[] := array[
    'insert into public.providers (slug, name) values (''remote-check-provider'', ''Remote Check Provider'')',
    'update public.model_versions set display_name = display_name',
    'delete from public.pricing_records',
    'insert into public.provenance_links (subject_table, subject_id, source_document_id, role) values (''public.providers'', gen_random_uuid(), gen_random_uuid(), ''primary'')',
    'select public.nfai_transition(''public.providers'', gen_random_uuid(), ''published'')',
    'select count(*) from public.audit_log'];
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_attempt in array v_attempts loop
      v_state := 'succeeded';
      begin
        perform set_config('request.jwt.claims',
          json_build_object('role', v_role, 'sub', '00000000-0000-4000-8000-00000000c0de')::text, true);
        execute format('set local role %I', v_role);
        execute v_attempt;
        raise exception using errcode = 'P0001', message = 'nfai_check_rollback';
      exception
        when insufficient_privilege then v_state := 'denied';
        when others then
          if sqlerrm = 'nfai_check_rollback' then v_state := 'succeeded'; else v_state := 'error: ' || sqlstate; end if;
      end;
      insert into nfai_remote_checks (check_name, passed, detail)
      values (v_role || ' cannot: ' || left(v_attempt, 60), v_state = 'denied', v_state);
    end loop;
  end loop;
end;
$$;

-- 8. Published synthetic records are readable; 9. superseded/withdrawn history ---------------
do $$
declare
  v_versions text[];
  v_states jsonb;
  v_current integer;
  v_chain integer;
begin
  if not exists (select 1 from public.providers where id = '5eed0000-0000-4000-8000-000000000101') then
    insert into nfai_remote_checks (check_name, passed, detail)
    values ('synthetic seed present', false, 'supabase/seed.sql has not been applied; read checks cannot run');
    return;
  end if;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select array_agg(display_name order by display_name) into v_versions from public.model_versions;
  select jsonb_object_agg(id::text, publication_state) into v_states
    from public.benchmark_results
   where id in ('5eed0000-0000-4000-8000-000000000205', '5eed0000-0000-4000-8000-000000000206',
                '5eed0000-0000-4000-8000-000000000207');
  select count(*) into v_current
    from public.benchmark_results
   where public.nfai_is_current_state(publication_state)
     and model_version_id = '5eed0000-0000-4000-8000-000000000104';
  select count(*) into v_chain
    from public.supersession_chains
   where old_record_id = '5eed0000-0000-4000-8000-000000000205'
     and new_record_id = '5eed0000-0000-4000-8000-000000000206';
  execute 'reset role';

  insert into nfai_remote_checks (check_name, passed, detail)
  values ('anon reads published Test Model Alpha, not draft Test Model Beta',
          v_versions = array['Test Model Alpha'], 'visible versions: ' || coalesce(v_versions::text, 'none'));
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('anon sees superseded and withdrawn results as history',
          v_states = '{"5eed0000-0000-4000-8000-000000000205": "superseded",
                       "5eed0000-0000-4000-8000-000000000206": "published",
                       "5eed0000-0000-4000-8000-000000000207": "withdrawn"}'::jsonb,
          'states: ' || coalesce(v_states::text, 'none'));
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('only the correcting result is current', v_current = 1, v_current || ' current result(s)');
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('anon can read the supersession link', v_chain = 1, v_chain || ' chain row(s)');
end;
$$;

-- 10. service_role can run the data workflow (server-side role), still bound by the rules ---
do $$
declare
  v_state text := 'not run';
  v_draft_visible boolean;
  v_edit_blocked boolean := false;
begin
  begin
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    execute 'set local role service_role';
    select exists (select 1 from public.model_versions where publication_state = 'draft') into v_draft_visible;
    insert into public.providers (id, slug, name)
    values ('5eed0000-0000-4000-8000-00000000c0de', 'remote-check-provider', 'Remote Check Provider (synthetic)');
    begin
      update public.pricing_records set price_amount = price_amount + 1 where publication_state = 'published';
    exception when check_violation then v_edit_blocked := true;
    end;
    raise exception using errcode = 'P0001', message = 'nfai_check_rollback';
  exception
    when others then
      if sqlerrm = 'nfai_check_rollback' then v_state := 'ok'; else v_state := 'error: ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('service_role can insert drafts (rolled back)', v_state = 'ok', v_state);
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('service_role can read unpublished rows', coalesce(v_draft_visible, false), 'draft version visible: ' || coalesce(v_draft_visible::text, 'unknown'));
  insert into nfai_remote_checks (check_name, passed, detail)
  values ('service_role cannot overwrite published prices', v_edit_blocked, 'blocked: ' || v_edit_blocked);
end;
$$;

select id, case when passed then 'PASS' else 'FAIL' end as result, check_name, detail
  from nfai_remote_checks
 order by id;
