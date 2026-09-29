# NFAI Labs — Project Phases & Roadmap

| Field | Value |
|---|---|
| Document | Phases & Roadmap |
| Phase | Phase 0 — Product Specification & Architecture |
| Status | Approved by owner 2026-09-29 (Phase 0 baseline) |
| Current approved phase | **Phase 2 — Database & Data Architecture**: approved to begin by the owner on 2026-09-29 from the approved Phase 1 baseline `0baa9b1`. **Phase 2 acceptance is complete** (2026-09-29): every acceptance criterion is met, D-025 to D-030 are Accepted, and validation on a real Supabase development project passed. Phase 2 becomes the data baseline with the owner's Phase 2 commit. Phase 3 has not been approved to begin. Phase 1 is approved and closed (baseline `0baa9b1`). Phase 0 is approved and closed (baseline `4d3e2ef`). |
| Canonical branch | `main` (D-017) |
| Last updated | 2026-09-29 |

## How phases work

- Only the **currently approved phase** may be worked on (`AGENTS.md`).
- A phase is complete only when its **completion gate** is met and the owner explicitly approves moving on. Approval is recorded by updating "Current approved phase" above.
- Each phase ends with a structured report (phase, status, repository observed, files created/modified, key decisions, open questions, validation, git status, next phase).
- Scope changes to any phase require an entry in `DECISIONS.md`.
- Universal expectations for every phase from Phase 1 onward: CI passes (lint, type-check, tests), no fabricated data, sources recorded for external facts, docs updated when behavior changes, and no git commits/pushes by agents.

## Overview

| # | Phase | Primary outcome |
|---|---|---|
| 0 | Product Specification & Architecture | Written foundation |
| 1 | Application Foundation | Empty, tested Next.js app skeleton and tooling |
| 2 | Database & Data Architecture | Schema, migrations, history model |
| 3 | Admin & Data Management | Authenticated data entry with sources and approval |
| 4 | Provider & Model Catalog | Sourced catalog pages |
| 5 | Benchmark System | Benchmarks, versions, results with conditions |
| 6 | Ranking Engine | Use-case rankings with traceable scores |
| 7 | NFAI Index System | Optional decomposable composite indices |
| 8 | Model Comparison | Side-by-side compare with comparability flags |
| 9 | AI Finder | Task-to-model recommendations |
| 10 | AI Stack Builder | Workflow tool-combination recommendations |
| 11 | AI News & Update Aggregation | Sourced, summarized news |
| 12 | Automated Data Ingestion | Pipeline proposing changes for approval |
| 13 | Historical Tracking | Time-series and history views |
| 14 | NFAI Labs Benchmark Suite | Own reproducible evaluations |
| 15 | Game Development Benchmark | Game-dev-specific suite |
| 16 | Community & Real-World Results | Separated community evidence |
| 17 | Guides & Education | Original educational content |
| 18 | Search & Discovery | Site-wide search and navigation |
| 19 | Accounts & Personalization | User accounts and saved preferences |
| 20 | Public API | Versioned read API |
| 21 | Monetization | Sustainable revenue without compromising independence |
| 22 | Production Hardening | Security, performance, reliability readiness |

---

## Phase 0 — Product Specification & Architecture
- **Objective:** Establish the complete written foundation: product identity, areas, data concepts, methodology, sources, architecture, roadmap, decisions, and agent rules.
- **Scope:** `docs/MASTER_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/METHODOLOGY.md`, `docs/DATA_SOURCES.md`, `docs/PHASES.md`, `docs/DECISIONS.md`, `AGENTS.md`.
- **Out of scope:** Application code, dependency installation, database implementation, real data, benchmark selection, ranking weights, git commits/pushes.
- **Deliverables:** The seven documents above.
- **Dependencies:** None.
- **Acceptance criteria:** All 13 required topics covered; every phase has all required sections; decisions logged with required fields; no fabricated factual data; no application code.
- **Tests/review:** Document structure and cross-reference checks; owner review.
- **Completion gate:** Owner approves the documents and resolves or defers open questions in `DECISIONS.md`; owner commits the docs on `main`. **Status: approved by the owner on 2026-09-29** (open questions resolved; D-009 deferred to Phase 3). Baseline commit is performed by the owner.

