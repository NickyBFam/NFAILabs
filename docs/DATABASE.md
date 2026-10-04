# NFAI Labs — Database Conventions & Schema

| Field | Value |
|---|---|
| Document | Database conventions and schema reference |
| Phase | Phase 2 — Database & Data Architecture |
| Status | Phase 2 accepted by the owner 2026-09-29 (D-025 to D-030 Accepted; real Supabase validation passed, §8.1). The data baseline is the owner's Phase 2 commit. |
| Last updated | 2026-09-29 |

This document records the shared conventions every Phase 2 migration and data-access module follows, and (once integrated) the schema reference. Product concepts live in `MASTER_SPEC.md` §3, zones in `ARCHITECTURE.md` §4, provenance fields in `DATA_SOURCES.md` §3, comparability rules in `METHODOLOGY.md` §5–§8.

---

## 1. Platform

- **Target:** PostgreSQL **17** on Supabase (`supabase/config.toml` `major_version = 17`).
- **Do not use PostgreSQL 18-only features** (for example `uuidv7()`, temporal `WITHOUT OVERLAPS` / `PERIOD` constraints, virtual generated columns). The in-process test database (PGlite) runs PostgreSQL 18, so tests would not catch them.
- Plain, portable SQL first (D-005). Supabase-specific pieces (API roles, `auth.*` functions, RLS for the Data API) are used deliberately and only in the security migration.
- Extensions: `pgcrypto` and `btree_gist` are available (Supabase and the test harness). Create them with `create extension if not exists <name> with schema extensions;`. `gen_random_uuid()` is core and needs no extension.

## 2. Migrations

- Location: `supabase/migrations/`, Supabase CLI naming `<version>_<name>.sql`, applied in filename order:

  | File | Contents |
  |---|---|
  | `0001_core_catalog.sql` | Providers, deployment channels, model families, exact model versions, aliases, releases/lifecycle, capabilities |
  | `0002_measurements_pricing.sql` | Benchmarks, versions, metrics, harnesses, evaluation configurations, benchmark results, pricing history |
  | `0003_provenance_history.sql` | Sources, documents, observations, provenance links, publication lifecycle, supersession, publication events, audit log; registers the 0001/0002 tables |
  | `0004_security_rls.sql` | Grants, RLS policies, visibility helpers, `nfai_security_audit()` |
  | `0005_effective_period_integrity.sql` | Exclusion constraints: no overlapping published effective periods (D-029) |
  | `0006_admin_identity.sql` | Phase 3: admin identities keyed by the Auth user id, identity functions (D-033) |
  | `0007_admin_roles_workflow.sql` | Phase 3: roles, permissions, approval policies, workflow actions, the `nfai_admin_*` workflow and read API, the publication-state guard, and the replaced `nfai_security_audit()` (D-031, D-034, D-035) |

- A later migration may `alter` objects from an earlier one; an earlier migration never references objects created later.
- No `begin`/`commit` in files (the CLI wraps each file in a transaction). No `drop` of another thread's objects.
- Migrations are forward-only (Supabase has no down migrations). "Up/down" validation is done by rebuilding from an empty database (`supabase db reset` locally; a fresh PGlite database in tests).
- Every migration must apply cleanly to an empty database after the ones before it.

## 3. Naming and types

- `snake_case`; tables plural (`model_versions`), foreign keys `<singular>_id` (`model_version_id`).
- Primary keys: `id uuid primary key default gen_random_uuid()`. IDs are the durable identity. Slugs and display names are mutable attributes, unique where they route, never used as foreign keys.
- Timestamps: `timestamptz`. `created_at timestamptz not null default now()` on every table. Calendar facts that are genuinely dates (e.g. an announced release date with day precision) may use `date`.
- Small closed value sets: `text` with a `check (... in (...))` constraint rather than Postgres enums (cheaper to extend in a migration).
- Money: `numeric` (never `float`), with an explicit ISO 4217 `currency` column and an explicit unit column.
- Free-form `jsonb` only for genuinely open-ended detail; fields needed for comparability (`METHODOLOGY.md` §5–§6) are real columns.
- Constraint names follow Postgres defaults (`<table>_<column>_fkey`, `_key`, `_check`) unless a clearer name helps error messages.

