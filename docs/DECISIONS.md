# NFAI Labs — Decision Log

| Field | Value |
|---|---|
| Document | Decision Log |
| Phase | Phase 0 — Product Specification & Architecture (D-001 to D-018); Phase 1 — Application Foundation (D-019 to D-024); Phase 2 — Database & Data Architecture (D-025 to D-030); Phase 3 — Admin & Data Management (D-009 resolution, D-031 onward) |
| Last updated | 2026-09-29 |

Architectural and product decisions are recorded here. Major decisions are never made silently.

**Status values:** `Proposed` (awaiting owner approval), `Accepted`, `Open` (needs a decision; not yet proposed as settled), `Superseded` (replaced by a later decision, linked), `Rejected`.

**Rules:**
- New decisions get the next ID. IDs are never reused.
- Accepted decisions are not edited in substance; to change one, add a new decision that supersedes it and update the old one's status.
- Phase 0 was approved by the owner on 2026-09-29. All Phase 0 decisions are `Accepted` except D-009, which remains `Open` and is deferred to Phase 3.
- Phase 1 decisions D-019 to D-024 were accepted by the owner on 2026-09-29 during Phase 1 final acceptance.
- Phase 2 decisions D-025 to D-030 were accepted by the owner on 2026-09-29 during Phase 2 final acceptance. D-028 was accepted in its revised form (T4-only evidence never satisfies the publication gate).
- Phase 3 (approved to begin by the owner on 2026-09-29): the D-009 resolution and D-031 to D-035 are `Proposed` until the owner accepts Phase 3. Implementation proceeds on them.

## Index

| ID | Title | Status |
|---|---|---|
| D-001 | Strict phase-gated development | Accepted |
| D-002 | No universal "best AI" score as the primary product | Accepted |
| D-003 | Results attach to exact model/version plus configuration | Accepted |
| D-004 | Frontend stack: Next.js, React, TypeScript, Tailwind CSS | Accepted |
| D-005 | Database: PostgreSQL via Supabase, minimizing lock-in | Accepted |
| D-006 | Web hosting on Vercel | Accepted |
| D-007 | Background workers run outside Vercel functions | Accepted |
| D-008 | Evaluation infrastructure is isolated from the web platform | Accepted |
| D-009 | Admin system placement | Proposed (Phase 3 resolution) |
| D-010 | Append-only, effective-dated history for key records | Accepted |
| D-011 | Human approval before publishing ingested facts | Accepted |
| D-012 | Ranking weights set by documented process, not in Phase 0 | Accepted |
| D-013 | Versioned methodology and immutable ranking snapshots | Accepted |
| D-014 | Store structured facts and links, never copied content | Accepted |
| D-015 | Commercial independence and sponsorship policy | Accepted |
| D-016 | Git operations are performed only by the owner | Accepted |
| D-017 | Default branch is `main`; owner configures the remote | Accepted |
| D-018 | Repository and data licensing: all rights reserved | Accepted |
| D-019 | Runtime and package baseline: Node.js 22 LTS, npm, exact version pins | Accepted |
| D-020 | TypeScript 5.9 instead of TypeScript 6 or 7 | Accepted |
| D-021 | ESLint 9 retained despite end of support | Accepted |
| D-022 | Testing: Vitest, React Testing Library, jsdom | Accepted |
| D-023 | Baseline security headers; Content-Security-Policy deferred | Accepted |
| D-024 | Search indexing is opt-in while pages are placeholders | Accepted |
| D-025 | Phase 2 database tooling: supabase-js, no ORM, in-process PGlite for database tests | Accepted |
| D-026 | PostgreSQL 17 target and forward-only migrations | Accepted |
| D-027 | Seven-state publication lifecycle shared by every fact table | Accepted |
| D-028 | Provenance model and the publication provenance rule | Accepted |
| D-029 | Published effective periods may not overlap | Accepted |
| D-030 | Database access model: read-only public record, server-only service role | Accepted (extended by D-034) |
| D-031 | Approval model: standard and separated approval classes | Proposed |
| D-032 | Admin authentication: Supabase Auth, invitation only, cookie sessions | Proposed |
| D-033 | Admin identity: Auth user id as the permanent actor id | Proposed |
| D-034 | Admin writes and reads through SQL workflow functions called with the admin's own JWT | Proposed |
| D-035 | Minimal roles with permission checks in the database | Proposed |

---

## D-001 — Strict phase-gated development
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** The project scope is broad (catalog, benchmarks, rankings, tools, news, evaluations, API). Unbounded work risks building features on unstable foundations.
- **Decision:** Develop in the phases defined in `PHASES.md`. Work only on the currently approved phase; each phase has a completion gate requiring owner approval.
- **Rationale:** Keeps each layer stable before the next depends on it; makes review tractable.
- **Alternatives considered:** Feature-driven iteration without phases (faster early demos, higher rework risk); fewer, larger phases (less review granularity).
- **Consequences:** Some work that could be parallelized waits. Scope expansions require a recorded decision.

