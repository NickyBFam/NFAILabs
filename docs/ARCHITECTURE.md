# NFAI Labs — High-Level Architecture

| Field | Value |
|---|---|
| Document | Architecture |
| Phase | Phase 0 — Product Specification & Architecture |
| Status | Approved by owner 2026-09-29 (Phase 0 baseline) |
| Last updated | 2026-09-29 |

This is the target architecture for the eventual application. Nothing in this document is implemented in Phase 0. Technology choices are **planned defaults**, not unquestionable assumptions; concerns are recorded in `DECISIONS.md`.

---

## 1. Planned default stack

| Concern | Planned default | Decision |
|---|---|---|
| Web framework | Next.js (App Router) | D-004 |
| UI | React | D-004 |
| Language | TypeScript (strict) | D-004 |
| Styling | Tailwind CSS | D-004 |
| Database | PostgreSQL | D-005 |
| Managed database/auth/storage | Supabase | D-005 |
| Web hosting | Vercel | D-006 |
| Background workers & evaluations | Must run separately from the Vercel-hosted web app where required (accepted requirement); hosting provider not yet chosen | D-007, D-008 |

---

## 2. System overview

```
                         ┌──────────────────────────────────────────┐
   Users ───────────────►│  Public website (Next.js on Vercel)       │
                         │  Rankings, Models, Providers, Compare,    │
                         │  Benchmarks, Finder, Stack Builder,       │
                         │  News, Guides, Labs, Methodology          │
                         └───────────────┬──────────────────────────┘
                                         │ reads (cached)
   Admins ──► Admin app (auth, RBAC) ────┤
                                         ▼
                         ┌──────────────────────────────────────────┐
                         │  Data layer: PostgreSQL (Supabase)        │
                         │  catalog · results · pricing · sources ·  │
                         │  history · rankings · review queue · audit│
                         └───┬───────────────┬───────────────┬──────┘
                             │               │               │
             ┌───────────────▼──┐  ┌─────────▼────────┐  ┌───▼──────────────┐
             │ Ingestion workers │  │ Ranking engine    │  │ Evaluation infra  │
             │ fetch→…→propose   │  │ batch, versioned  │  │ sandboxed runners │
             └───────────────────┘  └──────────────────┘  └──────────────────┘
                             ▲               ▲               ▲
                             └──── Scheduler / job queue ────┘

   API consumers ──► Public API (read-only, versioned, rate-limited) ──► Data layer
```

Key property: **the public website and API are read-mostly views over approved data.** Writes to published facts only happen through the admin/approval path, the ranking engine (derived data), or approved ingestion.

---

## 3. Components

### 3.1 Public website
- Next.js with server components; pages are statically generated or incrementally revalidated from approved data.
- Areas map 1:1 to `MASTER_SPEC.md` §2.
- No direct writes to the database. Interactive tools (Compare, Finder, Stack Builder) compute from published data; any server-side logic is deterministic and testable.
- Accessibility, SEO (structured metadata for model and benchmark pages), and performance budgets defined in Phase 1.
- **Phase 1 implementation (complete, ready for owner approval):** App Router in `src/app`, with shared components in `src/components/{layout,page,ui}`, pure configuration and helpers in `src/lib`, and design tokens in `src/styles/globals.css`. Product areas and navigation come from one structural config (`src/lib/product-areas.ts`). Every route is statically prerendered; the only Client Components are the navigation (mobile menu, active link state) and the error boundaries. The system font stack avoids web-font downloads. Metadata uses a root title template and `metadataBase`, with self-referencing canonicals; indexing is opt-in (D-024). Performance budgets and the first Lighthouse baseline are recorded in `PHASES.md` (Phase 1). The preview deployment is https://nfai-labs.vercel.app/.

