# NFAI Labs — Master Product Specification

| Field | Value |
|---|---|
| Document | Master Product Specification |
| Phase | Phase 0 — Product Specification & Architecture |
| Status | Approved by owner 2026-09-29 (Phase 0 baseline) |
| Owner | Nicolas Familia (`NickyBFam`) |
| Last updated | 2026-09-29 |

Related documents: [ARCHITECTURE.md](ARCHITECTURE.md), [METHODOLOGY.md](METHODOLOGY.md), [DATA_SOURCES.md](DATA_SOURCES.md), [PHASES.md](PHASES.md), [DECISIONS.md](DECISIONS.md), [../AGENTS.md](../AGENTS.md).

This document is the source of truth for **what** NFAI Labs is and **why** it exists. How it is built lives in `ARCHITECTURE.md`; how measurements are judged lives in `METHODOLOGY.md`; where facts come from lives in `DATA_SOURCES.md`; when things are built lives in `PHASES.md`; and why choices were made lives in `DECISIONS.md`.

---

## 1. Product identity

### 1.1 What NFAI Labs is

NFAI Labs is an AI intelligence, benchmarking, comparison, and recommendation platform. It maintains a structured, sourced, and historically preserved record of AI providers, their models, those models' capabilities and prices, and the benchmark evidence about how they perform. On top of that record it builds transparent, use-case-specific rankings and guided tools that help people choose and combine AI systems for real work.

### 1.2 Core question

Every feature must serve one question:

> **"Which AI should I use for this task, why, and how should I use it?"**

- **Which AI** — a specific, exact model/version (not a vague brand), or a combination of tools.
- **For this task** — recommendations are always relative to a use case, constraints, and budget. There is no context-free "best AI".
- **Why** — every recommendation and ranking is explainable and traceable to sourced measurements.
- **How should I use it** — configuration, reasoning settings, tooling, cost expectations, and practical guidance.

### 1.3 Mission

Make choosing AI systems an evidence-based decision rather than a marketing-driven or hype-driven one, by giving people trustworthy, transparent, and current information about what AI models can do, what they cost, and how they compare for specific tasks.

### 1.4 Target users

| Segment | Primary need | Typical entry point |
|---|---|---|
| Software developers and engineers | Pick models for coding, agents, and repository-level work; understand cost/performance | Rankings (Coding, Agents), Compare, AI Finder |
| Technical leads and engineering managers | Choose a default model/stack for a team; justify the choice | Compare, AI Stack Builder, Methodology |
| Researchers and analysts | Track benchmark results, methodology, and history accurately | Benchmarks, Models, historical views |
| Students | Pick capable, affordable tools for learning and coursework | Rankings (Students, Value), Guides |
| Indie and game developers | Pick tools for game development pipelines (code, assets, design) | Rankings (Game Development), AI Stack Builder |
| General professionals and enthusiasts | Understand which AI to use for everyday tasks and what changed recently | AI Finder, News, Guides |
| Future API consumers | Programmatic access to curated, sourced model and benchmark data | Public API (later phase) |

### 1.5 Value proposition

1. **Exactness.** Data is attached to the exact model/version that was tested or priced, not blurred to a provider or family.
2. **Provenance.** Every fact links to its source, with a source tier and retrieval date.
3. **Comparability discipline.** Results obtained under materially different conditions are never silently mixed.
4. **Use-case orientation.** Rankings answer "best for what?", not "best overall".
5. **Explainable scores.** Any NFAI-derived score can be decomposed back to its inputs, weights, and sources.
6. **History.** Prices, results, capabilities, and rankings are preserved over time, not overwritten.
7. **Guidance.** Beyond numbers, users get recommendations and practical usage advice.

### 1.6 What distinguishes NFAI Labs from a simple AI leaderboard

