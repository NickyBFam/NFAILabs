-- NFAI Labs Phase 2 and 3: database acceptance checks for a real Supabase project.
--
-- Run as the `postgres` role (Supabase SQL Editor, or psql with the project's connection
-- string) AFTER migrations 0001-0007 and supabase/seed.sql have been applied to a
-- DEVELOPMENT project. See docs/DATABASE.md §8 and docs/ADMIN.md §9.
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
  v_expected text[] := array['0001', '0002', '0003', '0004', '0005', '0006', '0007'];
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
    'admin_identities', 'admin_permissions', 'admin_role_assignments', 'admin_role_permissions',
    'admin_roles', 'fact_approval_policies', 'workflow_actions',
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
  values ('all 36 expected tables exist', v_missing is null, 'missing: ' || coalesce(v_missing::text, 'none'));

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

-- 11. Phase 3: admin access model (D-031 to D-035) --------------------------------------------
-- Uses two synthetic admin identities created inside a rolled-back sub-transaction. Nothing
-- here persists: no identity, role, draft or event survives the check.
do $$
declare
  c_x constant uuid := 'a0000000-0000-4000-8000-0000000000a1';  -- editor + reviewer + publisher
  c_y constant uuid := 'a0000000-0000-4000-8000-0000000000a2';  -- publisher only
  c_stranger constant uuid := 'a0000000-0000-4000-8000-0000000000a3';  -- signed in, no identity
  c_beta_draft constant uuid := '5eed0000-0000-4000-8000-000000000105';
  c_alpha constant uuid := '5eed0000-0000-4000-8000-000000000104';
  c_channel constant uuid := '5eed0000-0000-4000-8000-000000000102';
  c_document constant uuid := '5eed0000-0000-4000-8000-000000000002';
  v_service_blocked text := 'not run';
  v_anon_blocked text := 'not run';
  v_stranger_blocked text := 'not run';
  v_service_mint_blocked text := 'not run';
  v_standard text := 'not run';
  v_actor_ok boolean := false;
  v_separation text := 'not run';
  v_second_person text := 'not run';
  v_id uuid;
  v_state text;