### 3.2 Admin / data-management system
- Authenticated, role-based (e.g. `viewer`, `editor`, `approver`, `admin`).
- Functions: create/edit proposed records, attach sources, review ingestion diffs, approve/reject, manage benchmarks and versions, manage ranking categories and methodology versions, view audit logs.
- Every write produces an audit record (who, what, when, before/after, reason).
- Separation of proposal and approval: an approver cannot silently approve their own high-impact change once more than one approver exists (policy to be set in Phase 3).
- Placement (same Next.js app under a protected route vs separate app) decided in Phase 3 (open question in `DECISIONS.md`).

### 3.3 Database
- PostgreSQL via Supabase. Relational model reflecting `MASTER_SPEC.md` §3.
- Migrations in version control; no schema changes outside migrations.
- Row Level Security for any table exposed through Supabase APIs; public reads limited to published views.
- Separation of concerns: raw/ingested data, proposed changes, published facts, derived data, and audit logs are distinct.
- **Phase 2 implementation (accepted by the owner 2026-09-29; validated on a real Supabase development project):** plain SQL migrations in `supabase/migrations/` targeting PostgreSQL 17 (D-026). Catalog, measurement and pricing tables share one publication lifecycle (`publication_state`: draft → validated → published, plus extracted, rejected, superseded, withdrawn; D-027) enforced by triggers, with provenance required before validation or publication (D-028), supersession for corrections, `publication_events` for record-time history and an internal `audit_log`. Published effective periods cannot overlap (D-029). The API roles read only the public record through grants plus RLS, and the service role is server-only (D-030). The website reaches the database only through the typed data-access layer in `src/lib/data` (clients, repositories, mappers, pure history queries). Schema map and conventions: `DATABASE.md`. Derived, editorial and ingestion-workflow tables are not built yet; they arrive with their phases as new migrations.

### 3.4 Ingestion workers
- Implement the pipeline in §8. Long-running, retryable, idempotent jobs.
- Run outside the web request path (see D-007). Output is always a **proposal** into the review queue.

### 3.5 Ranking engine
- Deterministic batch computation: reads approved results + methodology version, writes a **ranking snapshot** and derived score records with full traceability (`METHODOLOGY.md` §11.5).
- Pure, well-tested functions for normalization and aggregation, separated from I/O.
- Triggered on approval of relevant data changes or on schedule; never computed ad hoc in page requests.
- Snapshots are immutable; the site displays the latest approved snapshot and history.

### 3.6 Evaluation infrastructure (future, Phases 14–15)
- Isolated sandbox runners (containers/VMs) with pinned images; no production secrets; controlled network.
- Components: suite registry (task sets, versions), environment images, harness versions, run orchestrator, model API adapters, result scorer, artifact storage (transcripts, logs, diffs).
- Budget controls (tokens, dollars, time) per run; kill switches.
- Results flow into the same results model as external results with origin type `nfai`, and still pass validation/approval before publication.
- Not hosted on the web platform (see D-008).

### 3.7 Caching
- Published pages: static generation / incremental revalidation, invalidated on publication events (tag-based revalidation).
- API: HTTP caching headers and CDN caching for read endpoints; ETags for snapshots.
- Derived data: precomputed materializations (ranking snapshots, comparison-ready views) rather than heavy runtime queries.
- Cache invalidation is event-driven from the publish step, with time-based fallback.

### 3.8 Scheduled jobs
- Source fetch schedules per source (from the source registry).
- Ranking recomputation after approvals and on a periodic check.
- Staleness checks (e.g. prices not re-verified within N days flagged for review).
- Link checking for stored sources; snapshot capture.
- Evaluation runs on new model versions (future).
- Scheduler choice decided with D-007 (e.g. Supabase cron/pg_cron, Vercel Cron for lightweight triggers, or a queue-based worker platform).

### 3.9 API
- Internal: typed server functions used by the website.
- Public (Phase 20): read-only, versioned (`/v1`), rate-limited, keyed; exposes selected published data with provenance fields and methodology versions. Never exposes unapproved proposals, admin data, or archived source snapshots.
- Licensing/terms of the public API decided before Phase 20.