## D-002 — No universal "best AI" score as the primary product
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Model quality depends heavily on task; single scores hide trade-offs and invite misleading conclusions.
- **Decision:** Rankings are primarily use-case-specific. Any composite index (Phase 7) is secondary, labeled, and fully decomposable.
- **Rationale:** Directly serves the core question ("which AI for this task"); differentiates from simple leaderboards.
- **Alternatives considered:** A single headline score (simple, but misleading); no aggregation at all (honest but less useful).
- **Consequences:** More categories to maintain; each needs its own definition and evidence.

## D-003 — Results attach to exact model/version plus configuration
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Providers ship many versions and aliases; results for one snapshot are often misattributed to a family.
- **Decision:** Benchmark results, prices, and capabilities attach to exact model versions. Families and providers are groupings only. Evaluation configuration is stored with each result.
- **Rationale:** Accuracy and comparability.
- **Alternatives considered:** Family-level attribution (simpler UI, inaccurate).
- **Consequences:** More granular catalog; UI must roll up carefully without implying family-level results.

## D-004 — Frontend stack: Next.js, React, TypeScript, Tailwind CSS
- **Status:** Accepted (2026-09-29, Phase 0 approval; planned default, revisable by a superseding decision)
- **Context:** Owner's preferred direction. The site is content-heavy, SEO-sensitive, with interactive tools.
- **Decision:** Use Next.js (App Router) with React, strict TypeScript, and Tailwind CSS.
- **Rationale:** Strong static/incremental rendering for SEO and caching; mature ecosystem; type safety.
- **Alternatives considered:** Astro (excellent for content, weaker for app-like tools); Remix/React Router; SvelteKit.
- **Consequences:** Ties hosting ergonomics toward Vercel (not required). No serious problem identified.

## D-005 — Database: PostgreSQL via Supabase, minimizing lock-in
- **Status:** Accepted (2026-09-29, Phase 0 approval; planned default, revisable by a superseding decision)
- **Context:** Data is highly relational with history and provenance; needs auth and storage for admin and artifacts.
- **Decision:** PostgreSQL hosted on Supabase. Schema and migrations are plain SQL-compatible Postgres; Supabase-specific features (Auth, Storage, RLS policies) used deliberately and documented.
- **Rationale:** Relational integrity, strong querying for history, managed operations.
- **Alternatives considered:** Neon or RDS Postgres plus separate auth; document databases (poor fit for relational provenance).
- **Consequences:** Keeping migrations portable preserves the option to move providers. RLS must be designed carefully.

## D-006 — Web hosting on Vercel
- **Status:** Accepted (2026-09-29, Phase 0 approval; planned default, revisable by a superseding decision)
- **Context:** Owner's preferred direction; natural fit for Next.js.
- **Decision:** Host the public website (and, depending on D-009, admin) on Vercel.
- **Rationale:** Preview deployments, CDN, incremental revalidation.
- **Alternatives considered:** Self-hosting Next.js on a container platform; Netlify; Cloudflare.
- **Consequences:** See D-007 and D-008: Vercel is suited to the web tier but not to long-running workers or sandboxed evaluations.

## D-007 — Background workers run outside Vercel functions
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Architectural concern identified in Phase 0: ingestion (fetching, parsing, retries) and ranking recomputation can exceed serverless execution time limits and need queues, retries, and idempotency.
- **Decision:** Run ingestion workers and heavier scheduled jobs on a dedicated worker platform (candidate options listed below). Vercel Cron MAY be used only as a lightweight trigger.
- **Rationale:** Reliability of long-running, retryable jobs; separation from user-facing latency.
- **Alternatives considered:** Vercel functions only (time limits, weak retry semantics); Supabase Edge Functions + pg_cron (viable for light jobs); a managed job/queue service; a container platform running Node workers.
- **Consequences:** An additional platform to operate. The owner approved the architectural requirement (long-running ingestion workers run separately from the Vercel-hosted web application where required). **No worker hosting provider has been chosen; selection is deferred to a later phase and requires a new decision approved by the owner.** This does not change the preferred stack for the website.

## D-008 — Evaluation infrastructure is isolated from the web platform
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** NFAI's own benchmarks will execute model-generated code and long agentic runs.
- **Decision:** Evaluations run in isolated sandboxes (containers/VMs) on separate infrastructure, with no production secrets and controlled network access. Results enter the normal approval flow.
- **Rationale:** Security, reproducibility, and runtime needs.
- **Alternatives considered:** Running evaluations in serverless functions (unsafe and time-limited); running on developer machines (not reproducible).
- **Consequences:** Separate infrastructure cost and operations from Phase 14 onward. The owner approved the isolation requirement; **no evaluation hosting provider has been chosen**, and selection is deferred to Phase 14 and requires a new decision approved by the owner.