| A simple leaderboard | NFAI Labs |
|---|---|
| One table, one score, one "winner" | Many use-case categories; no universal "best AI" score as the primary product |
| Numbers with unclear provenance | Every number carries source, tier, date, and evaluation conditions |
| Mixes vendor-reported and independent results in one column | Separates first-party, original-benchmark-organization, and independent results; labels them |
| Results attached to a brand name | Results attached to an exact model/version plus configuration |
| Current snapshot only | Full history of results, prices, rankings, and lifecycle |
| Opaque aggregation | Published, versioned methodology; each derived score is traceable |
| Tells you who "won" | Tells you which to use, why, how, and at what cost |
| Performance only | Performance plus price, speed, context, modality, availability, and practical fit |

### 1.7 Product principles

1. **Evidence over opinion.** Claims must be sourced; editorial judgment is labeled as such.
2. **Exact over approximate.** Prefer "this model version, this configuration, this date" over generalizations.
3. **Transparent over authoritative.** Show the work; let users verify.
4. **Use case over universal.** Ranking is always for something.
5. **History over overwrite.** Never destroy the record of what was true before.
6. **Structured facts over copied content.** Store facts, summaries, provenance, and links; never republish others' articles or leaderboards wholesale.
7. **Human-approved truth.** Automation may propose; publication of facts requires validation and approval.
8. **Honest uncertainty.** Missing, conflicting, or low-confidence data is shown as such, never papered over.
9. **Independence.** Commercial relationships must never alter data or rankings (see §6).
10. **Phase discipline.** The product is built in gated phases defined in `PHASES.md`.

---

## 2. Product areas

Each area below defines what belongs in it and what explicitly does not. Areas share one underlying data model (§3); they are views and tools, not separate databases.

### 2.1 Rankings
- **Belongs:** Use-case-specific ranked lists (Coding, Reasoning, General Use, Research, Agents, Game Development, Students, Value, Speed, Long Context, Multimodal, and future categories). Each ranking shows the category definition, methodology version, input measurements, coverage/confidence, as-of date, and ranking history.
- **Does not belong:** A single universal "best AI" score as the headline product; rankings with undisclosed weights; rankings built from results that are not comparable under `METHODOLOGY.md`; sponsored or paid placement of any kind.

### 2.2 Models
- **Belongs:** One page per exact model/version: identifiers (including API model IDs), provider, family, release and lifecycle status, capabilities, modalities, context and output limits, pricing history, benchmark results (grouped by benchmark version and evaluation conditions), category ranking positions, sources, and change history.
- **Does not belong:** Results or specs borrowed from a sibling version without explicit labeling; unsourced capability claims; marketing copy reproduced from the provider.

### 2.3 Providers
- **Belongs:** Organizations that build or serve models: profile, model families and versions, official documentation links, policies relevant to users (e.g. data retention, availability regions) when sourced, and a timeline of releases and announcements.
- **Does not belong:** Benchmark scores attributed to a provider as a whole; provider-level "rankings" that hide which model produced a result.

### 2.4 Compare
- **Belongs:** Side-by-side comparison of two or more exact model versions across capabilities, pricing, limits, and benchmark results, with clear flags where results are not comparable (different benchmark versions, harnesses, settings, or dates).
- **Does not belong:** Silent normalization of incomparable results; a single combined "winner" declaration without category context.

### 2.5 Benchmarks
- **Belongs:** A catalog of included benchmarks: what each measures, its owner/organization, versions, scoring method, known limitations, contamination concerns, inclusion status and rationale, and all recorded results per version.
- **Does not belong:** Copies of benchmark datasets or full leaderboards; benchmarks that fail inclusion criteria presented as if they were included.

### 2.6 AI Finder
- **Belongs:** A guided tool that takes a task description and constraints (budget, latency, modality, context size, privacy/deployment needs, skill level) and returns recommended models with explanations, trade-offs, and usage guidance, derived from category rankings and catalog data.
- **Does not belong:** Recommendations that cannot be explained from stored data; free-form AI-generated recommendations presented as fact without traceable inputs.

### 2.7 AI Stack Builder
- **Belongs:** Recommendations for combinations of AI tools for larger workflows (e.g. a coding assistant plus a research model plus an image model for a game project), with the role of each component, cost estimates derived from stored pricing, and rationale.
- **Does not belong:** Affiliate-driven stacks; stacks referencing tools not in the catalog; cost estimates without stated assumptions.

