# NFAI Labs — Decision Log

| Field | Value |
|---|---|
| Document | Decision Log |
| Phase | Phase 0 — Product Specification & Architecture |
| Last updated | 2026-09-29 |

Architectural and product decisions are recorded here. Major decisions are never made silently.

**Status values:** `Proposed` (awaiting owner approval), `Accepted`, `Open` (needs a decision; not yet proposed as settled), `Superseded` (replaced by a later decision, linked), `Rejected`.

**Rules:**
- New decisions get the next ID. IDs are never reused.
- Accepted decisions are not edited in substance; to change one, add a new decision that supersedes it and update the old one's status.
- Phase 0 decisions are all `Proposed` or `Open` until the owner approves Phase 0.

## Index

| ID | Title | Status |
|---|---|---|
| D-001 | Strict phase-gated development | Proposed |
| D-002 | No universal "best AI" score as the primary product | Proposed |
| D-003 | Results attach to exact model/version plus configuration | Proposed |
| D-004 | Frontend stack: Next.js, React, TypeScript, Tailwind CSS | Proposed |
| D-005 | Database: PostgreSQL via Supabase, minimizing lock-in | Proposed |
| D-006 | Web hosting on Vercel | Proposed |
| D-007 | Background workers run outside Vercel functions | Proposed |
| D-008 | Evaluation infrastructure is isolated from the web platform | Proposed |
| D-009 | Admin system placement | Open |
| D-010 | Append-only, effective-dated history for key records | Proposed |
| D-011 | Human approval before publishing ingested facts | Proposed |
| D-012 | Ranking weights set by documented process, not in Phase 0 | Proposed |
| D-013 | Versioned methodology and immutable ranking snapshots | Proposed |
| D-014 | Store structured facts and links, never copied content | Proposed |
| D-015 | Commercial independence and sponsorship policy | Open |
| D-016 | Git operations are performed only by the owner | Accepted |
| D-017 | Default branch name and remote linkage | Open |
| D-018 | Repository and data licensing | Open |

---

## D-001 — Strict phase-gated development
- **Status:** Proposed
- **Context:** The project scope is broad (catalog, benchmarks, rankings, tools, news, evaluations, API). Unbounded work risks building features on unstable foundations.
- **Decision:** Develop in the phases defined in `PHASES.md`. Work only on the currently approved phase; each phase has a completion gate requiring owner approval.
- **Rationale:** Keeps each layer stable before the next depends on it; makes review tractable.
- **Alternatives considered:** Feature-driven iteration without phases (faster early demos, higher rework risk); fewer, larger phases (less review granularity).
- **Consequences:** Some work that could be parallelized waits. Scope expansions require a recorded decision.

## D-002 — No universal "best AI" score as the primary product
- **Status:** Proposed
- **Context:** Model quality depends heavily on task; single scores hide trade-offs and invite misleading conclusions.
- **Decision:** Rankings are primarily use-case-specific. Any composite index (Phase 7) is secondary, labeled, and fully decomposable.
- **Rationale:** Directly serves the core question ("which AI for this task"); differentiates from simple leaderboards.
- **Alternatives considered:** A single headline score (simple, but misleading); no aggregation at all (honest but less useful).
- **Consequences:** More categories to maintain; each needs its own definition and evidence.

## D-003 — Results attach to exact model/version plus configuration
- **Status:** Proposed
- **Context:** Providers ship many versions and aliases; results for one snapshot are often misattributed to a family.
- **Decision:** Benchmark results, prices, and capabilities attach to exact model versions. Families and providers are groupings only. Evaluation configuration is stored with each result.
- **Rationale:** Accuracy and comparability.
- **Alternatives considered:** Family-level attribution (simpler UI, inaccurate).
- **Consequences:** More granular catalog; UI must roll up carefully without implying family-level results.

