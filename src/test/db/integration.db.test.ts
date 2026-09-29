/**
 * Phase 2 integration checks across all migrations (0001-0005) and the synthetic seed.
 * Each block maps to a Phase 2 acceptance criterion in docs/PHASES.md. Component-level
 * behaviour is covered by the data-layer tests in src/lib/data.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  createTestDatabase,
  isValidMigrationFileName,
  listMigrationFiles,
} from "./harness";

const ALPHA = "5eed0000-0000-4000-8000-000000000104";
const BETA_DRAFT = "5eed0000-0000-4000-8000-000000000105";
const PROVIDER = "5eed0000-0000-4000-8000-000000000101";
const FAMILY = "5eed0000-0000-4000-8000-000000000103";
const CHANNEL = "5eed0000-0000-4000-8000-000000000102";
const BENCHMARK_VERSION = "5eed0000-0000-4000-8000-000000000202";
const METRIC = "5eed0000-0000-4000-8000-000000000203";
const CONFIG = "5eed0000-0000-4000-8000-000000000204";
// The seed's current (correcting) result; ...205 is the superseded original.
const RESULT = "5eed0000-0000-4000-8000-000000000206";
const OLD_PRICE = "5eed0000-0000-4000-8000-000000000301";
const CURRENT_PRICE = "5eed0000-0000-4000-8000-000000000302";
const SOURCE_DOCUMENT = "5eed0000-0000-4000-8000-000000000002";

/** Runs statements as service_role and forces deferred (commit-time) checks, then rolls back. */
function asServiceChecked<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return asRole(db, "service_role", async (tx) => {
    const result = await fn(tx);
    await tx.exec("set constraints all immediate");
    return result;
  });
}

const insertResult = (tx: Transaction, modelVersionId: string) =>
  tx.query(
    `insert into public.benchmark_results
       (model_version_id, benchmark_version_id, benchmark_metric_id, evaluation_configuration_id,
        score, origin_type, reproducibility_grade, evaluated_on_precision)
     values ($1, $2, $3, $4, 50, 'independent', 'R2', 'unknown') returning id`,
    [modelVersionId, BENCHMARK_VERSION, METRIC, CONFIG],
  );

