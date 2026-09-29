# NFAI Labs — Benchmark & Ranking Methodology

| Field | Value |
|---|---|
| Document | Methodology |
| Methodology version | 0.1.0 (draft, pre-baseline) |
| Phase | Phase 0 — Product Specification & Architecture |
| Status | Draft, pending owner approval |
| Last updated | 2026-09-29 |

This document defines how NFAI Labs decides which measurements to include, when measurements can be compared, and how rankings and derived scores are produced. It is intended to be published publicly (in the Methodology area) once approved.

Key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are used in their usual normative sense.

---

## 1. Foundational rules

1. A benchmark result MUST belong to the **exact model/version** that was tested, together with its evaluation configuration. It MUST NOT be attached to a provider or model family.
2. Results obtained under **materially different evaluation conditions MUST NOT be silently mixed** — not in tables, comparisons, rankings, or derived scores.
3. Every result MUST have a source (see `DATA_SOURCES.md`) and an origin type (§3).
4. Every derived score MUST be explainable and traceable to its input measurements.
5. Historical results MUST be preserved (§12).
6. NFAI MUST NOT fabricate, estimate, or interpolate benchmark results and present them as measured.

---

## 2. Benchmark inclusion

A benchmark is eligible for inclusion when all of the following hold:

| Criterion | Requirement |
|---|---|
| Relevance | Measures a capability relevant to at least one ranking category or to users' decisions. |
| Definition | Task set, scoring method, and rules are publicly documented. |
| Versioning | Has identifiable versions, or NFAI can pin an exact version (e.g. dataset revision, commit, or date). |
| Ownership | Has an identifiable owner/maintainer organization. |
| Validity | Measures what it claims with reasonable construct validity; known flaws are documented. |
| Reproducibility | Results can in principle be reproduced by third parties, or the owner runs a controlled, documented process. |
| Discriminative power | Not saturated to the point where top models are indistinguishable within noise (saturated benchmarks MAY remain for history but SHOULD be down-weighted or retired from rankings). |
| Licensing | NFAI can store structured results and link to the original without violating terms. |
| Contamination | Contamination risk is assessed and documented (§9). |

Inclusion status values: `candidate`, `included`, `included-limited` (shown but excluded from derived scores), `deprecated` (history only), `excluded` (with reason).

Every inclusion, limitation, deprecation, or exclusion MUST be recorded with rationale in `DECISIONS.md` or the benchmark's methodology entry, and MUST NOT delete existing results.

Phase 0 deliberately does **not** select the initial benchmark set. That selection happens in Phase 5 against these criteria.

---

## 3. Result origin types

Each result is classified by who produced it:

| Origin | Definition | Default treatment |
|---|---|---|
| `first-party` | Reported by the model's own provider (release post, model card, technical report, docs). | Displayed and labeled "vendor-reported". MAY enter derived scores only if configuration is sufficiently disclosed and the category rules allow it; otherwise `display-only`. |
| `benchmark-owner` | Published by the organization that owns the benchmark (e.g. its official leaderboard) under its own controlled process. | Preferred for that benchmark. |
| `independent` | Produced by an evaluator unaffiliated with the model provider, with published methodology. | Eligible if the evaluator meets `DATA_SOURCES.md` tier requirements. |
| `nfai` | Produced by NFAI Labs' own evaluation infrastructure (future). | Eligible once the suite is baselined and published. |
| `community` | Crowd-sourced or user-submitted real-world results (future, Phase 16). | Never mixed with controlled benchmark results; separate presentation. |

### 3.1 Official vendor-reported results
- MUST be labeled as vendor-reported everywhere they appear.
- MUST record the exact disclosed configuration (reasoning mode, sampling, number of attempts, tools, harness, prompt scaffolding, internal vs public harness) — or record it as `undisclosed`.
- Results with undisclosed material conditions MUST NOT be treated as comparable to results with known conditions.
- When a vendor number and an independent number disagree, both are shown; neither silently replaces the other.

### 3.2 Independent results
- The evaluator's methodology, harness version, and evaluation date MUST be recorded.
- Independent results SHOULD be preferred over vendor-reported results in derived scores when conditions are otherwise comparable.

### 3.3 Conflicts
When multiple sources report different results for the same model version, benchmark version, and apparently identical conditions: store all, flag the conflict, and choose a primary value only by a documented rule (e.g. prefer benchmark-owner > independent with published run artifacts > first-party). The choice MUST be visible to users.

---

## 4. Reproducibility

Results are graded by reproducibility:

| Grade | Meaning |
|---|---|
| R3 | Run artifacts (logs/transcripts), harness code, configuration, and environment version are public; NFAI or others could re-run. |
| R2 | Harness and configuration are public; artifacts are not. |
| R1 | Configuration partially disclosed; harness not public. |
| R0 | Conditions largely undisclosed. |

