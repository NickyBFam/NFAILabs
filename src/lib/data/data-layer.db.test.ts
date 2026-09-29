import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asModelVersionId } from "@/lib/data/domain";
import { listPublishedResultsForModelVersion } from "@/lib/data/repositories/benchmarks";
import {
  getModelVersionIdentity,
  listPublishedModelVersionsInFamily,
  listPublishedProviders,
} from "@/lib/data/repositories/catalog";
import { getCurrentPrices, getPriceHistory } from "@/lib/data/repositories/pricing";
import { listCitations } from "@/lib/data/repositories/provenance";
import { asModelFamilyId } from "@/lib/data/domain";
import { asRole, createTestDatabase } from "@/test/db/harness";
import { FIXTURE_TABLES, loadSyntheticFixtures } from "@/test/fixtures/database/load";
import { createPgliteClient } from "@/test/fixtures/database/pglite-client";
import {
  ids,
  priceIds,
  provenanceLinkDetails,
  resultIds,
} from "@/test/fixtures/database/synthetic";

/**
 * Runs the data-access layer against the real migrations (supabase/migrations)
 * in an in-process PostgreSQL database, as the anon API role, so Row Level
 * Security, grants and the publication workflow all apply. Fixtures are the
 * synthetic rows from src/test/fixtures/database, loaded through the workflow.
 */

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await loadSyntheticFixtures(db);
});

afterAll(async () => {
  await db?.close();
});

const anon = () => createPgliteClient(db, "anon");
const v1 = asModelVersionId(ids.v1);
const v2 = asModelVersionId(ids.v2);

async function columnsOf(relation: string): Promise<string[]> {
  const result = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by column_name`,
    [relation],
  );
  return result.rows.map((row) => row.column_name);
}

describe("hand-written row types match the migrations", () => {
  // Fixture rows are typed with the exact row types, so their keys are the typed columns.
  it.each(FIXTURE_TABLES.map(([table, rows]) => [table, rows[0]!] as const))(
    "%s",
    async (table, sample) => {
      expect(Object.keys(sample).sort()).toEqual(await columnsOf(table));
    },
  );

  it("provenance_link_details", async () => {
    expect(Object.keys(provenanceLinkDetails[0]!).sort()).toEqual(
      await columnsOf("provenance_link_details"),
    );
  });
});

describe("repositories against PostgreSQL as the anon role", () => {
  it("lists only published providers", async () => {
    const providers = await listPublishedProviders(anon());
    expect(providers.map((provider) => provider.id)).toEqual([ids.provider]);
  });

  it("lists the published versions of a family", async () => {
    const versions = await listPublishedModelVersionsInFamily(anon(), asModelFamilyId(ids.family));
    expect(versions.map((version) => version.id)).toEqual([ids.v1, ids.v2]);
  });

  it("resolves exact identity and hides versions under unpublished parents", async () => {
    const identity = await getModelVersionIdentity(anon(), v2);
    expect(identity?.version.displayName).toBe("Example Model v2");
    expect(identity?.family.id).toBe(ids.family);
    expect(identity?.provider.id).toBe(ids.provider);
    expect(
      await getModelVersionIdentity(anon(), asModelVersionId(ids.draftFamilyVersion)),
    ).toBeNull();
    expect(await getModelVersionIdentity(anon(), asModelVersionId(ids.v3Draft))).toBeNull();
  });

  it("chooses the effective price across a historical price change", async () => {
    const at = (iso: string) => new Date(iso);
    const inputAt = async (iso: string) =>
      (await getCurrentPrices(anon(), v1, at(iso))).find(
        (price) => price.series.billingDimension === "input_tokens",
      );
    expect((await inputAt("2026-03-31T23:59:59Z"))?.id).toBe(priceIds.inputBeforeChange);
    expect((await inputAt("2026-04-01T00:00:00Z"))?.id).toBe(priceIds.inputAfterChange);
    // The draft future price never becomes current.
    expect((await inputAt("2026-10-01T00:00:00Z"))?.id).toBe(priceIds.inputAfterChange);
  });

  it("returns the correction, never the superseded price, as current", async () => {
    const prices = await getCurrentPrices(anon(), v1, new Date("2026-05-01T00:00:00Z"));
    const output = prices.filter((price) => price.series.billingDimension === "output_tokens");
    expect(output.map((price) => [price.id, price.amount])).toEqual([
      [priceIds.outputCorrected, "20"],
    ]);
  });

  it("agrees with the SQL definition of a current price", async () => {
    for (const iso of ["2026-01-15T00:00:00Z", "2026-04-01T00:00:00Z", "2026-12-01T00:00:00Z"]) {
      const sql = await asRole(db, "anon", (tx) =>
        tx.query<{ id: string }>(
          `select id from public.pricing_records
            where model_version_id = $1
              and public.nfai_is_current_state(publication_state)
              and valid_from <= $2 and (valid_to is null or valid_to > $2)
            order by id`,
          [ids.v1, iso],
        ),
      );
      const typescript = (await getCurrentPrices(anon(), v1, new Date(iso)))
        .map((p) => p.id)
        .sort();
      expect(typescript, iso).toEqual(sql.rows.map((row) => row.id));
    }
  });

  it("keeps the corrected price in labelled public history", async () => {
    const history = await getPriceHistory(anon(), v1);
    expect(history.find((price) => price.id === priceIds.outputWrong)?.state).toBe("superseded");
    expect(history.some((price) => price.id === priceIds.inputFutureDraft)).toBe(false);
  });

  it("returns published results only for the exact version requested", async () => {
    const v1Results = await listPublishedResultsForModelVersion(anon(), v1);
    expect(v1Results.map((result) => result.id).sort()).toEqual(
      [resultIds.v1, resultIds.v1Correction].sort(),
    );
    const v2Results = await listPublishedResultsForModelVersion(anon(), v2);
    expect(v2Results.map((result) => result.id)).toEqual([resultIds.v2]);
    expect(v2Results[0]?.origin.vendorReported).toBe(true);
    expect(v2Results[0]?.configuration.aggregation.method).toBe("single_attempt");
  });

  it("returns active citations with the primary source first", async () => {
    const citations = await listCitations(anon(), "benchmark_results", resultIds.v1);
    expect(citations.map((citation) => citation.role)).toEqual(["primary", "corroborating"]);
    expect(citations[0]?.document.url).toBe("https://source.example.test/results/2-moved");
    expect(citations[0]?.tierAtCitation).toBe("T2");
  });
});

describe("public reads never see internal workflow states", () => {
  it.each(FIXTURE_TABLES.map(([table]) => table))("%s", async (table) => {
    const result = await asRole(db, "anon", (tx) =>
      tx.query<{ publication_state: string }>(
        `select distinct publication_state from public."${table}"`,
      ),
    );
    for (const { publication_state } of result.rows) {
      expect(["published", "superseded", "withdrawn"]).toContain(publication_state);
    }
  });
});