## D-009 — Admin system placement
- **Status:** Proposed (Phase 3 resolution, 2026-09-29; was Open, deferred to Phase 3 by the owner). The owner's Phase 3 brief named this as the preferred default.
- **Context:** Admin can live inside the main Next.js app behind authentication, or as a separate app/deployment. Phase 3 fixed the role model (D-035), authentication (D-032) and a database-enforced write path (D-034), so the security boundary no longer depends on which deployment serves the pages.
- **Decision:** Admin lives in the same Next.js application under `/admin`. Public pages move into a `src/app/(site)` route group with the public header and footer; `/admin` has its own layout without public navigation. Every admin page and action checks the session and permission on the server; the Next.js proxy (`src/proxy.ts`) only refreshes sessions and redirects anonymous requests and is never the only check. `/admin` is `noindex`, disallowed in `robots.txt`, absent from the sitemap and rendered dynamically. Contract: `ADMIN.md`.
- **Rationale:** One codebase, one deployment and shared components; the real protection is in the database (D-034), which a separate deployment would not strengthen. A second app would add build, auth and deployment overhead for a team of one or a few people.
- **Alternatives considered:** Separate app or deployment (stronger network isolation, more overhead; can be revisited in Phase 22 if the admin surface grows); separate repository (rejected: duplicated schema and types).
- **Consequences:** The public deployment serves admin routes, so admin pages must never be statically cached, and the admin surface is part of the Phase 22 security audit. URLs of public pages are unchanged.

## D-010 — Append-only, effective-dated history for key records
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Price changes, result corrections, and ranking changes are core product value.
- **Decision:** Pricing, benchmark results, capabilities, releases, rankings, and methodology are append-only or versioned with effective dates; corrections supersede rather than delete.
- **Rationale:** Enables history features and auditability.
- **Alternatives considered:** Overwrite with audit log only (harder to query history).
- **Consequences:** Queries must select "current" records explicitly; schema complexity increases.

## D-011 — Human approval before publishing ingested facts
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Automated and AI-assisted extraction can misread sources.
- **Decision:** Ingested changes are proposals; publication requires validation and human approval. Any auto-approval for low-risk classes requires a separate recorded decision with audit sampling.
- **Rationale:** Trust is the product.
- **Alternatives considered:** Auto-publish with later correction (faster, erodes trust).
- **Consequences:** Review workload; admin tooling must make review efficient.

## D-012 — Ranking weights set by documented process, not in Phase 0
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Weights chosen without evidence would be arbitrary.
- **Decision:** No weights are finalized in Phase 0. Weights are set per category in Phase 6 using `METHODOLOGY.md` §11.3, with equal weighting as the documented default absent stronger justification.
- **Rationale:** Explainability and defensibility.
- **Alternatives considered:** Adopting weights from another leaderboard (inherits unknown biases).
- **Consequences:** Rankings cannot ship until Phase 6 decisions are recorded.

## D-013 — Versioned methodology and immutable ranking snapshots
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Methodology changes can reorder rankings; users need to know why a ranking changed.
- **Decision:** Methodology is semantically versioned; ranking snapshots record the version and are never recomputed in place.
- **Rationale:** Traceability and honest history.
- **Alternatives considered:** Always showing only the latest computation.
- **Consequences:** Storage of snapshots; UI for history.

## D-014 — Store structured facts and links, never copied content
- **Status:** Accepted (2026-09-29, Phase 0 approval)
- **Context:** Legal and ethical constraints; value is in structure and provenance.
- **Decision:** Store facts, original summaries, provenance, and links. No wholesale copying of articles, docs, datasets, or leaderboards.
- **Rationale:** Respect for sources; defensible product.
- **Alternatives considered:** Mirroring sources (legal risk, low added value).
- **Consequences:** Internal evidence snapshots are stored privately only.

## D-015 — Commercial independence and sponsorship policy
- **Status:** Accepted (2026-09-29, owner resolution)
- **Context:** Phase 21 (Monetization) could introduce sponsorship, affiliate links, or paid API tiers.
- **Decision:** Sponsored or affiliate content MAY be allowed in the future, but it MUST be clearly disclosed and structurally separated from NFAI rankings, benchmark scores, methodology, recommendations (including AI Finder and AI Stack Builder outputs), and editorial evaluation. Payment, sponsorship, affiliate relationships, or commercial partnerships MUST NEVER alter or influence NFAI benchmark results, rankings, derived scores, or methodology.
- **Rationale:** Trust and independence are the product; disclosure and structural separation allow future revenue without compromising them.
- **Alternatives considered:** No sponsorship ever (simplest, forgoes revenue); unlabeled affiliate links in recommendations (rejected: compromises independence).
- **Consequences:** Stack Builder, Finder, and News must keep any sponsored/affiliate elements visually and structurally separate from recommendation and ranking logic; ranking and recommendation code must not read commercial-relationship data. Specific monetization mechanisms are decided in Phase 21.

## D-016 — Git operations are performed only by the owner
- **Status:** Accepted (explicit owner instruction)
- **Context:** Owner (Nicolas Familia, `NickyBFam`) requires personal control of repository history.
- **Decision:** Agents do not commit, push, create pull requests, or change Git identity configuration. No AI attribution or co-author trailers in any file, commit, or metadata.
- **Rationale:** Owner instruction.
- **Alternatives considered:** None.
- **Consequences:** Agents leave changes in the working tree and report them.