Category rules define the minimum reproducibility grade for inclusion in derived scores. R0 results are display-only by default.

---

## 5. Evaluation configuration

Every result MUST record (or explicitly mark unknown) the following configuration fields:

- Exact model version / API model ID and deployment channel (API, hosted app, open weights with specified quantization/precision).
- **Reasoning settings**: reasoning/thinking mode on/off, effort level, thinking-token budget.
- Sampling parameters (temperature, top-p) where applicable.
- Max output tokens and context used.
- Attempts and aggregation: pass@1 vs pass@k, majority vote, best-of-n, self-consistency.
- Prompting: zero-shot/few-shot, system prompt, chain-of-thought instructions, benchmark-specific scaffolding.
- **Tool access**: none, code execution, web browsing/search, file system, custom tools.
- **Agent/tool harness**: harness name and version, agent loop design, step/time/cost limits.
- Evaluation date and, where relevant, the date range of the model snapshot.
- Subset used (full benchmark vs subset/verified split) and any excluded tasks.

---

## 6. Comparability rules

Two results are **comparable** only if they share:

1. The same **benchmark version** (or versions the owner declares score-compatible).
2. The same task subset and scoring method.
3. Materially equivalent **attempts/aggregation** (pass@1 is not comparable with pass@k or best-of-n).
4. Materially equivalent **tool access** and **harness class** (§7).
5. A declared **reasoning setting** (results with different reasoning settings are treated as different configurations of the same model version; they may be compared if the view explicitly shows the setting).

When any of these differ, the UI MUST either (a) separate them into different columns/groups, or (b) show them together with a visible non-comparability flag and exclude them from any combined computation. Derived scores MUST only combine comparable results.

"Material" differences are adjudicated per benchmark; the adjudication rule is documented in that benchmark's methodology entry.

---

## 7. Agent and tool harness differences

Agentic and coding benchmarks are highly sensitive to scaffolding. Therefore:

- Harnesses are recorded as first-class, versioned entities.
- Results are grouped by **harness class** (e.g. "no tools", "minimal standardized agent", "vendor custom agent", "commercial product agent"), and within class by harness version.
- A model evaluated in a vendor's custom agent MUST NOT be ranked against a model evaluated in a minimal standardized agent as if the difference were only the model.
- Where possible, NFAI prefers results from a **standardized harness** applied equally to all models for rankings, and presents vendor-custom-harness results as a separate "best reported system" view.
- Step limits, time limits, cost limits, and retry policies are part of the harness configuration.

---

## 8. Benchmark versions

- Every benchmark version is stored separately; results always reference one version.
- A new benchmark version does not invalidate old results; old results remain attached to their version.
- Rankings declare which benchmark versions they use. Moving a ranking to a new benchmark version is a methodology change (§11).
- Cross-version trend lines MUST NOT be drawn as one continuous series unless the owner declares compatibility.

---

## 9. Contamination concerns

- For each benchmark, record: public release date of the test set, whether test items are public, known contamination reports, and mitigations (held-out sets, private splits, dynamic/refreshed tasks, canary strings).
- For each result, record the model's stated training-data cutoff when available, so users can see whether the model could have seen the benchmark.
- Benchmarks with credible contamination evidence for a model are flagged on that result; category rules MAY exclude flagged results.
- NFAI prefers benchmarks with private, held-out, or regularly refreshed task sets for rankings.
- NFAI's own suites (§13) MUST keep a private held-out portion and rotate tasks on a documented schedule.

---

## 10. Evaluation date

- Every result records the evaluation date (when the model was actually run), which is distinct from the publication date and the retrieval date.
- Hosted models can change behind a stable name; when the exact snapshot is unknown, the evaluation date is the best available identifier and MUST be displayed.
- Rankings show an "as-of" date and SHOULD indicate staleness when inputs are old relative to the model's current version.

---

## 11. Ranking philosophy and process

### 11.1 Principles
- NFAI does **not** build its product around one simplistic universal "best AI" score.
- Rankings are **use-case-specific**. Each category answers "best for this use case, under stated assumptions".
- Any future NFAI-derived score MUST be explainable: a user can see every input, its source, its normalization, its weight, and the methodology version.
- Missing data is never imputed silently. Models lacking sufficient comparable evidence show "insufficient data" for that category.
- Performance, price, and speed are kept distinguishable; "Value" and "Speed" are explicit categories rather than hidden factors in performance categories.

### 11.2 Initial ranking categories (definitions to be finalized in Phase 6)