### 2.8 News
- **Belongs:** Structured summaries of important, official AI news and model updates (releases, deprecations, pricing changes, capability changes), each linked to the original source and to the affected catalog records.
- **Does not belong:** Republished articles; rumor presented as fact; unapproved automated extractions.

### 2.9 Guides
- **Belongs:** Original educational content: how to choose a model, how to use specific capabilities, how to read benchmarks, prompting and configuration guidance, category explainers.
- **Does not belong:** Copied tutorials; guides that make factual claims without linking to catalog data or sources.

### 2.10 Labs
- **Belongs:** NFAI Labs' own original evaluations (future): benchmark suite definitions, versioned environments, run records, results, and reports — especially software engineering, coding, agentic, game development, and repository-level tasks.
- **Does not belong:** Informal one-off tests presented as benchmarks; results without published harness/environment versions.

### 2.11 Methodology
- **Belongs:** Public, versioned documentation of how data is sourced, how benchmarks are included, how comparability is judged, how rankings and derived scores are computed, and the changelog of methodology revisions.
- **Does not belong:** Undisclosed "secret sauce"; methodology changes applied retroactively without versioning.

---

## 3. Data model concepts

These are **conceptual** definitions. The physical schema is designed in Phase 2 and must preserve these distinctions. Summary of the core rule:

> **Benchmark results always belong to the exact tested model/version (and its evaluation configuration), never vaguely to a provider or model family.**

| Concept | Definition | Key distinctions |
|---|---|---|
| **Provider** | An organization that develops and/or serves AI models (e.g. a lab or a cloud platform). | A provider is not a model. Where a model is developed by one organization and served by another, both roles are recorded. |
| **Model family** | A named line of related models from a provider (a brand/series grouping). | A grouping for navigation only. It never holds benchmark results, prices, or exact capabilities. |
| **Exact model / version** | A specific, identifiable model artifact: a precise version, snapshot, or API model ID with defined behavior. | The unit to which results, prices, capabilities, and rankings attach. "Latest" aliases are tracked as pointers to exact versions over time, not as versions themselves. |
| **Release** | An event making an exact model/version available (or changing its availability) on a date, through a channel (API, app, open weights), with a lifecycle status (preview, GA, deprecated, retired). | A model version can have multiple release events (preview → GA → deprecation). |
| **Benchmark** | A named evaluation designed to measure a capability (e.g. a coding or reasoning test), owned by an organization. | Conceptual identity of the test, independent of its versions. |
| **Benchmark version** | A specific version of a benchmark: fixed task set, scoring method, and rules. | Results from different benchmark versions are not directly comparable unless the benchmark owner states they are. |
| **Benchmark result** | A score for one exact model/version on one benchmark version under recorded evaluation conditions, from one source. | Always carries: model version, benchmark version, configuration, harness, date, source, source tier, and origin type (first-party / benchmark-owner / independent / NFAI). |
| **Evaluation run** | A single execution of a benchmark (or NFAI suite) against a model configuration in a specific environment, producing one or more results. | Records environment version, harness version, seeds, settings, and artifacts. Primarily used for NFAI's own evaluations and for independent evaluators who publish run-level detail. |
| **Capability** | A sourced, typed statement of what an exact model/version supports (modalities, tool use, structured output, context window, max output, fine-tuning, etc.). | Time-bounded: capabilities can change; each has a valid-from date and a source. |
| **Pricing record** | A sourced price for an exact model/version on a channel, unit, and tier (input/output/cached tokens, per-image, per-second, batch discounts), with an effective date. | Append-only; a change creates a new record, never an overwrite. |
| **Source** | A reference to where a fact came from: URL or document, publisher, source tier, retrieval date, and optionally an archived snapshot reference or hash. | Every externally sourced fact links to at least one source. |
| **Announcement** | A dated, sourced statement from a provider or benchmark organization (release, update, deprecation, price change) summarized in NFAI's own words. | Feeds News; may trigger proposed changes to catalog records, which still require validation. |
| **Ranking category** | A defined use case (e.g. Coding) with a published definition, eligible input measurements, aggregation rules, and methodology version. | Categories are versioned; changes do not rewrite past rankings. |
| **Derived score** | Any number NFAI computes from source measurements (category score, index, value ratio). | Must store or be reproducible from: inputs, weights, normalization, methodology version, and computation date. Always labeled as NFAI-derived. |