## 4. History, publication, deletion (shared defaults)

These are the coordinator's defaults so the four migrations fit together. A specialist that has already chosen differently should keep going and report the difference; the coordinator reconciles it during integration and records the decision.

- **Effective dating:** half-open intervals `[valid_from, valid_to)` as `timestamptz`; `valid_to is null` means "still in effect". `check (valid_to is null or valid_to > valid_from)`.
- **Append-only facts** (pricing, benchmark results, capabilities, releases/lifecycle): a change inserts a new row; old rows are never overwritten or deleted.
- **Supersession / correction** (Thread B owns the mechanism): a superseded row stays, linked to its replacement, with a reason and source.
- **Publication state (integration decision, supersedes the earlier 3-state default):** every fact table carries `publication_state text not null default 'draft'`, referencing the `publication_states` lookup table from `0003` (`draft`, `extracted`, `validated`, `published`, `rejected`, `superseded`, `withdrawn`). Tables opt into the shared lifecycle with `nfai_register_fact_table()`, which enforces allowed transitions, frozen reviewed content, provenance before validation/publication, and no deletion past draft. Public reads see the public historical record (`is_public`: published, superseded, withdrawn); "current" means `is_current` (published) and the valid period contains the as-of time. A price change closes `valid_to` on the old row; supersession is only for corrections.
- **Deletes:** foreign keys use the default `no action`/`restrict`. **No `on delete cascade`** from catalog or measurement tables into historical, provenance, or audit data.

## 5. Roles and environment

- Supabase API roles: `anon` (public, read published data only), `authenticated` (reads the public record; since Phase 3 may also execute the `nfai_admin_*` functions, which authorize admins themselves, D-034), `service_role` (bypasses RLS; server/worker only; since Phase 3 cannot move rows past draft/extracted or write admin tables).
- Environment variables (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design), `SUPABASE_SERVICE_ROLE_KEY` (secret, server-only; only modules that `import "server-only"` may read it).
- All are optional: the app must build and render without them.

## 6. Testing

- Database tests are named `*.db.test.ts` and run in the Vitest `db` project (Node environment). `npm test` runs them with everything else; `npm run test:db` runs only them.
- `src/test/db/harness.ts` (coordinator-owned) creates a fresh in-process PostgreSQL database with PGlite, loads `src/test/db/supabase-shim.sql` (API roles, default privileges like Supabase, `auth.uid()`/`auth.role()`/`auth.jwt()`), and applies every migration in order. `asRole(db, "anon", fn, claims)` runs queries as an API role inside a rolled-back transaction.
- No network, Docker, or credentials are needed, so the same tests run in CI.
- Fixtures are synthetic and obviously fictional (`AGENTS.md` rule 11). `supabase/seed.sql` holds synthetic data only.

## 7. Schema reference

Column-level detail lives in the migrations (every table and important column has a SQL `comment`). This section is the map.

### 7.1 Entity relationships

```
providers ─┬─< deployment_channels            (serving provider)
           └─< model_families ─< model_versions ─┬─< model_version_aliases >── deployment_channels
                                   (self: base_model_version_id)  ├─< model_releases       >─(opt) deployment_channels
                                                  ├─< model_capabilities >── capabilities
                                                  ├─< pricing_records     >── deployment_channels
                                                  └─< benchmark_results
benchmarks ─< benchmark_versions ─┬─< benchmark_metrics
                                  └─< benchmark_results >── benchmark_metrics (same version, composite FK)
evaluation_harnesses ─< evaluation_harness_versions ─< evaluation_configurations ─< benchmark_results

sources ─< source_documents ─┬─< source_document_locations
                             ├─< source_observations ─< source_archives (internal)
                             └─< provenance_links >── any registered fact row (subject_table, subject_id)
fact_tables (registry) ─< provenance_links, supersessions, publication_events
publication_states ─< every fact table's publication_state
supersessions: old fact row ──> new fact row (same table, linear chain)
audit_log: every insert/update/delete on registered and provenance tables (internal)
```

`A ─< B` means one A has many B. Every foreign key is `ON DELETE RESTRICT` (tested).

### 7.2 Tables by zone

