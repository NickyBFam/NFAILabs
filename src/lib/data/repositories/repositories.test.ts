import { describe, expect, it } from "vitest";
import {
  asModelFamilyId,
  asModelVersionId,
  type ModelFamilyId,
  type ProviderId,
} from "@/lib/data/domain";
import { DataAccessError } from "@/lib/data/errors";
import { listPublishedResultsForModelVersion } from "@/lib/data/repositories/benchmarks";
import {
  getModelVersionIdentity,
  getPublishedProviderBySlug,
  listPublishedModelVersionsInFamily,
  listPublishedProviders,
} from "@/lib/data/repositories/catalog";
import { getCurrentPrices, getPriceHistory } from "@/lib/data/repositories/pricing";
import { listCitations } from "@/lib/data/repositories/provenance";
import { createFakeClient } from "@/test/fixtures/database/fake-client";
import {
  benchmarkResults,
  ids,
  priceIds,
  resultIds,
  syntheticTables,
} from "@/test/fixtures/database/synthetic";

const v1 = asModelVersionId(ids.v1);
const v2 = asModelVersionId(ids.v2);

describe("catalog repository", () => {
  it("lists only published providers and filters by state in the query", async () => {
    const { client, queries } = createFakeClient(syntheticTables);
    const providers = await listPublishedProviders(client);
    expect(providers.map((provider) => provider.name)).toEqual(["Test Provider Labs"]);
    expect(queries[0]?.filters).toContainEqual(["eq", "publication_state", "published"]);
  });

  it("fails closed when the database returns an unpublished row", async () => {
    // Simulates a missing RLS policy or a dropped filter.
    const { client } = createFakeClient(syntheticTables, { ignoreFilters: true });
    await expect(listPublishedProviders(client)).rejects.toThrow(/not published/);
  });

  it("finds a published provider by slug, and not a draft one", async () => {
    const { client } = createFakeClient(syntheticTables);
    expect((await getPublishedProviderBySlug(client, "test-provider-labs"))?.id).toBe(ids.provider);
    expect(await getPublishedProviderBySlug(client, "draft-provider-example")).toBeNull();
  });

  it("lists the published versions of a family, excluding drafts", async () => {
    const { client } = createFakeClient(syntheticTables);
    const versions = await listPublishedModelVersionsInFamily(client, asModelFamilyId(ids.family));
    expect(versions.map((version) => version.displayName)).toEqual([
      "Example Model v1",
      "Example Model v2",
    ]);
  });

  it("resolves the exact identity chain for a version", async () => {
    const { client } = createFakeClient(syntheticTables);
    const identity = await getModelVersionIdentity(client, v1);
    expect(identity?.version.id).toBe(ids.v1);
    expect(identity?.family.id).toBe(ids.family);
    expect(identity?.provider.id).toBe(ids.provider);
  });

  it("hides a version whose family or own record is not published", async () => {
    const { client } = createFakeClient(syntheticTables);
    expect(
      await getModelVersionIdentity(client, asModelVersionId(ids.draftFamilyVersion)),
    ).toBeNull();
    expect(await getModelVersionIdentity(client, asModelVersionId(ids.v3Draft))).toBeNull();
  });
});

describe("pricing repository", () => {
  it("chooses the price record in effect at the as-of time", async () => {
    const { client } = createFakeClient(syntheticTables);
    const before = await getCurrentPrices(client, v1, new Date("2026-03-15T00:00:00Z"));
    const after = await getCurrentPrices(client, v1, new Date("2026-05-01T00:00:00Z"));
    const input = (prices: typeof before) =>
      prices.find((price) => price.series.billingDimension === "input_tokens");
    expect(input(before)?.id).toBe(priceIds.inputBeforeChange);
    expect(input(before)?.amount).toBe("10.00");
    expect(input(after)?.id).toBe(priceIds.inputAfterChange);
    expect(input(after)?.amount).toBe("8.00");
  });

  it("never returns a superseded price as current", async () => {
    const { client } = createFakeClient(syntheticTables, { ignoreFilters: false });
    const prices = await getCurrentPrices(client, v1, new Date("2026-05-01T00:00:00Z"));
    const output = prices.filter((price) => price.series.billingDimension === "output_tokens");
    expect(output.map((price) => price.id)).toEqual([priceIds.outputCorrected]);
  });

  it("ignores drafts and future prices even if the database returns them", async () => {
    const { client } = createFakeClient(
      {
        pricing_records: syntheticTables.pricing_records.filter(
          (row) => row.model_version_id === ids.v1,
        ),
      },
      { ignoreFilters: true },
    );
    // The draft is not mappable as public data, so a leak fails closed.
    await expect(getCurrentPrices(client, v1, new Date("2026-10-01T00:00:00Z"))).rejects.toThrow(
      DataAccessError,
    );
  });

  it("returns no price before the first record takes effect", async () => {
    const { client } = createFakeClient(syntheticTables);
    expect(await getCurrentPrices(client, v1, new Date("2025-12-31T23:59:59Z"))).toEqual([]);
  });

  it("keeps prices of one version separate from another version in the family", async () => {
    const { client } = createFakeClient(syntheticTables);
    const prices = await getCurrentPrices(client, v2, new Date("2026-05-01T00:00:00Z"));
    expect(prices.map((price) => price.id)).toEqual([priceIds.v2Input]);
  });

  it("returns public price history with superseded records labelled, oldest first", async () => {
    const { client } = createFakeClient(syntheticTables);
    const history = await getPriceHistory(client, v1);
    expect(history.map((price) => [price.id, price.state])).toEqual([
      [priceIds.inputBeforeChange, "published"],
      [priceIds.outputWrong, "superseded"],
      [priceIds.outputCorrected, "published"],
      [priceIds.inputAfterChange, "published"],
    ]);
  });
});

