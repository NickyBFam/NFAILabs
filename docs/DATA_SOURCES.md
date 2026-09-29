# NFAI Labs — Data Sources & Provenance

| Field | Value |
|---|---|
| Document | Data Sources & Provenance |
| Phase | Phase 0 — Product Specification & Architecture |
| Status | Approved by owner 2026-09-29 (Phase 0 baseline) |
| Last updated | 2026-09-29 |

This document defines where NFAI Labs' facts may come from, how trustworthy each kind of source is, and what provenance must be stored with every fact.

> **Phase 0 contains no production data.** No model, price, capability, release date, or benchmark result is recorded in any Phase 0 document. Any names of real benchmarks or organizations that appear later in candidate lists are candidates for evaluation, not verified facts.

---

## 1. Principles

1. **Traceability.** Every externally sourced fact — model capability, price, context limit, release date, lifecycle status, benchmark result, or important claim — MUST link to at least one source.
2. **Structured facts, not copies.** NFAI stores structured values, short original summaries, provenance metadata, and links to originals. It MUST NOT copy articles, documentation pages, benchmark websites, or leaderboards wholesale.
3. **Best available source.** Prefer the highest applicable tier (§2). Lower-tier sources may be used when no higher-tier source exists, and are labeled.
4. **No fabrication.** Missing data stays missing and is displayed as unknown. Estimates, if ever shown, are labeled as NFAI estimates with method, and are never stored as sourced facts.
5. **Respect for terms.** Respect robots.txt, rate limits, API terms, and licenses. Prefer official APIs, feeds, and machine-readable files over scraping.
6. **Human approval.** Automated collection proposes changes; validated, approved changes become published facts.

---

## 2. Source tiers

| Tier | Source type | Examples of use | Trust default |
|---|---|---|---|
| **T1** | Official provider / API documentation | Model IDs, capabilities, context limits, pricing, release/deprecation dates, official model cards and technical reports | Authoritative for facts about the provider's own product. Benchmark numbers from T1 are still classified `first-party` (see `METHODOLOGY.md` §3). |
| **T2** | Original benchmark organizations | Benchmark definitions, versions, official leaderboards, official results | Authoritative for the benchmark's own definition and official results. |
| **T3** | Reproducible independent evaluators | Independent benchmark runs, latency/throughput measurements, cross-model evaluations with published methodology | Eligible when methodology, dates, and configurations are published; graded by reproducibility. |
| **T4** | Credible secondary reporting | Reputable news outlets, well-sourced analyses | Context and leads only. MUST NOT be the sole source for a published capability, price, or benchmark result unless no higher tier exists and the record is labeled low-confidence. |
| **T5 (untrusted)** | Social media posts, forums, anonymous leaks, unattributed aggregators, AI-generated summaries | Signals that something may have changed | Never a source for a published fact. MAY trigger a check against T1–T3. |

Notes:
- A provider's official social media account MAY count as T1 for announcements only when the same information is not otherwise available and the account is verified as official; it SHOULD be replaced by documentation when documentation appears.
- Phase 2 enforcement (D-028): the database's normal publication gate requires at least one approved T1–T3 supporting source. T4 evidence is stored as corroborating, contradicting or context evidence but never satisfies the gate on its own; the T4 exception above is not available until an audited manual-review override is approved (Phase 3 at the earliest).
- Aggregator sites that compile others' numbers are not original sources. NFAI traces back to the original and cites that; the aggregator may be recorded as a discovery path.

---

## 3. Required provenance fields

Every sourced fact MUST store:

| Field | Description |
|---|---|
| `source_url` or document reference | Where the fact appears. |
| `publisher` | Organization that published the source. |
| `source_tier` | T1–T4 (T5 not allowed for published facts). |
| `published_at` | Publication date of the source, if known. |
| `retrieved_at` | When NFAI retrieved it. |
| `effective_at` | When the fact became true (e.g. price effective date), if different. |
| `snapshot_ref` | Optional: content hash and/or archived copy reference, for evidence in case the page changes. Archived copies are stored for internal verification, not republished. |
| `extraction_method` | `manual`, `automated-parser`, or `ai-assisted`, with parser/prompt version. |
| `approved_by` / `approved_at` | Who approved publication, and when. |
| `confidence` | `high`, `medium`, `low`, with reason when not high. |
| `notes` | Caveats (e.g. "price shown for standard tier only"). |

---

## 4. Rules by data type

| Data type | Preferred source | Minimum for publication | Notes |
|---|---|---|---|
| Model identity / API model ID | T1 | T1 | Aliases ("latest") tracked as time-bounded pointers to exact versions. |
| Capabilities & modalities | T1 | T1, or T3 with clear testing evidence (labeled) | Time-bounded; changes create new records. |
| Context window / max output | T1 | T1 | Record per channel if they differ. |
| Pricing | T1 (official pricing page/docs) | T1 | Record currency, unit, tier, region/channel, batch/caching variants, effective date. Never overwrite. |
| Release / deprecation / retirement dates | T1 | T1, or T4 labeled low-confidence until T1 confirms | Distinguish announced vs effective dates. |
| Benchmark definitions & versions | T2 | T2 | Pin exact version identifiers. |
| Benchmark results | T2 or T3 (T1 labeled first-party) | Any of T1–T3 with origin type and configuration recorded | See `METHODOLOGY.md` for comparability and eligibility. |
| Speed / latency | T3 or NFAI measurement | T3 or NFAI with stated conditions | Region, time, load, and measurement method required. |
| News / announcements | T1, T2 | T1/T2 for facts; T4 for context | Summaries written in NFAI's own words, linking to original. |

---

## 5. Conflicts and corrections

- When sources disagree, store all versions with their sources, flag the conflict, and resolve by tier order plus recency. The resolution rule and chosen value are visible.
- When a higher-tier source later contradicts a published fact, create a correction record that supersedes the old one; do not delete it.
- External correction requests (including from providers) are accepted, verified against sources, and applied through normal approval.

---

## 6. Content and copyright rules

- Store facts and numbers with attribution and links. Numbers and facts are stored as structured data, not as copied tables or pages.
- Summaries are NFAI's own words and substantially shorter than the original. Direct quotations are rare, short, and attributed.
- Do not rehost benchmark datasets, test items, or model outputs owned by others unless their license explicitly permits it.
- Archived snapshots used as internal evidence are not publicly republished.

---

## 7. Automated collection (future, Phases 11–12)

Pipeline: **source → fetch → parse → normalize → detect change → validate → approve → publish**.

| Stage | Responsibility |
|---|---|
| Source | Registry of approved sources with tier, fetch method (API/feed/page), schedule, and terms notes. |
| Fetch | Polite fetching (rate limits, robots.txt, caching headers); store content hash and retrieval time. |
| Parse | Deterministic parsers where possible; AI-assisted extraction allowed but versioned and treated as untrusted output. |
| Normalize | Map to canonical entities (exact model version, benchmark version, units, currency). Unmatched entities go to a review queue, never auto-created as published records. |
| Detect change | Compare against current records; produce a proposed diff (new model, price change, capability change, new result). |
| Validate | Automated checks: schema, units, plausibility ranges, source tier requirements, duplicate detection, cross-source consistency. |
| Approve | Human review of proposed diffs with source evidence shown side-by-side. Low-risk classes MAY later be auto-approved only by a recorded decision, with sampling audits. |
| Publish | Append new records, supersede old ones, update derived data, and emit news items where relevant. Fully audited. |

**Automated extraction never implies automatic trust or automatic publication.** AI-generated interpretations are proposals.

---

## 8. Source registry (initial)

Intentionally empty in Phase 0. The registry is populated in Phase 4 (providers/models) and Phase 5 (benchmarks), with each entry reviewed for tier, terms, and fetch method. No source is considered approved until listed there.