| Zone (`ARCHITECTURE.md` §4) | Tables | History model |
|---|---|---|
| Catalog | `providers`, `deployment_channels`, `model_families`, `model_versions`, `model_version_aliases`, `model_releases`, `capabilities`, `model_capabilities` | Lifecycle-registered; aliases and capability values effective-dated; releases are append-only events |
| Measurements | `benchmarks`, `benchmark_versions`, `benchmark_metrics`, `evaluation_harnesses`, `evaluation_harness_versions`, `evaluation_configurations`, `benchmark_results` | Lifecycle-registered; results frozen once reviewed, corrected by supersession |
| Commercial | `pricing_records` | Effective-dated, append-only; one published row per series at any moment |
| Provenance | `sources`, `source_documents`, `source_document_locations`, `source_observations`, `source_archives`, `provenance_links` | Append-only (links revocable once) |
| Workflow & history | `publication_states`, `publication_state_transitions`, `fact_tables`, `supersessions`, `publication_events` | Vocabulary changed only by migration; logs append-only |
| Audit | `audit_log` | Append-only, internal |
| Admin (Phase 3, `ADMIN.md`) | `admin_identities`, `admin_roles`, `admin_permissions`, `admin_role_permissions`, `admin_role_assignments`, `fact_approval_policies`, `workflow_actions` | Identities never deleted (disabled); role assignments append-only with one-time revocation; vocabularies change only by migration; workflow actions append-only. All internal: RLS on, no API grants except an identity reading its own row |
| Derived, editorial, ingestion | none yet | Phases 5, 6, 11 and 12 add these as new migrations |

Views (`security_invoker`): `provenance_link_details` (public, column-limited), `supersession_chains` (public), `publication_intervals` (internal).

### 7.3 Key invariants and where they are enforced

| Invariant | Enforcement |
|---|---|
| A result belongs to one exact model version, one benchmark version and metric, one evaluation configuration | `NOT NULL` foreign keys on `benchmark_results`; composite FK ties the metric to the version; no provider or family column exists |
| Evaluation conditions are structured, not free text | `evaluation_configurations` columns with checks; `undisclosed` is an explicit value |
| No published fact without an approved T1–T3 source; T4-only and T5 never qualify (D-028) | `nfai_assert_provenance` at commit for `validated`/`published` rows and when a link is revoked; `source_tiers.satisfies_publication_gate` |
| Reviewed content is never overwritten or deleted | lifecycle guard trigger; append-only and no-truncate triggers |
| Price changes create new records; state at a date is unique | new row + `valid_to` closed once; exclusion constraints in `0005` |
| Corrections keep the old record | `supersessions` + `superseded` state |
| Public never sees internal or unreviewed data | grants + RLS (`nfai_is_public_state`, parent visibility); `nfai_security_audit()` |
| What NFAI said at a past time | `publication_events`, `nfai_state_as_of()`, `nfai_is_current_as_of()` |

### 7.4 Data-access layer (`src/lib/data`)

- `clients/`: `browser.ts` (anon key, no session), `server.ts` (anon key, `server-only`), `service.ts` + `service-config.ts` (the only reader of `SUPABASE_SERVICE_ROLE_KEY`, `server-only`; no Phase 2 caller).
- `repositories/`: the only modules that query the database. They take the public client, filter to current published rows in the query, and map results.
- `mappers/`: database rows to domain models (`domain.ts`); refuse rows in internal states.
- `queries/`: pure history rules (current-at-date selection; overlapping current rows are an error).
- `errors.ts`: `DataAccessError` with the database error as `cause` and a generic public message.
- Row types: `src/types/database` (hand-written, checked against the migrations by a database test).
- Synthetic fixtures: `src/test/fixtures/database`; local seed: `supabase/seed.sql`.

## 8. Remote Supabase validation (Phase 2 closing requirement)

PGlite validation runs in CI on every change. Before Phase 2 closes, the same schema must also be validated once on a real Supabase project. The owner performs these steps; agents never create, link or change a remote project.

**Use a dedicated, empty development project.** It receives only migrations `0001`–`0005` and the synthetic seed. Never use a preview or production project.