## D-017 — Default branch is `main`; owner configures the remote
- **Status:** Accepted (2026-09-29, owner resolution)
- **Context:** The local repository at Phase 0 was on branch `master` with no commits and no configured remote. The intended remote is `https://github.com/NickyBFam/NFAILabs.git`.
- **Decision:** The canonical/default branch is `main`. The owner personally configures the Git remote and performs all branch changes, commits, and pushes. Agents do not perform Git write operations (see D-016).
- **Rationale:** Common convention; Git write operations belong to the owner.
- **Alternatives considered:** `master` (current local default at initialization).
- **Consequences:** Documentation and future CI configuration reference `main`. Renaming the local branch and adding the remote are owner actions.

## D-018 — Repository and data licensing: all rights reserved
- **Status:** Accepted (2026-09-29, owner resolution)
- **Context:** No license file exists. Code, documentation, and (future) data/API may need different licenses.
- **Decision:** The repository, documentation, and data are all rights reserved. No open-source or open-data license is added unless the owner explicitly approves one later via a new decision.
- **Rationale:** Owner instruction; keeps options open.
- **Alternatives considered:** Permissive code license with separate data terms; open data license for selected datasets.
- **Consequences:** Agents must not add `LICENSE` files or license headers. Public API terms (Phase 20) require a new licensing decision.

---

## D-019 — Runtime and package baseline: Node.js 22 LTS, npm, exact version pins
- **Status:** Accepted (2026-09-29, Phase 1 final acceptance)
- **Context:** Phase 1 creates the application. The local development environment has Node.js 22.20.0 and npm 11.6.2. Node.js 24 is also an LTS line. Phase 0 did not fix a package manager.
- **Decision:** Target Node.js 22 LTS (`engines`: `^22.13.0 || >=24.0.0`; `.nvmrc` = `22`) and use npm with a committed `package-lock.json`. All dependencies are pinned to exact versions (no `^` ranges): Next.js 16.3.7, React 19.3.0, Tailwind CSS 4.3.3, TypeScript 5.9.3, ESLint 9.39.5, Vitest 5.0.2. The minimum of 22.13 comes from jsdom 29's engine requirement.
- **Rationale:** Node 22 matches the local environment and is supported by every chosen tool; npm needs no extra tooling; exact pins make installs and CI deterministic and upgrades deliberate.
- **Alternatives considered:** Node.js 24 (newer LTS, but not installed locally; allowed by `engines`); pnpm (faster, but an extra tool with no Phase 1 benefit); caret ranges (less deterministic).
- **Consequences:** Dependency upgrades are explicit changes. Moving CI to Node 24 is a one-line change to `.nvmrc`. jsdom 30 was not used because it requires Node ^22.22.2.

## D-020 — TypeScript 5.9 instead of TypeScript 6 or 7
- **Status:** Accepted (2026-09-29, Phase 1 final acceptance)
- **Context:** npm lists TypeScript 7.0.2 (the native compiler) and 6.0.3 as newer releases. Next.js type checking during build and typescript-eslint rely on the TypeScript JavaScript API.
- **Decision:** Use TypeScript 5.9.3 in strict mode with `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`.
- **Rationale:** 5.9 is the release line the Next.js 16 and typescript-eslint toolchain is known to support; compatibility of 6.x/7.x with that toolchain was not verified in Phase 1.
- **Alternatives considered:** TypeScript 7 (fast native compiler, compatibility risk with tooling that uses the compiler API); TypeScript 6 (transition release, unverified with the toolchain).
- **Consequences:** Revisit when Next.js and typescript-eslint document support for newer TypeScript lines.

## D-021 — ESLint 9 retained despite end of support
- **Status:** Accepted (2026-09-29, Phase 1 final acceptance; temporary compatibility constraint)
- **Context:** npm reports ESLint 9.39.5 as no longer supported; ESLint 10 is current. `eslint-config-next` 16.3.7 bundles `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-import`, whose peer ranges end at ESLint 9.
- **Decision:** Use ESLint 9.39.5 with the flat config (`eslint.config.mjs`) extending `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`, plus stricter rules (no `any`, no `@ts-` comment suppression, consistent type imports, no `dangerouslySetInnerHTML`, no unsafe `target="_blank"`).
- **Rationale:** Keeps the official Next.js lint rules (including accessibility rules) working without peer-dependency overrides.
- **Alternatives considered:** ESLint 10 with forced peer overrides (unsupported plugin combinations); dropping `eslint-config-next` (loses Next.js and accessibility rules).
- **Consequences:** A known tooling limitation. ESLint 9 is a **temporary compatibility constraint**, not a long-term choice: revisit and upgrade to ESLint 10 once the Next.js lint ecosystem (`eslint-config-next` and its bundled plugins) supports ESLint 10 cleanly, without peer-dependency overrides.