## D-004 — Frontend stack: Next.js, React, TypeScript, Tailwind CSS
- **Status:** Proposed (planned default)
- **Context:** Owner's preferred direction. The site is content-heavy, SEO-sensitive, with interactive tools.
- **Decision:** Use Next.js (App Router) with React, strict TypeScript, and Tailwind CSS.
- **Rationale:** Strong static/incremental rendering for SEO and caching; mature ecosystem; type safety.
- **Alternatives considered:** Astro (excellent for content, weaker for app-like tools); Remix/React Router; SvelteKit.
- **Consequences:** Ties hosting ergonomics toward Vercel (not required). No serious problem identified.

## D-005 — Database: PostgreSQL via Supabase, minimizing lock-in
- **Status:** Proposed (planned default)
- **Context:** Data is highly relational with history and provenance; needs auth and storage for admin and artifacts.
- **Decision:** PostgreSQL hosted on Supabase. Schema and migrations are plain SQL-compatible Postgres; Supabase-specific features (Auth, Storage, RLS policies) used deliberately and documented.
- **Rationale:** Relational integrity, strong querying for history, managed operations.
- **Alternatives considered:** Neon or RDS Postgres plus separate auth; document databases (poor fit for relational provenance).
- **Consequences:** Keeping migrations portable preserves the option to move providers. RLS must be designed carefully.

## D-006 — Web hosting on Vercel
- **Status:** Proposed (planned default)
- **Context:** Owner's preferred direction; natural fit for Next.js.
- **Decision:** Host the public website (and, depending on D-009, admin) on Vercel.
- **Rationale:** Preview deployments, CDN, incremental revalidation.
- **Alternatives considered:** Self-hosting Next.js on a container platform; Netlify; Cloudflare.
- **Consequences:** See D-007 and D-008: Vercel is suited to the web tier but not to long-running workers or sandboxed evaluations.

## D-007 — Background workers run outside Vercel functions
- **Status:** Proposed
- **Context:** Architectural concern identified in Phase 0: ingestion (fetching, parsing, retries) and ranking recomputation can exceed serverless execution time limits and need queues, retries, and idempotency.
- **Decision:** Run ingestion workers and heavier scheduled jobs on a dedicated worker platform (candidate options listed below). Vercel Cron MAY be used only as a lightweight trigger.
- **Rationale:** Reliability of long-running, retryable jobs; separation from user-facing latency.
- **Alternatives considered:** Vercel functions only (time limits, weak retry semantics); Supabase Edge Functions + pg_cron (viable for light jobs); a managed job/queue service; a container platform running Node workers.
- **Consequences:** An additional platform to operate. **Specific platform selection is deferred to Phase 1/2 and requires owner approval.** This does not change the preferred stack for the website.

## D-008 — Evaluation infrastructure is isolated from the web platform
- **Status:** Proposed
- **Context:** NFAI's own benchmarks will execute model-generated code and long agentic runs.
- **Decision:** Evaluations run in isolated sandboxes (containers/VMs) on separate infrastructure, with no production secrets and controlled network access. Results enter the normal approval flow.
- **Rationale:** Security, reproducibility, and runtime needs.
- **Alternatives considered:** Running evaluations in serverless functions (unsafe and time-limited); running on developer machines (not reproducible).
- **Consequences:** Separate infrastructure cost and operations from Phase 14 onward. Platform choice deferred to Phase 14.

## D-009 — Admin system placement
- **Status:** Open
- **Context:** Admin can live inside the main Next.js app behind authentication, or as a separate app/deployment.
- **Decision:** Not yet made. To be decided at the start of Phase 3.
- **Rationale:** Depends on role model, security needs, and team size.
- **Alternatives considered:** Same app under protected routes (simpler, larger attack surface on public deployment); separate app (stronger isolation, more overhead).
- **Consequences:** Affects Phase 1 routing structure only minimally if decided by Phase 3.

## D-010 — Append-only, effective-dated history for key records
- **Status:** Proposed
- **Context:** Price changes, result corrections, and ranking changes are core product value.
- **Decision:** Pricing, benchmark results, capabilities, releases, rankings, and methodology are append-only or versioned with effective dates; corrections supersede rather than delete.
- **Rationale:** Enables history features and auditability.
- **Alternatives considered:** Overwrite with audit log only (harder to query history).
- **Consequences:** Queries must select "current" records explicitly; schema complexity increases.