## Phase 1 — Application Foundation
- **Objective:** Create a minimal, well-configured application skeleton with no product data.
- **Scope:** Next.js + React + TypeScript (strict) + Tailwind setup; linting, formatting, type-checking; test framework (unit + e2e harness); CI workflow; environment variable handling; base layout, navigation shell with placeholder routes for the product areas; design tokens; accessibility baseline. No worker or evaluation hosting provider is chosen in this phase (D-007, D-008).
- **Out of scope:** Database schema, real content or data, admin, rankings logic, authentication beyond scaffolding decisions.
- **Deliverables:** Running app locally and on a preview deployment; CI green; README with setup steps.
- **Dependencies:** Phase 0 approved; D-004, D-006 accepted.
- **Acceptance criteria:** Clean install and build; lint/type/test pass in CI; placeholder pages clearly marked as placeholders with no fake data; Lighthouse/accessibility baseline recorded.
- **Tests/review:** Smoke tests for routes; CI run; owner review of structure.
- **Completion gate:** Owner approval; baseline tooling documented.
- **Implementation status (2026-09-29): implementation complete, all acceptance criteria met, ready for owner approval.** Phase 1 is not closed until the owner approves it and commits the final Phase 1 baseline.
  - Built from Phase 0 baseline `4d3e2ef`. Implementation commit `03c3874`; lockfile fixes `34c8e45` and `0a64d9f`. Stack and tooling decisions D-019 to D-024 are Accepted.
  - Delivered: Next.js 16 App Router app in `src/`, strict TypeScript, Tailwind CSS v4 design tokens, responsive shell (header, desktop and mobile navigation, footer, skip link), foundation homepage, 12 product-area routes (10 placeholders plus Methodology and About), metadata/canonical/robots/sitemap foundation, `not-found`, `error`, and `global-error` handling, baseline security headers, ESLint, Prettier, Vitest test suite, GitHub Actions CI workflow, `.env.example`, `README.md`.
  - **CI:** GitHub Actions workflow `CI` is green for commit `0a64d9f` (run 36607887637, push event, 2026-09-29): install, lint, format check, typecheck, test, and build all succeeded.
  - **Preview deployment:** https://nfai-labs.vercel.app/ (Vercel). Validated on 2026-09-29: all 13 routes return 200 and render; unknown routes return 404 with the custom page; `robots.txt` disallows all and every page emits `noindex, nofollow` (D-024); `sitemap.xml` lists the 13 static routes with absolute URLs; security headers from D-023 are present (plus Vercel's HSTS); desktop and mobile navigation work (mobile menu opens, lists all areas, closes on navigation); no horizontal overflow at 375 px or 1280 px; no console errors on page loads; placeholder routes show the "Not yet available" notice; no model, provider, price, benchmark, or ranking data is present.
  - **Lighthouse baseline** (Lighthouse 13.5.0 CLI, mobile form factor with default simulated throttling, headless Microsoft Edge 154 (Chromium) on Windows 11, 2026-09-29, deployed site, median of 3 runs per route; scores were identical across runs):

    | Route | Performance | Accessibility | Best Practices | SEO |
    |---|---|---|---|---|
    | `/` | 100 | 100 | 100 | 66 |
    | `/methodology` | 100 | 100 | 100 | 66 |
    | `/models` | 100 | 100 | 100 | 66 |

    Findings: the only failing scored audit is SEO `is-crawlable`, caused by the intentional `noindex` and `robots.txt` disallow (D-024); SEO is expected to score 100 once indexing is enabled. Mobile metrics were FCP 0.8 s, LCP 1.5 to 1.6 s, TBT 10 to 20 ms, CLS 0, Speed Index 0.8 s. Lighthouse checks are automated and cover only part of accessibility; they are not a WCAG conformance audit.
  - **Performance budgets** (mobile Lighthouse, deployed site), based on Core Web Vitals "good" thresholds: Performance score ≥ 90, LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms. The Phase 1 baseline is within all of them.
  - Validated locally: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build` all pass.
  - Deferred by accepted decision: end-to-end browser tests (D-022) and a Content-Security-Policy (D-023).
  - **Approved and closed by the owner on 2026-09-29** (baseline `0baa9b1`), when the owner started Phase 2 from that baseline.

## Phase 2 — Database & Data Architecture
- **Objective:** Implement the physical data model reflecting `MASTER_SPEC.md` §3 with history and provenance.
- **Scope:** Supabase project setup; SQL migrations for catalog, measurements, pricing, provenance, derived, workflow, and audit zones; effective-dating and supersession; RLS policies; typed data-access layer; synthetic test fixtures.
- **Out of scope:** Admin UI, real data entry, ingestion, ranking computation.
- **Deliverables:** Migrations, schema documentation (ERD), data-access layer, fixtures clearly marked synthetic.
- **Dependencies:** Phase 1; D-005, D-010 accepted.
- **Acceptance criteria:** Benchmark results cannot be stored without an exact model version, benchmark version, configuration, and source; pricing changes create new records; state-at-date queries work; RLS prevents public access to unpublished data.
- **Tests/review:** Migration up/down tests; constraint tests; history query tests; RLS tests.
- **Completion gate:** Owner approves schema as the data baseline.
- **Status (2026-09-29): acceptance complete; approved by the owner.** The schema becomes the data baseline with the owner's Phase 2 commit. Built from Phase 1 baseline `0baa9b1`. D-025 to D-030 are Accepted (D-028 in its revised form: only T1–T3 support satisfies the publication gate; no T4 override in Phase 2). Schema reference and conventions: `DATABASE.md`.
  - Delivered: Supabase project structure (`supabase/config.toml` for local use, migrations `0001` to `0005`, synthetic `seed.sql`); catalog, measurement, pricing, provenance, lifecycle/supersession, publication-event and audit tables; RLS and grants with a self-audit; typed data-access layer in `src/lib/data` with hand-written row types in `src/types/database`; synthetic fixtures in `src/test/fixtures/database`; database test harness in `src/test/db`.
  - Acceptance criteria: a benchmark result cannot be stored without an exact model version, benchmark version and metric, and evaluation configuration, and cannot be validated or published without a qualifying source; published prices cannot be edited, and a price change is a new record with the old period closed; published effective periods cannot overlap, so state-at-date queries return one answer; RLS hides draft, extracted, validated and rejected records and all internal tables from `anon` and `authenticated`, and denies them every write. Each is covered by tests in `src/test/db/integration.db.test.ts` and `src/lib/data/data-layer.db.test.ts`.
  - Tests/review mapping: migration up/down is validated by rebuilding a fresh database from all migrations on every run (D-026); constraint, history-query and RLS tests run against real SQL in PGlite (D-025) in `npm test` and CI, with no credentials.
  - Validated locally: `npm run validate` (lint, typecheck, format check, 162 tests, build) passes; `npm run test:db` 61 database tests pass, including the provenance-gate tests (`provenance-gate.db.test.ts`) and the remote acceptance script run against PGlite (`remote-checks.db.test.ts`).
  - **Remote Supabase validation: passed (2026-09-29, run by the owner).** Development project NFAI Labs Dev (ref `teaohntkuuqrenqfjmqh`), PostgreSQL 17: migrations `0001`–`0005` and the synthetic seed applied successfully; 29 public tables exist; RLS enabled on all 29; `nfai_security_audit()` returned 0 findings. HTTP/API validation (`supabase/validation/api_checks.mjs`): 10/10 checks passed. Details: `DATABASE.md` §8.1.
  - Supabase advisor notes (non-blocking, `DATABASE.md` §9): informational "RLS enabled, no policy" on the four intentionally internal tables (`audit_log`, `fact_tables`, `publication_events`, `source_archives`); unindexed foreign-key notices recorded for a future performance review; unused-index notices expected on a new database, and no indexes were removed.
  - Out of scope and not started: admin, real data, ingestion, ranking computation, Phase 3.

## Phase 3 — Admin & Data Management
- **Objective:** Let authorized people create, source, review, and approve data.
- **Scope:** Authentication; roles; CRUD for catalog/benchmark/pricing entities as proposals; source attachment; approval workflow; audit log viewer; D-009 decision.
- **Out of scope:** Automated ingestion, public-facing features beyond existing shell.
- **Deliverables:** Admin application; role and approval policies documented.
- **Dependencies:** Phase 2.
- **Acceptance criteria:** No fact can be published without a source and approval; every write is audited; unauthorized users cannot access admin.
- **Tests/review:** Auth/role tests; approval flow e2e; audit completeness tests; security review of admin surface.
- **Completion gate:** Owner approval; admin security checklist passed.

## Phase 4 — Provider & Model Catalog
- **Objective:** Publish sourced provider and model version pages.
- **Scope:** Source registry entries for providers; provider pages; model family grouping; exact model version pages (identity, releases, capabilities, limits, pricing); alias tracking; first real data entered via admin with T1 sources.
- **Out of scope:** Benchmarks, rankings, compare.
- **Deliverables:** Providers and Models areas live with an initial, owner-approved set of providers/models.
- **Dependencies:** Phase 3.
- **Acceptance criteria:** Every displayed fact shows source and date; no family-level facts presented as version facts; unknowns shown as unknown.
- **Tests/review:** Page rendering tests; data-integrity checks (every fact has provenance); sampled manual source verification.
- **Completion gate:** Owner approves initial catalog scope and sampled accuracy.

## Phase 5 — Benchmark System
- **Objective:** Record benchmarks, versions, harnesses, configurations, and results.
- **Scope:** Initial benchmark selection against `METHODOLOGY.md` §2 (each recorded in `DECISIONS.md`); benchmark pages; result entry with origin type, configuration, reproducibility grade, contamination flags; comparability logic.
- **Out of scope:** Rankings and derived scores.
- **Deliverables:** Benchmarks area; results shown on model pages grouped by comparable conditions.
- **Dependencies:** Phase 4.
- **Acceptance criteria:** Non-comparable results never appear merged; vendor-reported results labeled; each result traceable to source.
- **Tests/review:** Unit tests for comparability rules; data validation tests; sampled source verification.
- **Completion gate:** Owner approves initial benchmark set and inclusion rationale.

## Phase 6 — Ranking Engine
- **Objective:** Produce use-case-specific rankings with fully traceable derived scores.
- **Scope:** Category definitions; input selection, normalization, weights via `METHODOLOGY.md` §11.3; coverage rules; sensitivity analysis; deterministic batch engine; immutable ranking snapshots; Rankings area with explanations.
- **Out of scope:** Composite cross-category index (Phase 7).
- **Deliverables:** Ranking engine, snapshots, Rankings pages, methodology version 1.0.0.
- **Dependencies:** Phase 5; D-012, D-013 accepted.
- **Acceptance criteria:** Any score can be decomposed to inputs and sources in the UI; identical inputs produce identical outputs; insufficient-data models are not ranked.
- **Tests/review:** Golden tests; property tests for normalization; sensitivity reports reviewed; methodology review.
- **Completion gate:** Owner approves each launched category's definition and weights (recorded in `DECISIONS.md`).

## Phase 7 — NFAI Index System
- **Objective:** Optionally provide composite indices that summarize multiple categories, without becoming a universal "best AI" score.
- **Scope:** Decide whether indices are warranted; if so, define decomposable indices (e.g. per audience), labeling, and traceability.
- **Out of scope:** Replacing category rankings as the primary product.
- **Deliverables:** Decision record; if approved, index definitions, computation, and pages.
- **Dependencies:** Phase 6.
- **Acceptance criteria:** Each index is decomposable and labeled NFAI-derived; category rankings remain primary in navigation.
- **Tests/review:** Golden tests; methodology review.
- **Completion gate:** Owner approval of index definitions or of decision not to ship.

## Phase 8 — Model Comparison
- **Objective:** Let users compare exact model versions side by side.
- **Scope:** Compare UI for two or more versions across capabilities, pricing, limits, benchmark results, rankings; non-comparability flags; shareable URLs.
- **Out of scope:** Recommendations (Phase 9).
- **Deliverables:** Compare area.
- **Dependencies:** Phases 4–6.
- **Acceptance criteria:** Incomparable results are separated or flagged; all values sourced.
- **Tests/review:** Unit tests for comparison assembly; e2e for compare flows.
- **Completion gate:** Owner approval.

## Phase 9 — AI Finder
- **Objective:** Recommend models for a user's task and constraints, with explanations.
- **Scope:** Task/constraint intake; mapping to categories and filters; explainable recommendation logic based on stored data; usage guidance.
- **Out of scope:** Multi-tool stacks (Phase 10); unexplainable generative recommendations.
- **Deliverables:** AI Finder area; documented recommendation logic.
- **Dependencies:** Phases 6 and 8.
- **Acceptance criteria:** Every recommendation shows why, citing categories, data, and trade-offs; recommendations are reproducible for identical inputs and data.
- **Tests/review:** Scenario tests with synthetic data; review of recommendation explanations.
- **Completion gate:** Owner approval.

## Phase 10 — AI Stack Builder
- **Objective:** Recommend combinations of AI tools for larger workflows.
- **Scope:** Workflow templates (e.g. software project, research, game development); role-based component selection; cost estimation from pricing records with stated assumptions.
- **Out of scope:** Any sponsored or affiliate influence on stack recommendations. Sponsored/affiliate elements, if ever added, must be disclosed and structurally separated from recommendation logic (D-015).
- **Deliverables:** Stack Builder area.
- **Dependencies:** Phase 9.
- **Acceptance criteria:** Each component's role and rationale shown; cost assumptions explicit; only catalog tools used.
- **Tests/review:** Cost calculation unit tests; scenario reviews.
- **Completion gate:** Owner approval.

## Phase 11 — AI News & Update Aggregation
- **Objective:** Publish structured summaries of important official AI news linked to catalog records.
- **Scope:** Announcement records; manual/assisted summarization in NFAI's own words; linking to affected models/providers; News area.
- **Out of scope:** Automated fetching at scale (Phase 12); republishing articles.
- **Deliverables:** News area and editorial workflow.
- **Dependencies:** Phase 3, Phase 4.
- **Acceptance criteria:** Every item links to an original T1/T2 source; summaries are original; approvals recorded.
- **Tests/review:** Content policy review; link checks.
- **Completion gate:** Owner approval of editorial policy.

## Phase 12 — Automated Data Ingestion
- **Objective:** Automate source → fetch → parse → normalize → detect change → validate → approve → publish.
- **Scope:** Worker hosting provider selected by a new owner-approved decision (requirement per D-007); source registry scheduling; parsers; change detection; validation rules; review queue integration; monitoring.
- **Out of scope:** Auto-publishing without approval (unless a later decision permits specific low-risk classes).
- **Deliverables:** Running ingestion pipeline for an approved initial set of sources.
- **Dependencies:** Phases 3, 4, 5, 11.
- **Acceptance criteria:** Proposals traceable to raw fetched content; no unapproved publication; polite fetching and terms compliance.
- **Tests/review:** Parser tests on recorded fixtures; pipeline integration tests; failure/retry tests.
- **Completion gate:** Owner approval after a monitored trial period.

## Phase 13 — Historical Tracking
- **Objective:** Surface history: performance over time, price changes, ranking history, capability changes, lifecycle.
- **Scope:** History views and charts; state-at-date queries; changelogs per model.
- **Out of scope:** Modifying past records.
- **Deliverables:** History features across Models, Rankings, Benchmarks.
- **Dependencies:** Phases 2, 6.
- **Acceptance criteria:** Cross-version trends never joined when incomparable; historical views reproducible.
- **Tests/review:** History query tests; chart data tests.
- **Completion gate:** Owner approval.

## Phase 14 — NFAI Labs Benchmark Suite
- **Objective:** Run NFAI's own reproducible evaluations for software engineering, coding, agentic, and repository-level tasks.
- **Scope:** Isolated evaluation infrastructure (D-008); suite design; environment images; harness; scoring; artifact storage; budget controls; publication through approval.
- **Out of scope:** Game-dev-specific suite (Phase 15).
- **Deliverables:** Suite v1, methodology report, first published results.
- **Dependencies:** Phases 5, 6.
- **Acceptance criteria:** Runs reproducible from recorded versions; held-out tasks private; variance reported.
- **Tests/review:** Harness tests; reproducibility re-runs; external methodology review where possible.
- **Completion gate:** Owner approval of suite baseline.

## Phase 15 — Game Development Benchmark
- **Objective:** Evaluate models on game development tasks.
- **Scope:** Game-dev tasks (mechanics, bug fixes, prototypes); automated behavior tests; separated subjective scoring if any.
- **Out of scope:** Non-game suites.
- **Deliverables:** Game Development suite v1; feeds Game Development ranking.
- **Dependencies:** Phase 14.
- **Acceptance criteria:** Same reproducibility standards as Phase 14.
- **Tests/review:** As Phase 14.
- **Completion gate:** Owner approval.

## Phase 16 — Community & Real-World Results
- **Objective:** Collect real-world usage evidence without contaminating controlled results.
- **Scope:** Submission design, moderation, anti-abuse, separate presentation, privacy.
- **Out of scope:** Mixing community results into controlled rankings.
- **Deliverables:** Community results feature and policy.
- **Dependencies:** Phases 3, 19 (if accounts required).
- **Acceptance criteria:** Community data always labeled and separated; moderation in place.
- **Tests/review:** Abuse and moderation tests; privacy review.
- **Completion gate:** Owner approval of policy.

## Phase 17 — Guides & Education
- **Objective:** Publish original educational guides.
- **Scope:** Guide content model; editorial workflow; linking guides to live catalog data.
- **Out of scope:** Copied tutorials.
- **Deliverables:** Guides area with initial set.
- **Dependencies:** Phase 4 onward.
- **Acceptance criteria:** Factual claims link to catalog data or sources; content original.
- **Tests/review:** Editorial review; link checks.
- **Completion gate:** Owner approval.

## Phase 18 — Search & Discovery
- **Objective:** Help users find models, benchmarks, rankings, news, and guides.
- **Scope:** Site-wide search, filters, related content, navigation improvements.
- **Out of scope:** Personalization (Phase 19).
- **Deliverables:** Search feature.
- **Dependencies:** Content areas populated.
- **Acceptance criteria:** Relevant results for defined query test set; performance budget met.
- **Tests/review:** Search relevance tests; performance tests.
- **Completion gate:** Owner approval.

## Phase 19 — Accounts & Personalization
- **Objective:** Optional user accounts with saved comparisons, preferences, and alerts.
- **Scope:** Auth for public users; saved items; notification preferences; privacy controls; data export/deletion.
- **Out of scope:** Paid features (Phase 21).
- **Deliverables:** Account features and privacy policy updates.
- **Dependencies:** Phases 1–3.
- **Acceptance criteria:** Privacy requirements met; account data isolated from catalog data.
- **Tests/review:** Auth and privacy tests; security review.
- **Completion gate:** Owner approval.

## Phase 20 — Public API
- **Objective:** Expose selected published data programmatically.
- **Scope:** Versioned read-only API with provenance fields; keys; rate limits; documentation; API terms and a new licensing decision (current baseline: all rights reserved, D-018).
- **Out of scope:** Write APIs; unpublished data.
- **Deliverables:** API v1 and docs.
- **Dependencies:** New API licensing/terms decision approved (supersedes or extends D-018); data areas stable.
- **Acceptance criteria:** Only approved data exposed; provenance included; rate limits enforced.
- **Tests/review:** Contract tests; load tests; security review.
- **Completion gate:** Owner approval.

## Phase 21 — Monetization
- **Objective:** Establish sustainable revenue without compromising independence.
- **Scope:** Monetization options within D-015 (e.g. API tiers, pro features, disclosed and separated sponsored or affiliate content); disclosure policy.
- **Out of scope:** Any mechanism that alters data, rankings, or recommendations.
- **Deliverables:** Approved monetization model and implementation.
- **Dependencies:** D-015 (accepted); Phases 19–20 as applicable.
- **Acceptance criteria:** Independence policy enforced and disclosed.
- **Tests/review:** Billing tests; policy review.
- **Completion gate:** Owner approval.

## Phase 22 — Production Hardening
- **Objective:** Ensure security, performance, reliability, and operational readiness at scale.
- **Scope:** Security audit, penetration testing, backups/restore drills, observability, incident response, performance and cost optimization, accessibility audit.
- **Out of scope:** New product features.
- **Deliverables:** Hardening report, runbooks, SLOs.
- **Dependencies:** Features intended for launch are complete.
- **Acceptance criteria:** Defined SLOs met; restore tested; critical findings resolved.
- **Tests/review:** Load, failover, and security testing.
- **Completion gate:** Owner sign-off for production readiness.

> Note: Phase 22 is listed last, but baseline security and quality practices apply from Phase 1. Hardening items may be pulled earlier by recorded decision.