Additional supporting concepts expected in Phase 2 (not exhaustive): evaluation configuration (reasoning effort, temperature, tool access, harness, prompt/scaffold), deployment channel, modality, ranking snapshot, methodology version, change/audit record, and approval record.

---

## 4. Rankings philosophy (summary)

Full rules live in `METHODOLOGY.md`. Summary:

- Rankings are **primarily use-case-specific**. A universal score, if ever introduced (see the NFAI Index in Phase 7), is secondary, clearly labeled, and fully decomposable.
- Initial categories: Coding, Reasoning, General Use, Research, Agents, Game Development, Students, Value, Speed, Long Context, Multimodal.
- **No arbitrary weights are finalized in Phase 0.** Weights are established through the documented process in `METHODOLOGY.md` and recorded in `DECISIONS.md`.
- Every derived score is explainable and traceable to its source measurements.
- Rankings display coverage and confidence; models with insufficient comparable evidence are shown as "insufficient data", not ranked by guesswork.

---

## 5. Source integrity (summary)

Full rules live in `DATA_SOURCES.md`. Preferred source order:

1. Official provider/API documentation
2. Original benchmark organizations
3. Reproducible independent evaluators
4. Credible secondary reporting

NFAI stores structured facts, short original summaries, provenance, and links to originals. It does not copy articles or benchmark websites wholesale.

---

## 6. Independence and trust

- Payment, sponsorship, affiliate relationships, or commercial partnerships must never alter or influence NFAI benchmark results, rankings, derived scores, or methodology (D-015).
- Sponsored or affiliate content may be allowed in the future, but only if clearly disclosed and structurally separated from NFAI rankings, benchmark scores, methodology, recommendations, and editorial evaluation (D-015).
- Corrections are accepted from anyone (including providers) but applied only through the same sourcing and approval process as any other change, and logged.

---

## 7. Historical data (summary)

NFAI is history-oriented. Important records (pricing, benchmark results, capabilities, releases/lifecycle, rankings, methodology versions) are append-only or versioned; changes create new records with effective dates. This enables:

- performance over time
- price changes
- ranking history
- capability changes
- model lifecycle (announced → preview → GA → deprecated → retired)

Details: `ARCHITECTURE.md` §7 and `METHODOLOGY.md` §12.

---

## 8. AI news and update ingestion (summary)

Future workflow (Phases 11–12):

**source → fetch → parse → normalize → detect change → validate → approve → publish**

Automated extraction (including AI-assisted extraction) only **proposes** changes. Nothing becomes a published fact without passing validation and human approval. Details: `ARCHITECTURE.md` §8 and `DATA_SOURCES.md` §7.

---

## 9. NFAI Labs original evaluations (summary)

Future NFAI benchmark suites (Phases 14–15) focus on software engineering, coding, agentic tasks, game development, and repository-level tasks. They must be versioned, reproducible, isolated, and comparable across models. Details: `METHODOLOGY.md` §13 and `ARCHITECTURE.md` §9.

---

## 10. Non-goals (current)

- Hosting or serving AI models to users.
- Acting as a chat interface or AI wrapper product.
- Republishing third-party content, datasets, or leaderboards.
- Producing a single "best AI" verdict as the core product.
- Publishing any unsourced factual data, including placeholder or example data presented as real.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| First-party result | A result reported by the model's own provider. |
| Benchmark-owner result | A result published by the organization that owns/maintains the benchmark. |
| Independent result | A result from an evaluator unaffiliated with both the model provider and (optionally) the benchmark owner, with published methodology. |
| NFAI result | A result produced by NFAI Labs' own evaluation infrastructure. |
| Comparable | Two results that satisfy the comparability rules in `METHODOLOGY.md` §6. |
| Harness | The software scaffolding used to run a model on a benchmark (prompts, tools, agent loop, scoring). |
| Baseline | An approved, versioned reference state (methodology version, ranking snapshot, evaluation environment) that later changes are measured against. |