1. In the Supabase dashboard, create a new project (for example `nfai-labs-dev`) and note its project ref and database password. Under Project Settings → Infrastructure, confirm the Postgres major version is 17.
2. From the repository root, sign in and link the project (the CLI is run through npx and pinned; it stores its login token outside the repository):
   ```bash
   npx supabase@2.118.0 login
   npx supabase@2.118.0 link --project-ref <project-ref>
   ```
3. Preview what will be applied. It must list exactly `0001` to `0005`:
   ```bash
   npx supabase@2.118.0 db push --dry-run
   ```
4. Apply the migrations and the synthetic seed:
   ```bash
   npx supabase@2.118.0 db push --include-seed
   ```
5. Database checks: open the dashboard SQL Editor, paste `supabase/validation/remote_checks.sql`, and run it. Every row must read `PASS`. It covers: migrations recorded, all 29 tables present, RLS on every table, an empty `nfai_security_audit()`, anon never seeing unapproved rows, anon and authenticated writes and workflow calls refused, published synthetic records readable, superseded/withdrawn history, and service-role workflow (every write it makes is rolled back).
6. API checks (over HTTP, as a browser would): copy the project URL, the anon (or publishable) key and the service_role (or secret) key from Project Settings → API into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. `.env.local` is git-ignored; never commit it. Then:
   ```bash
   npm run build
   ```
   ```bash
   node --env-file=.env.local supabase/validation/api_checks.mjs
   ```
   It must end with all checks passed. It covers: anon reads published Test Model Alpha but not draft Test Model Beta, only public states visible, superseded/withdrawn history, anon insert, update, workflow RPC and audit-log reads refused, the service-role key working from server-side code, and the service-role key absent from the browser bundle.
7. Share both outputs so they can be recorded in `PHASES.md`. Afterwards the project can be paused or deleted from the dashboard.

`remote_checks.sql` also runs in CI against PGlite (`src/test/db/remote-checks.db.test.ts`), so the script is known to be correct before it is used remotely.

The Supabase CLI writes local link state to `supabase/.temp/` (project ref, pooler URL); `supabase/.gitignore` keeps it and any `supabase/.env*` out of Git.

### 8.1 Result (2026-09-29): passed

Run by the owner against the development project **NFAI Labs Dev** (ref `teaohntkuuqrenqfjmqh`), synthetic data only. No secret values are recorded here.

| Check | Result |
|---|---|
| PostgreSQL major version | 17 |
| Migrations `0001`–`0005` | Applied successfully |
| Synthetic seed | Applied successfully |
| Public tables | 29 exist |
| Row Level Security | Enabled on all 29 |
| `nfai_security_audit()` | 0 findings |
| API checks (`api_checks.mjs`) | 10/10 passed: anon reads published Test Model Alpha; anon cannot read draft Test Model Beta; anon sees only public states; anon sees superseded and withdrawn results as history; anon insert refused (42501); anon update refused (42501); anon cannot run workflow functions; anon cannot read the audit log; service role reads unpublished rows server-side; service-role key absent from the browser bundle |

## 9. Supabase advisor notes (non-blocking)

Reported by the Supabase advisors on the development project during the Phase 2 validation.

- **Security, informational: "RLS enabled, no policy"** on `audit_log`, `fact_tables`, `publication_events` and `source_archives`. Intended: these tables are internal-only (D-030). RLS with no policy plus no API-role grants keeps them inaccessible to `anon` and `authenticated`. Do not add public policies.
- **Performance: unindexed foreign keys.** Local inspection finds six foreign keys without a covering index: `provenance_links (source_observation_id, source_document_id)`, `provenance_links (tier_at_citation)`, `publication_events (from_state)`, `publication_events (to_state)`, `publication_state_transitions (to_state)` and `sources (tier)`. Most reference small vocabulary tables whose rows are never deleted, so the cost is negligible at Phase 2 scale. **Future performance review:** revisit with real query patterns and volumes (at the latest in Phase 22, or when data entry starts in Phase 3/4), adding indexes through a new migration only where measured.
- **Performance: unused indexes.** Expected on a new database with almost no traffic. Indexes are **not** removed on this basis; unused-index findings are only meaningful against production-like workloads.