describe("Phase 2 database integration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase({ seed: true });
  });

  afterAll(async () => {
    await db.close();
  });

  describe("migrations", () => {
    it("are Supabase-named and applied in order", () => {
      const files = listMigrationFiles();
      expect(files).toEqual([
        "0001_core_catalog.sql",
        "0002_measurements_pricing.sql",
        "0003_provenance_history.sql",
        "0004_security_rls.sql",
        "0005_effective_period_integrity.sql",
      ]);
      expect(files.every(isValidMigrationFileName)).toBe(true);
    });

    it("pass the security self-audit from 0004", async () => {
      const audit = await db.query("select * from public.nfai_security_audit()");
      expect(audit.rows).toEqual([]);
    });

    it("give every public table a primary key and row level security", async () => {
      const tables = await db.query<{ name: string; rls: boolean; has_pk: boolean }>(`
        select c.relname as name, c.relrowsecurity as rls,
               exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p') as has_pk
          from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')`);
      expect(tables.rows.length).toBeGreaterThan(25);
      expect(tables.rows.filter((t) => !t.rls || !t.has_pk)).toEqual([]);
    });

    it("never cascade or null out references on delete", async () => {
      const risky = await db.query(`
        select conrelid::regclass::text as tbl, conname
          from pg_constraint
         where contype = 'f' and connamespace = 'public'::regnamespace
           and (confdeltype not in ('a', 'r') or confupdtype not in ('a', 'r'))`);
      expect(risky.rows).toEqual([]);
    });
  });

  describe("benchmark results need an exact version, benchmark version, configuration and source", () => {
    it("reject a result without an exact model version", async () => {
      await expect(
        asServiceChecked(db, (tx) => insertResult(tx, null as unknown as string)),
      ).rejects.toThrow(/model_version_id/);
    });

    it("reject a provider or family id in place of an exact version", async () => {
      for (const notAVersion of [PROVIDER, FAMILY]) {
        await expect(asServiceChecked(db, (tx) => insertResult(tx, notAVersion))).rejects.toThrow(
          /foreign key/,
        );
      }
    });

    it("reject a result without a benchmark version or configuration", async () => {
      for (const column of ["benchmark_version_id", "evaluation_configuration_id"]) {
        await expect(
          asServiceChecked(db, async (tx) => {
            const { rows } = await insertResult(tx, ALPHA);
            await tx.query(`update public.benchmark_results set ${column} = null where id = $1`, [
              (rows[0] as { id: string }).id,
            ]);
          }),
        ).rejects.toThrow(/null value/);
      }
    });

    it("refuse to validate or publish a result that has no source", async () => {
      await expect(
        asServiceChecked(db, async (tx) => {
          const { rows } = await insertResult(tx, ALPHA);
          const id = (rows[0] as { id: string }).id;
          await tx.query(
            "select public.nfai_transition('public.benchmark_results', $1, 'validated')",
            [id],
          );
        }),
      ).rejects.toThrow(/provenance link/);
    });

    it("accept a sourced result through the review workflow", async () => {
      const state = await asServiceChecked(db, async (tx) => {
        const { rows } = await insertResult(tx, ALPHA);
        const id = (rows[0] as { id: string }).id;
        await tx.query(
          `insert into public.provenance_links (subject_table, subject_id, source_document_id, role)
           values ('public.benchmark_results', $1, $2, 'primary')`,
          [id, SOURCE_DOCUMENT],
        );
        await tx.query(
          "select public.nfai_transition('public.benchmark_results', $1, 'validated')",
          [id],
        );
        await tx.query(
          "select public.nfai_transition('public.benchmark_results', $1, 'published')",
          [id],
        );
        const after = await tx.query<{ s: string }>(
          "select publication_state as s from public.benchmark_results where id = $1",
          [id],
        );
        return after.rows[0]?.s;
      });
      expect(state).toBe("published");
    });

    it("never let a published result be edited or deleted", async () => {
      await expect(
        asServiceChecked(db, (tx) =>
          tx.query("update public.benchmark_results set score = 99 where id = $1", [RESULT]),
        ),
      ).rejects.toThrow(/frozen/);
      await expect(
        asServiceChecked(db, (tx) =>
          tx.query("delete from public.benchmark_results where id = $1", [RESULT]),
        ),
      ).rejects.toThrow(/cannot be deleted/);
    });
  });

  describe("pricing changes create new records", () => {
    it("never overwrite a published price", async () => {
      await expect(
        asServiceChecked(db, (tx) =>
          tx.query("update public.pricing_records set price_amount = 0.5 where id = $1", [
            CURRENT_PRICE,
          ]),
        ),
      ).rejects.toThrow(/frozen/);
    });

    it("never move an already closed effective period", async () => {
      await expect(
        asServiceChecked(db, (tx) =>
          tx.query("update public.pricing_records set valid_to = '2026-05-01' where id = $1", [
            OLD_PRICE,
          ]),
        ),
      ).rejects.toThrow(/valid_to/);
    });

    it("reject two published prices of one series in effect at the same time", async () => {
      await expect(
        asServiceChecked(db, async (tx) => {
          const { rows } = await tx.query<{ id: string }>(
            `insert into public.pricing_records
               (model_version_id, deployment_channel_id, billing_dimension, currency, price_amount, unit,
                unit_quantity, valid_from)
             values ($1, $2, 'input_tokens', 'XTS', 0.7, 'token', 1000000, '2026-06-01') returning id`,
            [ALPHA, CHANNEL],
          );
          const id = rows[0]?.id;
          await tx.query(
            `insert into public.provenance_links (subject_table, subject_id, source_document_id, role)
             values ('public.pricing_records', $1, $2, 'primary')`,
            [id, SOURCE_DOCUMENT],
          );
          await tx.query(
            "select public.nfai_transition('public.pricing_records', $1, 'validated')",
            [id],
          );
          await tx.query(
            "select public.nfai_transition('public.pricing_records', $1, 'published')",
            [id],
          );
        }),
      ).rejects.toThrow(/published_period_excl/);
    });
  });

  describe("state-at-date queries", () => {
    const priceAt = (at: string) =>
      asRole(db, "anon", (tx) =>
        tx.query<{ price_amount: string }>(
          `select price_amount from public.pricing_records
            where model_version_id = $1 and billing_dimension = 'input_tokens'
              and public.nfai_is_current_state(publication_state)
              and valid_from <= $2 and (valid_to is null or $2 < valid_to)`,
          [ALPHA, at],
        ),
      );

    it("return exactly the price in effect on each date, as the public sees it", async () => {
      expect((await priceAt("2026-02-01T00:00:00Z")).rows).toEqual([{ price_amount: "1.00" }]);
      expect((await priceAt("2026-04-01T00:00:00Z")).rows).toEqual([{ price_amount: "0.80" }]);
      expect((await priceAt("2025-12-31T00:00:00Z")).rows).toEqual([]);
    });
  });

  describe("row level security", () => {
    it("hides unpublished records from the public", async () => {
      const visible = await asRole(db, "anon", async (tx) => ({
        versions: (await tx.query<{ id: string }>("select id from public.model_versions")).rows.map(
          (r) => r.id,
        ),
        prices: (await tx.query<{ id: string }>("select id from public.pricing_records")).rows.map(
          (r) => r.id,
        ),
      }));
      expect(visible.versions).toEqual([ALPHA]);
      expect(visible.versions).not.toContain(BETA_DRAFT);
      expect(visible.prices.sort()).toEqual([OLD_PRICE, CURRENT_PRICE].sort());
    });

    it("denies public and signed-in writes", async () => {
      for (const role of ["anon", "authenticated"] as const) {
        await expect(
          asRole(db, role, (tx) =>
            tx.query("update public.model_versions set display_name = 'x' where id = $1", [ALPHA]),
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          asRole(db, role, (tx) =>
            tx.query("select public.nfai_transition('public.model_versions', $1, 'withdrawn')", [
              ALPHA,
            ]),
          ),
        ).rejects.toThrow(/permission denied/);
      }
    });

    it("keeps internal audit data away from the public", async () => {
      await expect(
        asRole(db, "anon", (tx) => tx.query("select * from public.audit_log")),
      ).rejects.toThrow(/permission denied/);
      const audited = await db.query<{ n: number }>(
        "select count(*)::int as n from public.audit_log",
      );
      expect(audited.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  describe("synthetic seed", () => {
    it("contains only obviously fictional records", async () => {
      const names = await db.query<{ value: string }>(`
        select name as value from public.providers
        union all select display_name from public.model_versions
        union all select name from public.benchmarks
        union all select publisher_name from public.sources
        union all select original_url from public.source_documents`);
      const text = names.rows.map((r) => r.value).join(" ");
      expect(text).not.toMatch(/openai|anthropic|google|gemini|claude|gpt|llama|mistral|meta\b/i);
      expect(text).toMatch(/Example AI Corp/);
      const currencies = await db.query<{ currency: string }>(
        "select distinct currency from public.pricing_records",
      );
      expect(currencies.rows).toEqual([{ currency: "XTS" }]);
    });
  });
});