## D-022 — Testing: Vitest, React Testing Library, jsdom
- **Status:** Accepted (2026-09-29, Phase 1 final acceptance)
- **Context:** Phase 1 needs automated tests for shell behavior, configuration, components, and metadata routes. The Next.js documentation covers Vitest and Jest for unit tests.
- **Decision:** Use Vitest 5 with `@vitejs/plugin-react`, React Testing Library, `@testing-library/user-event`, `@testing-library/jest-dom`, and jsdom. Tests live next to the code as `*.test.ts(x)` files under `src/`. End-to-end browser tests are not added in Phase 1.
- **Rationale:** Fast, ESM-native, TypeScript without extra transpiler setup; the same runner will cover pure logic in later phases (ranking math, comparability rules).
- **Alternatives considered:** Jest (heavier ESM/TypeScript configuration); Playwright end-to-end tests now (useful later, adds browser setup to CI before there are real user flows).
- **Consequences:** Async Server Components cannot be unit tested with Vitest; such behavior will need end-to-end tests when it exists. Adding Playwright is deferred to a later phase.

## D-023 — Baseline security headers; Content-Security-Policy deferred
- **Status:** Accepted (2026-09-29, Phase 1 final acceptance)
- **Context:** Phase 1 requires safe defaults without building security infrastructure early.
- **Decision:** Send `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy` on all routes, and disable the `X-Powered-By` header. Defer a Content-Security-Policy.
- **Rationale:** These headers are low-risk and framework-independent. A strict CSP with Next.js needs nonces (which force dynamic rendering) or hash-based policies, and should be designed with the real script inventory.
- **Alternatives considered:** Nonce-based CSP now (would make every page dynamic); no headers.
- **Consequences:** CSP is to be designed no later than Phase 22 (Production Hardening), or earlier if third-party scripts are introduced.