describe("benchmark results repository", () => {
  it("returns only published results for the exact version requested", async () => {
    const { client, queries } = createFakeClient(syntheticTables);
    const results = await listPublishedResultsForModelVersion(client, v1);
    expect(results.map((result) => result.id).sort()).toEqual(
      [resultIds.v1, resultIds.v1Correction].sort(),
    );
    expect(results.every((result) => result.modelVersionId === ids.v1)).toBe(true);
    expect(queries[0]?.filters).toContainEqual(["eq", "model_version_id", ids.v1]);
    expect(queries[0]?.filters).toContainEqual(["eq", "publication_state", "published"]);
  });

  it("does not mix results of two versions in the same family", async () => {
    const { client } = createFakeClient(syntheticTables);
    const results = await listPublishedResultsForModelVersion(client, v2);
    expect(results.map((result) => result.id)).toEqual([resultIds.v2]);
  });

  it("throws rather than attribute another version's result to the requested one", async () => {
    const published = benchmarkResults.filter((row) => row.publication_state === "published");
    const { client } = createFakeClient(
      { ...syntheticTables, benchmark_results: published },
      { ignoreFilters: true },
    );
    await expect(listPublishedResultsForModelVersion(client, v1)).rejects.toThrow(
      /different model version/,
    );
  });

  it("refuses a result whose evaluation configuration is not public", async () => {
    const { client } = createFakeClient({
      ...syntheticTables,
      benchmark_results: [
        { ...benchmarkResults[0]!, evaluation_configuration_id: ids.draftConfiguration },
      ],
    });
    await expect(listPublishedResultsForModelVersion(client, v1)).rejects.toThrow(
      /unpublished evaluation configuration/,
    );
  });

  it("only accepts an exact model version id", () => {
    const familyId = ids.family as ModelFamilyId;
    const providerId = ids.provider as ProviderId;
    const { client } = createFakeClient(syntheticTables);
    // @ts-expect-error A family id is not an exact model version.
    void listPublishedResultsForModelVersion(client, familyId).catch(() => undefined);
    // @ts-expect-error A provider id is not an exact model version.
    void getCurrentPrices(client, providerId).catch(() => undefined);
    // @ts-expect-error A plain string is not an exact model version.
    void listPublishedResultsForModelVersion(client, ids.v1).catch(() => undefined);
  });
});

describe("citations repository", () => {
  it("returns active, citable sources with the primary source first", async () => {
    const { client } = createFakeClient(syntheticTables, { ignoreFilters: true });
    const citations = await listCitations(client, "benchmark_results", resultIds.v1);
    expect(citations.map((citation) => citation.role)).toEqual(["primary", "corroborating"]);
    expect(citations[0]?.source.name).toBe("Synthetic Test Source");
  });
});

describe("error handling", () => {
  it("wraps database errors without leaking them to public messages", async () => {
    const dbError = { message: 'relation "public.audit_log" is internal', code: "42501" };
    const { client } = createFakeClient(syntheticTables, { errors: { providers: dbError } });
    const failure = await listPublishedProviders(client).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DataAccessError);
    const error = failure as DataAccessError;
    expect(error.code).toBe("query_failed");
    expect(error.cause).toBe(dbError);
    expect(error.publicMessage).not.toMatch(/audit_log|42501/);
  });
});