| Category | Intended question | Likely evidence types (to be confirmed) |
|---|---|---|
| Coding | Which model writes and fixes code best? | Coding and software engineering benchmarks; repository-level tasks |
| Reasoning | Which model handles hard multi-step reasoning best? | Math, logic, science reasoning benchmarks |
| General Use | Which model is best for everyday assistance? | Broad knowledge/instruction-following benchmarks; human-preference evaluations (clearly labeled) |
| Research | Which model best supports research and analysis? | Long-document QA, citation accuracy, search-augmented tasks |
| Agents | Which model best completes multi-step tool-using tasks? | Agentic benchmarks, grouped by harness class |
| Game Development | Which model best supports building games? | NFAI game development benchmark (Phase 15); relevant coding/multimodal evidence |
| Students | Which model helps students learn effectively and affordably? | Reasoning/explanation quality, price, availability of free tiers |
| Value | Which model gives the most capability per unit cost? | Category performance divided by sourced price under stated usage assumptions |
| Speed | Which model responds fastest? | Sourced or measured latency/throughput with stated conditions |
| Long Context | Which model uses long inputs reliably? | Long-context retrieval and reasoning benchmarks; stated context limits |
| Multimodal | Which model handles images/audio/video best? | Multimodal benchmarks by modality |

Categories are added, split, or retired only through a recorded decision.

### 11.3 Establishing weights (process, not values)

Phase 0 does **not** finalize weights. Weights are established per category by this process:

1. **Define** the category's question, target user, and what "good" means in observable terms.
2. **Select** eligible benchmarks and measurement types against §2 and the category's minimum reproducibility grade.
3. **Justify** each input: which part of the category question it measures, known weaknesses, and redundancy with other inputs.
4. **Propose** normalization (e.g. rank-based, min-max within comparable set, or z-score) and weights, with written rationale. Equal weighting is the default when no stronger justification exists, and that choice itself is recorded.
5. **Sensitivity check**: show how rankings change under reasonable alternative weights; if top positions flip under small changes, the ranking MUST communicate that uncertainty (e.g. tiers instead of strict ranks).
6. **Coverage rule**: define the minimum set of inputs a model must have to be ranked.
7. **Review and approve**: record the category definition, inputs, weights, and rationale in `DECISIONS.md` and publish as a methodology version.
8. **Revise** only through the same process; revisions create a new methodology version (§11.4).

### 11.4 Methodology versioning
- Methodology uses semantic versioning: MAJOR (changes that can reorder rankings materially: new weights, new inputs), MINOR (new categories, new benchmarks marked display-only), PATCH (clarifications).
- Each ranking snapshot records the methodology version used.
- Past ranking snapshots are never recomputed in place. If a recomputation under new methodology is shown, it is labeled as such alongside the original.

### 11.5 Derived score traceability
Every derived score record MUST reference: input result IDs, per-input normalized values, weights, aggregation formula, coverage, methodology version, and computation timestamp — sufficient to reproduce the number exactly.

---

## 12. Historical preservation

- Benchmark results, pricing records, capabilities, releases, rankings, and methodology versions are append-only or versioned.
- Corrections do not delete the incorrect record; they supersede it with a linked correction record and reason.
- Retracted results (e.g. benchmark owner withdraws a score) are marked retracted with source, not deleted.
- Approved baselines (methodology versions, ranking snapshots, evaluation environments) MUST NOT be modified casually; changes require a decision record.

---

## 13. NFAI Labs original evaluations (future principles)

Applies to Phases 14–15 and later. Focus areas: software engineering, coding, agentic tasks, game development, repository-level tasks.

1. **Versioned everything**: task set, environment image, harness, scoring code, and model configuration each carry versions; a result references all of them.
2. **Reproducible**: environments are containerized with pinned dependencies; runs record seeds, full configuration, and complete transcripts/artifacts.
3. **Comparable**: every model in a published comparison runs on the same suite version, environment version, harness version, and budget limits (steps, time, tokens, cost).
4. **Isolated and safe**: model-executed code runs in sandboxes with no access to production systems or secrets; network access is controlled per task.
5. **Objective scoring first**: prefer automated, verifiable scoring (tests pass, build succeeds, behavior checks). Model-graded or human-graded scoring MUST be documented, calibrated, and labeled.
6. **Contamination resistance**: maintain private held-out tasks; rotate and refresh tasks; never publish the held-out set.
7. **Statistical honesty**: run multiple trials where variance matters; report confidence intervals or variance; avoid ranking differences within noise.
8. **Cost and time reporting**: record tokens, dollar cost (from sourced pricing), and wall-clock time alongside scores.
9. **Transparency**: publish suite design, public task examples, harness code where feasible, and a methodology report per suite version.
10. **Repository-level realism**: repository tasks use real-world-style codebases with pinned commits, realistic issues, and hidden tests.
11. **Game development specifics** (Phase 15): tasks such as implementing mechanics, fixing gameplay bugs, and building small playable prototypes, scored by automated behavior tests where possible; any subjective quality scoring is separated and labeled.
12. **No self-dealing**: NFAI suites are not tuned to favor any provider; task design reviews are recorded.

---

## 14. Methodology changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-09-29 | Initial draft in Phase 0. No weights, benchmarks, or categories finalized. |