### 3.10 Source provenance
- `sources` are first-class records; facts link to sources via provenance links (many-to-many where needed).
- Provenance fields per `DATA_SOURCES.md` §3.
- UI shows source links, tier, and dates next to facts.

### 3.11 Historical data
See §7.

---

## 4. Data layer structure (conceptual)

| Zone | Contents | Mutability |
|---|---|---|
| Catalog | providers, model families, model versions, releases, aliases, capabilities | Versioned (effective-dated) |
| Measurements | benchmarks, benchmark versions, harnesses, evaluation configurations, evaluation runs, benchmark results | Append-only with supersession |
| Commercial | pricing records, channels | Append-only, effective-dated |
| Provenance | sources, provenance links, snapshots | Append-only |
| Editorial | announcements/news items, guides | Versioned |
| Derived | ranking categories, methodology versions, ranking snapshots, derived scores | Immutable snapshots |
| Workflow | ingestion jobs, proposed changes, review decisions | Append-only log |
| Audit | audit log of all writes | Append-only |

Physical schema is Phase 2 work.

---

## 5. Environments

- `local` (developer machines), `preview` (per-branch deployments), `production`.
- Separate databases per environment; production data never copied into preview without review.
- Secrets managed by the hosting platforms; never committed.

---

## 6. Security (baseline)

- Principle of least privilege for service roles; service keys only in server-side/worker contexts.
- RLS on exposed tables; public role reads only published views.
- Admin protected by authentication and roles; audit on every write.
- Evaluation sandboxes isolated from production credentials and networks.
- Dependency and secret scanning in CI (Phase 1/22).

---

## 7. Historical data design

- **Effective dating**: records carry `valid_from` / `valid_to` (or equivalent) so the state at any past date can be reconstructed.
- **Supersession, not update**: a change inserts a new record and marks the previous one superseded, with reason and source.
- **Immutable snapshots**: ranking snapshots and methodology versions are never edited.
- **Lifecycle events**: model versions have an event history (announced, preview, GA, price change, deprecated, retired).
- Enables: performance over time, price change charts, ranking history, capability changes, and model lifecycle views.

---

## 8. Ingestion workflow

```
source → fetch → parse → normalize → detect change → validate → approve → publish
                                                        │           │
                                                   auto checks   human review
```

- Each stage persists its output so a proposal can be traced back to raw fetched content.
- AI-assisted parsing, if used, is versioned and its outputs are proposals only.
- Publish emits events: cache invalidation, ranking recomputation, news item creation.
- Detailed rules: `DATA_SOURCES.md` §7.

---

## 9. Evaluation infrastructure principles

See `METHODOLOGY.md` §13. Architectural requirements: reproducible environment images, versioned harnesses and suites, isolated execution, complete artifact capture, budget controls, and results entering the standard results model.

---

## 10. Observability

- Structured logs for workers and API; error tracking for web and workers.
- Pipeline dashboards: fetch success, proposals pending, approval latency, staleness.
- Alerting on failed scheduled jobs and ranking computation failures.

---

## 11. Testing strategy (future phases)

- Unit tests for pure logic (normalization, comparability checks, ranking math, pricing calculations).
- Integration tests for database access, migrations, and ingestion stages (with recorded fixtures, never live production data).
- Golden tests for the ranking engine: fixed inputs → fixed snapshot.
- End-to-end tests for critical user flows and admin approval flows.
- Test fixtures are clearly synthetic and never presented or seeded as real data.

---

## 12. Known architectural concerns

Recorded rather than silently resolved (see `DECISIONS.md`):

1. Vercel's function execution limits are unsuitable for long-running ingestion and evaluation work; workers need a separate compute platform (D-007, D-008).
2. Evaluation sandboxes executing model-generated code must not share infrastructure or credentials with production (D-008).
3. Supabase is a managed Postgres; the schema should avoid unnecessary lock-in to Supabase-specific features so the database can be moved if needed (D-005).
4. Admin placement (same app vs separate) affects security boundary and deployment (open in D-009).