begin
  -- service_role cannot move a row past draft (only the admin workflow functions can).
  begin
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    execute 'set local role service_role';
    perform public.nfai_transition('public.model_versions', c_beta_draft, 'validated');
    v_service_blocked := 'transition succeeded';
    raise exception using errcode = 'P0001', message = 'nfai_check_rollback';
  exception when others then
    if sqlerrm like '%admin workflow functions%' then v_service_blocked := 'ok';
    elsif v_service_blocked = 'not run' then v_service_blocked := sqlstate || ' ' || sqlerrm; end if;
  end;

  -- anon cannot even call the admin functions.
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    perform public.nfai_admin_publish('public.model_versions', c_beta_draft, null);
    v_anon_blocked := 'call succeeded';
    raise exception using errcode = 'P0001', message = 'nfai_check_rollback';
  exception when others then
    if sqlstate = '42501' then v_anon_blocked := 'ok';
    elsif v_anon_blocked = 'not run' then v_anon_blocked := sqlstate || ' ' || sqlerrm; end if;
  end;

  -- A signed-in user without an admin identity is refused (NFA01).
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', c_stranger)::text, true);
    execute 'set local role authenticated';
    perform public.nfai_admin_publish('public.model_versions', c_beta_draft, null);
    v_stranger_blocked := 'call succeeded';
    raise exception using errcode = 'P0001', message = 'nfai_check_rollback';
  exception when others then
    if sqlstate = 'NFA01' then v_stranger_blocked := 'ok';
    elsif v_stranger_blocked = 'not run' then v_stranger_blocked := sqlstate || ' ' || sqlerrm; end if;
  end;

  -- A leaked service key cannot mint an admin identity.
  begin
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    execute 'set local role service_role';
    insert into public.admin_identities (id, display_name) values (c_stranger, 'Remote Check Minted (synthetic)');
    v_service_mint_blocked := 'insert succeeded';
    raise exception using errcode = 'P0001', message = 'nfai_check_rollback';
  exception when others then
    if sqlstate = '42501' then v_service_mint_blocked := 'ok';
    elsif v_service_mint_blocked = 'not run' then v_service_mint_blocked := sqlstate || ' ' || sqlerrm; end if;
  end;

  -- Full workflow with synthetic admins: standard record by one person; separated record
  -- refused for the same person and accepted from a second person.
  begin
    insert into public.admin_identities (id, display_name)
    values (c_x, 'Remote Check Editor (synthetic)'), (c_y, 'Remote Check Publisher (synthetic)');
    insert into public.admin_role_assignments (admin_id, role_code, grant_reason)
    values (c_x, 'editor', 'Remote check (synthetic)'), (c_x, 'reviewer', 'Remote check (synthetic)'),
           (c_x, 'publisher', 'Remote check (synthetic)'), (c_y, 'publisher', 'Remote check (synthetic)');

    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', c_x)::text, true);
    execute 'set local role authenticated';
    v_id := public.nfai_admin_create_draft('public.providers',
      '{"slug": "remote-check-admin-provider", "name": "Remote Check Admin Provider (synthetic)"}');
    perform public.nfai_admin_attach_provenance(jsonb_build_object(
      'subject_table', 'public.providers', 'subject_id', v_id,
      'source_document_id', c_document, 'role', 'primary'));
    perform public.nfai_admin_submit('public.providers', v_id, null);
    perform public.nfai_admin_validate('public.providers', v_id, null);
    perform public.nfai_admin_publish('public.providers', v_id, null);
    execute 'reset role';
    select publication_state into v_state from public.providers where id = v_id;
    v_standard := case when v_state = 'published' then 'ok' else 'state ' || coalesce(v_state, 'missing') end;
    select e.actor_id = c_x and e.actor_kind = 'user' into v_actor_ok
      from public.publication_events e
     where e.subject_table = 'public.providers' and e.record_id = v_id and e.to_state = 'published';

    execute 'set local role authenticated';
    v_id := public.nfai_admin_create_draft('public.pricing_records', jsonb_build_object(
      'model_version_id', c_alpha, 'deployment_channel_id', c_channel, 'billing_dimension', 'input_tokens',
      'currency', 'XTS', 'price_amount', 0.7, 'unit', 'token', 'unit_quantity', 1000000,
      'valid_from', '2030-01-01T00:00:00Z'));
    perform public.nfai_admin_attach_provenance(jsonb_build_object(
      'subject_table', 'public.pricing_records', 'subject_id', v_id,
      'source_document_id', c_document, 'role', 'primary'));
    perform public.nfai_admin_submit('public.pricing_records', v_id, null);
    perform public.nfai_admin_validate('public.pricing_records', v_id, null);
    begin
      perform public.nfai_admin_publish('public.pricing_records', v_id, null);
      v_separation := 'same person published';
    exception when others then
      v_separation := case when sqlstate = 'NFA04' then 'ok' else sqlstate || ' ' || sqlerrm end;
    end;

    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', c_y)::text, true);
    perform public.nfai_admin_publish('public.pricing_records', v_id, null);
    execute 'reset role';
    select publication_state into v_state from public.pricing_records where id = v_id;
    v_second_person := case when v_state = 'published' then 'ok' else 'state ' || coalesce(v_state, 'missing') end;

    raise exception using errcode = 'P0001', message = 'nfai_check_rollback';
  exception when others then
    if sqlerrm <> 'nfai_check_rollback' then
      if v_standard = 'not run' then v_standard := 'error: ' || sqlstate || ' ' || sqlerrm;
      elsif v_second_person = 'not run' then v_second_person := 'error: ' || sqlstate || ' ' || sqlerrm; end if;
    end if;
  end;

  insert into nfai_remote_checks (check_name, passed, detail) values
    ('service_role cannot validate or publish (admin workflow only)', v_service_blocked = 'ok', v_service_blocked),
    ('anon cannot call admin workflow functions', v_anon_blocked = 'ok', v_anon_blocked),
    ('signed-in user without an admin identity is refused (NFA01)', v_stranger_blocked = 'ok', v_stranger_blocked),
    ('service_role cannot create admin identities', v_service_mint_blocked = 'ok', v_service_mint_blocked),
    ('one admin can draft, source, submit, validate and publish a standard record (rolled back)', v_standard = 'ok', v_standard),
    ('publication event is attributed to the signed-in admin', coalesce(v_actor_ok, false), 'actor matches: ' || coalesce(v_actor_ok::text, 'no event')),
    ('the same admin cannot validate and publish a separated record (NFA04)', v_separation = 'ok', v_separation),
    ('a second admin can publish the separated record (rolled back)', v_second_person = 'ok', v_second_person);
end;
$$;

select id, case when passed then 'PASS' else 'FAIL' end as result, check_name, detail
  from nfai_remote_checks
 order by id;