## D-024 — Search indexing is opt-in while pages are placeholders
- **Status:** Accepted (2026-09-29, Phase 1 final acceptance)
- **Context:** All product areas are placeholders. Indexing thin, unfinished pages could mislead users and harm future search performance.
- **Decision:** Pages emit `noindex, nofollow` and `robots.txt` disallows all crawling unless `NFAI_ALLOW_INDEXING=true`. Canonical URLs are self-referencing and resolved against `NEXT_PUBLIC_SITE_URL` (falling back to Vercel's production URL, then localhost). `sitemap.xml` lists static routes only.
- **Rationale:** Prevents premature indexing while keeping the SEO foundation ready to switch on.
- **Alternatives considered:** Index everything now; per-page indexing flags (unnecessary until pages have real content).
- **Consequences:** The owner decides when to enable indexing, likely once Phase 4 content exists.

---

## D-025 — Phase 2 database tooling: supabase-js, no ORM, in-process PGlite for database tests
- **Status:** Accepted (2026-09-29, owner approval during Phase 2 final acceptance)
- **Context:** Phase 2 needs a typed data-access layer and real tests of constraints, triggers, history rules and Row Level Security. The development machine has neither Docker nor a local PostgreSQL, so the Supabase CLI local stack (`supabase start`) cannot run there, and CI must not need credentials.
- **Decision:** Add `@supabase/supabase-js` 2.117.2 (the official client) and `server-only` 0.0.1 as runtime dependencies, and `@electric-sql/pglite` 0.5.8 as a development dependency. No ORM or query builder. Database tests (`*.db.test.ts`, Vitest project `db`) run every migration in PGlite, an in-process PostgreSQL, after a test-only stand-in for Supabase's API roles, default privileges and `auth.*` functions (`src/test/db/supabase-shim.sql`). The Supabase CLI is not a dependency; it is run with `npx supabase` where Docker is available. Row types are hand-written in `src/types/database` until generation is possible, and a database test fails if they drift from the migrations. `server-only` is aliased to a no-op in Vitest only.
- **Rationale:** Real SQL semantics (RLS, triggers, deferred constraints, exclusion constraints) are tested deterministically with no network, Docker or secrets, locally and in CI. supabase-js is the official, lightweight client; an ORM would duplicate the schema and hide RLS behaviour.
- **Alternatives considered:** Supabase CLI local stack in CI (needs Docker; heavier; not runnable on the owner's machine today); a PostgreSQL service container in CI only (local and CI tests would differ); mocking the database (cannot test RLS or triggers); an ORM such as Prisma or Drizzle (extra schema layer, weaker fit with RLS).
- **Consequences:** PGlite runs PostgreSQL 18 while Supabase targets 17, so migrations must avoid PostgreSQL 18-only features (D-026). The shim is not Supabase itself: behaviour specific to PostgREST or Supabase Auth still needs a check against a real Supabase stack before production use (recorded as a known limitation).

## D-026 — PostgreSQL 17 target and forward-only migrations
- **Status:** Accepted (2026-09-29, owner approval during Phase 2 final acceptance)
- **Context:** Supabase migrations are forward-only; `PHASES.md` Phase 2 lists "migration up/down tests".
- **Decision:** Target PostgreSQL 17 (`supabase/config.toml` `major_version = 17`) and avoid PostgreSQL 18-only features. Migrations live in `supabase/migrations/` as numbered files applied in order, with no down migrations. "Up/down" is satisfied by rebuilding from an empty database: every test run creates a fresh database and applies all migrations, and `supabase db reset` does the same locally. Schema changes after the Phase 2 baseline are new migrations, never edits to applied ones.
- **Rationale:** Matches Supabase's tooling and keeps the SQL portable (D-005). Down migrations for append-only history would be destructive and rarely correct.
- **Alternatives considered:** Hand-written down migrations (would drop historical data; untestable against real history).
- **Consequences:** Rolling back a deployed migration means writing a new forward migration.

## D-027 — Seven-state publication lifecycle shared by every fact table
- **Status:** Accepted (2026-09-29, owner approval during Phase 2 final acceptance)
- **Context:** Two Phase 2 components proposed different publication models: a three-value `publication_status` (draft, published, retracted) on the catalog tables, and a lookup-table lifecycle in the provenance migration. Row Level Security must key on one of them.
- **Decision:** Every fact table has `publication_state text not null default 'draft'` referencing `publication_states` (draft, extracted, validated, published, rejected, superseded, withdrawn). Tables opt in with `nfai_register_fact_table()`, which enforces allowed transitions, freezes content from `validated` onward (only `valid_to` may still be set once, from null), requires provenance for `validated` and `published`, forbids deletion past draft and TRUNCATE, and logs every state change and row change. The public record is the states flagged `is_public` (published, superseded, withdrawn); current facts are `is_current` (published) with the as-of time inside `[valid_from, valid_to)`. Corrections use supersession; a change in the world (a new price) is a new row plus a closed `valid_to` on the old one.
- **Rationale:** Only the lifecycle model implements D-011 (extraction proposes, validation, human approval), D-010 and `METHODOLOGY.md` §12 (supersede, never overwrite; withdrawn results kept) and `DATA_SOURCES.md` (provenance before publication). A lookup table can gain states without an enum rewrite.
- **Alternatives considered:** Three-value status column (no proposal or review states; retraction and correction indistinguishable).
- **Consequences:** Every query for current data must filter on `is_current` and the effective period; the data-access layer does this centrally. Approval is not yet separated from proposal by person (two-person rule deferred to Phase 3).

## D-028 — Provenance model and the publication provenance rule
- **Status:** Accepted (2026-09-29, owner approval of the revised rule during Phase 2 final acceptance)
- **Context:** `DATA_SOURCES.md` requires every published external fact to be traceable to a source with tier, dates and extraction method. The first version of this decision let a fact be published on T4 evidence alone when every T4 link was labeled low confidence. The owner ruled that ordinary facts must not become publishable merely because secondary sources exist.
- **Decision:**
  - **Source model.** Sources are three layers: `sources` (registry entry with tier and approval status), `source_documents` (a citable document; immutable original URL, with `source_document_locations` recording later moves) and `source_observations` (a dated retrieval with optional content hash). Archived evidence references live in the internal `source_archives`. `provenance_links` connect any registered fact row to a document (optionally a specific observation) with a role (primary, corroborating, verification, contradicting, retraction_notice, discovery, context), the tier frozen at citation time, extraction method and confidence. A fact may have many links; links are never edited, only revoked once, so historical evidence is kept.
  - **Normal publication gate.** A row can be validated or published only with at least one active primary, corroborating or verification link to an approved source whose tier at citation is T1, T2 or T3 (`source_tiers.satisfies_publication_gate`). The gate is checked at commit and re-checked when a link is revoked.
  - **T4.** T4 links may be recorded in any role, including corroborating, contradicting and context, and support extraction and review, but T4-only evidence never satisfies the gate, whatever its confidence label.
  - **T5.** T5 may only be discovery or context evidence (`source_tiers.may_be_supporting_link` is false) and never satisfies the gate.
  - **No override in Phase 2.** There is no exception mechanism for T4-only facts. Phase 2 has no admin identities or approval roles to make one safe; Phase 3 may introduce a tightly audited manual-review override through a new decision.
  - **Exemptions.** `capabilities` (vocabulary) and `evaluation_configurations` (reusable conditions, whose disclosing source is cited on the results that use them) do not require their own provenance. Discovery and revoked links are internal.
- **Rationale:** Implements `DATA_SOURCES.md` §2–§5 in the database, so an unsourced or secondarily sourced fact cannot become public even through a buggy client. This is stricter than `DATA_SOURCES.md` §2's T4 allowance ("unless no higher tier exists and the record is labeled low-confidence"); until an audited override exists, such records stay unpublished.
- **Alternatives considered:** A single `source_url` column per fact (no tiers, no multiple sources, no history); allowing low-confidence T4-only publication (the original version; rejected by the owner); a Phase 2 override flag (unsafe without Phase 3 identity and approval audit).
- **Consequences:** Data entry (Phase 3) must attach a T1–T3 source before review; facts with only T4 support stay in draft or validated-pending states until a higher-tier source or a future audited override exists. Public provenance queries must name columns explicitly (column-level grants hide internal fields). Tests: `src/test/db/provenance-gate.db.test.ts`.

## D-029 — Published effective periods may not overlap
- **Status:** Accepted (2026-09-29, owner approval during Phase 2 final acceptance)
- **Context:** Neither the catalog nor the lifecycle migration prevented two published rows of the same price series, capability or rolling alias from being in effect at the same time, which would make state-at-date answers ambiguous.
- **Decision:** Migration `0005_effective_period_integrity.sql` adds deferrable exclusion constraints (btree_gist) so that, among `published` rows, pricing series, model capability values and rolling alias assignments never overlap in `[valid_from, valid_to)`, and a pinned identifier names at most one published version per channel. The constraints are checked at commit, so a replacement and the closing of the old period can happen in one transaction in either order.
- **Rationale:** Makes "the price (or capability, or alias target) at date D" unique by construction; the data-access layer additionally refuses to pick between overlapping current rows.
- **Alternatives considered:** Application-only checks (bypassable); trigger-based checks (race-prone without locking).
- **Consequences:** Drafts and proposals may still overlap; conflicts surface at publication.

## D-030 — Database access model: read-only public record, server-only service role
- **Status:** Accepted (2026-09-29, owner approval during Phase 2 final acceptance)
- **Context:** Supabase exposes the `public` schema through its Data API with the anon key, which is public by design.
- **Decision:** `anon` and `authenticated` get SELECT only, on public tables only, and RLS on every table limits them to rows in public states whose parent rows are also visible. They cannot write or call workflow functions. `authenticated` has no extra rights until Phase 3 designs roles. `service_role` (bypasses RLS) is used only by server code and workers and is still bound by the lifecycle triggers; it cannot truncate, forge audit or publication events, or change the lifecycle vocabulary. The audit log, publication events, source archives and the fact-table registry are internal. The only SECURITY DEFINER functions are the audit and publication-event triggers; `nfai_security_audit()` must return no rows after every migration. Environment variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_ROLE_KEY` (secret, read only by modules that import `server-only`); all optional so the app builds without them.
- **Rationale:** Least privilege with two independent layers (grants and RLS), and a test-enforced self-audit so later migrations cannot silently widen access.
- **Alternatives considered:** Exposing only views to the API (more objects to keep in sync; RLS still needed on base tables).
- **Consequences:** New tables and functions in later phases must enable RLS and revoke default EXECUTE, or the self-audit (and the tests) fail.
- **Extended by D-034 (Phase 3):** `authenticated` gains EXECUTE on the reviewed `nfai_admin_*` workflow and read functions, which check admin identity and permission themselves; `nfai_security_audit()` is replaced to allow exactly those. service_role can no longer move rows past `draft`/`extracted`.

---

## D-031 — Approval model: standard and separated approval classes
- **Status:** Proposed (Phase 3, 2026-09-29)
- **Context:** D-011 requires human approval before publication; D-027 left the two-person rule to Phase 3. The owner prefers single qualified approval for ordinary low-risk facts and separation of duties for high-impact records, and a simpler safe rule if selective separation proved too complex.
- **Decision:** Every registered fact table has an approval class in `fact_approval_policies`. **standard**: one person holding the needed permissions may validate and publish, including a draft they wrote. **separated**: the publisher must differ from whoever validated the current review cycle and from anyone who created or edited the row's content (from `audit_log`), so at least two people are involved and no one satisfies both approvals. It applies to publish and to the replacement published by a supersession. Withdrawal needs one publisher and a reason. Separated tables: `benchmark_results`, `pricing_records`, `model_capabilities`, `evaluation_configurations`, `benchmark_metrics`, `benchmark_versions`. "Submit for review" is a workflow action (`workflow_actions`), not a new publication state; a submitted draft cannot be edited. The provenance gate (D-028) is unchanged and has no T4 override.
- **Rationale:** Benchmark results, prices, capabilities and the definitions that decide comparability (configurations, metrics, benchmark versions) feed rankings and derived scores (`METHODOLOGY.md`), so one person's mistake there does the most damage. Catalog structure (providers, model versions, releases) is easier to verify and correct. The rule is enforced in SQL, so it holds for every client.
- **Alternatives considered:** Single-person approval for everything (simplest; no protection for high-impact data); two-person approval for everything (safe, but blocks all work while there is one operator); publisher-differs-from-validator only (lets an author publish their own high-impact fact after a colleague validates it).
- **Consequences:** With one qualified person, separated records cannot be published until a second person exists (intended). Changing a table's class is a data row in a new migration plus a decision. Any fact table registered later must get a policy in the same migration; `nfai_security_audit()` reports a missing one.

## D-032 — Admin authentication: Supabase Auth, invitation only, cookie sessions
- **Status:** Proposed (Phase 3, 2026-09-29)
- **Context:** Phase 3 needs admin sign-in. Phase 2 already relies on Supabase for data, JWT claims and RLS.
- **Decision:** Supabase Auth with email and password. Sessions live in httpOnly, `SameSite=Lax` cookies (`Secure` in production) managed by `@supabase/ssr` 0.12.7 (pinned exactly). Server code verifies every request with `auth.getUser()` against the Auth server and never trusts cookie contents alone. Public signup is disabled (`supabase/config.toml` and the dashboard); admins are invited by the owner and given an identity by an administrator. Logout is a POST server action. Session expiry follows Supabase JWT expiry and refresh-token rotation. The Next.js 16 proxy (`src/proxy.ts`, formerly middleware) refreshes sessions and redirects anonymous `/admin` requests; pages and actions re-check.
- **Rationale:** No second identity system; JWTs issued by Supabase Auth are what the database already understands (`auth.uid()`), which D-034 relies on. `@supabase/ssr` is Supabase's supported cookie integration for Next.js and is safer than hand-written cookie and refresh handling.
- **Alternatives considered:** Clerk or another provider (second identity system; JWT bridging into RLS); magic links only (depends on email delivery for every sign-in; can be added later); hand-rolled cookie handling with supabase-js (more security-sensitive code to own).
- **Consequences:** One new runtime dependency. The owner must disable signups in the dashboard of every Supabase project. Multi-factor authentication is not required in Phase 3 (known limitation for Phase 22).

## D-033 — Admin identity: Auth user id as the permanent actor id
- **Status:** Proposed (Phase 3, 2026-09-29)
- **Context:** Audit and publication events already record the JWT `sub` as the actor id (Phase 2). Email addresses change and must not be identities.
- **Decision:** `admin_identities.id` is the Supabase Auth user id (immutable), with display name, `active`/`disabled` status, disable time and reason, and metadata. There is no foreign key to `auth.users`. Identities are never deleted, only disabled. Writes go through `nfai_admin_*` functions requiring `manage_admins`; nobody changes their own status or roles; service_role cannot insert or modify identities. The first administrator is created by the owner with SQL as the database owner.
- **Rationale:** One id links Auth, audit and publication history; history survives disabling or deleting an Auth user; a leaked service key cannot mint an administrator.
- **Alternatives considered:** A separate internal uuid mapped to the Auth id (an extra join and a second id in logs, with no benefit while Supabase Auth is the only provider); email as identity (mutable, personal data in audit keys).
- **Consequences:** Moving away from Supabase Auth later would need an id mapping for historical actors. Disabled users keep their attribution in history.

## D-034 — Admin writes and reads through SQL workflow functions called with the admin's own JWT
- **Status:** Proposed (Phase 3, 2026-09-29). Extends D-030.
- **Context:** Phase 2 gave `authenticated` no rights and let service_role run the workflow. Admin writes must be attributed to the real person and authorized even if application code has a bug.
- **Decision:** Every admin mutation is one call to one `nfai_admin_*` function, made by server code with the signed-in admin's own JWT (role `authenticated`). The functions are `SECURITY DEFINER` with an empty `search_path` and EXECUTE for `authenticated` only; each derives the actor from `auth.uid()` (overwriting any caller-set `nfai.actor_*`), refuses unknown or disabled identities, checks the permission and separation of duties, validates arguments against per-table column allow-lists, then uses the Phase 2 primitives, whose triggers still enforce lifecycle, frozen content and provenance. Admin reads of internal data use definer read functions gated on `view_admin` / `view_audit` that return explicit columns. A guard trigger on every fact table refuses publication-state changes beyond `draft`/`extracted` from `service_role`, `authenticated` or `anon` outside these functions. The service-role key is not used anywhere in the admin path. `nfai_security_audit()` is replaced to allow exactly these functions. Errors: `NFA01` not an admin, `NFA02` disabled, `NFA03` missing permission, `NFA04` separation of duties, `NFA05` workflow precondition; server code maps them to generic messages.
- **Rationale:** The actor comes from a JWT verified by the database, so it cannot be forged by a client or misattributed by server code; authorization lives next to the data and is tested directly in SQL; calling a function directly from a browser gives the same result as through the app.
- **Alternatives considered:** Service role with an actor-id parameter after a TypeScript check (authorization and attribution depend on application code alone; a leaked key could publish); RLS write policies for admins on every table (policies cannot express workflow transitions or separation of duties cleanly).
- **Consequences:** More `SECURITY DEFINER` code, reviewed and allow-listed in the self-audit. Phase 2 tests and `remote_checks.sql` that published as service_role now go through the workflow or run as the owner. Future ingestion (Phase 12) can still insert `extracted` rows with the service role but never approve them.

## D-035 — Minimal roles with permission checks in the database
- **Status:** Proposed (Phase 3, 2026-09-29)
- **Context:** The owner asked for a small role set where permissions matter more than labels.
- **Decision:** Five roles: `viewer`, `editor`, `reviewer`, `publisher`, `administrator`, bundling the permissions `view_admin`, `edit_draft`, `submit_review`, `validate_fact`, `reject_fact`, `publish_fact`, `supersede_fact`, `withdraw_fact`, `view_audit`, `manage_admins` (matrix: `ADMIN.md` §4). A person may hold several roles. The administrator role manages access and does not publish. Assignments are append-only with revocation history. Status and assignments are read on every call, so a revocation or disable takes effect on the next request.
- **Rationale:** Enough to separate drafting, reviewing, publishing and access management; small enough to reason about and test as a full matrix.
- **Alternatives considered:** Per-table or per-fact-type roles (many micro-roles; revisit only with a real need); an owner "superuser" role that bypasses workflow (defeats separation of duties).
- **Consequences:** Code checks permissions, never role names. New permissions arrive by migration with a decision.