## D-011 — Human approval before publishing ingested facts
- **Status:** Proposed
- **Context:** Automated and AI-assisted extraction can misread sources.
- **Decision:** Ingested changes are proposals; publication requires validation and human approval. Any auto-approval for low-risk classes requires a separate recorded decision with audit sampling.
- **Rationale:** Trust is the product.
- **Alternatives considered:** Auto-publish with later correction (faster, erodes trust).
- **Consequences:** Review workload; admin tooling must make review efficient.

## D-012 — Ranking weights set by documented process, not in Phase 0
- **Status:** Proposed
- **Context:** Weights chosen without evidence would be arbitrary.
- **Decision:** No weights are finalized in Phase 0. Weights are set per category in Phase 6 using `METHODOLOGY.md` §11.3, with equal weighting as the documented default absent stronger justification.
- **Rationale:** Explainability and defensibility.
- **Alternatives considered:** Adopting weights from another leaderboard (inherits unknown biases).
- **Consequences:** Rankings cannot ship until Phase 6 decisions are recorded.

## D-013 — Versioned methodology and immutable ranking snapshots
- **Status:** Proposed
- **Context:** Methodology changes can reorder rankings; users need to know why a ranking changed.
- **Decision:** Methodology is semantically versioned; ranking snapshots record the version and are never recomputed in place.
- **Rationale:** Traceability and honest history.
- **Alternatives considered:** Always showing only the latest computation.
- **Consequences:** Storage of snapshots; UI for history.

## D-014 — Store structured facts and links, never copied content
- **Status:** Proposed
- **Context:** Legal and ethical constraints; value is in structure and provenance.
- **Decision:** Store facts, original summaries, provenance, and links. No wholesale copying of articles, docs, datasets, or leaderboards.
- **Rationale:** Respect for sources; defensible product.
- **Alternatives considered:** Mirroring sources (legal risk, low added value).
- **Consequences:** Internal evidence snapshots are stored privately only.

## D-015 — Commercial independence and sponsorship policy
- **Status:** Open
- **Context:** Phase 21 (Monetization) could introduce sponsorship, affiliate links, or paid API tiers.
- **Decision:** Pending. Proposed baseline: commercial relationships never influence data, rankings, or recommendations; whether affiliate/sponsored content is allowed at all requires owner decision.
- **Rationale:** Trust and independence.
- **Alternatives considered:** No sponsorship ever; clearly separated, labeled sponsorship; affiliate links in Stack Builder.
- **Consequences:** Affects Stack Builder and News design.

## D-016 — Git operations are performed only by the owner
- **Status:** Accepted (explicit owner instruction)
- **Context:** Owner (Nicolas Familia, `NickyBFam`) requires personal control of repository history.
- **Decision:** Agents do not commit, push, create pull requests, or change Git identity configuration. No AI attribution or co-author trailers in any file, commit, or metadata.
- **Rationale:** Owner instruction.
- **Alternatives considered:** None.
- **Consequences:** Agents leave changes in the working tree and report them.

## D-017 — Default branch name and remote linkage
- **Status:** Open
- **Context:** The local repository at Phase 0 is on branch `master` with no commits and no configured remote. The intended remote is `https://github.com/NickyBFam/NFAILabs.git`.
- **Decision:** Pending owner action: choose default branch name (`main` vs `master`) and add the remote. Agents will not change this.
- **Rationale:** Git write operations belong to the owner (D-016).
- **Alternatives considered:** —
- **Consequences:** None for Phase 0 documents.

## D-018 — Repository and data licensing
- **Status:** Open
- **Context:** No license file exists. Code, documentation, and (future) data/API may need different licenses.
- **Decision:** Pending owner decision before any public release or Phase 20.
- **Rationale:** Licensing affects contributors, API consumers, and data reuse.
- **Alternatives considered:** Proprietary/all rights reserved; permissive code license with separate data terms; open data license for selected datasets.
- **Consequences:** Until decided, treat the repository as all rights reserved by default.
