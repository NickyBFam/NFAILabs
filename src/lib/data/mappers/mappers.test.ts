import { describe, expect, it } from "vitest";
import { asModelVersionId } from "@/lib/data/domain";
import { DataAccessError } from "@/lib/data/errors";
import { mapBenchmarkResult } from "@/lib/data/mappers/benchmarks";
import { mapModelVersionIdentity, mapProvider } from "@/lib/data/mappers/catalog";
import { mapPriceRecord } from "@/lib/data/mappers/pricing";
import { mapSourceCitation } from "@/lib/data/mappers/provenance";
import { toDecimalString } from "@/lib/data/mappers/values";
import {
  benchmarkMetrics,
  benchmarkResults,
  evaluationConfigurations,
  ids,
  modelFamilies,
  modelVersions,
  pricingRecords,
  priceIds,
  providers,
  provenanceLinkDetails,
  resultIds,
} from "@/test/fixtures/database/synthetic";

const byId = <T extends { id: string }>(rows: readonly T[], id: string): T => {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`fixture ${id} missing`);
  return row;
};

const provider = byId(providers, ids.provider);
const family = byId(modelFamilies, ids.family);
const v1 = byId(modelVersions, ids.v1);
const v2 = byId(modelVersions, ids.v2);
const metric = byId(benchmarkMetrics, ids.metricPassRate);
const configuration = byId(evaluationConfigurations, ids.configuration);

describe("catalog mappers", () => {
  it("preserves the exact provider → family → version identity", () => {
    const identity = mapModelVersionIdentity(provider, family, v2);
    expect(identity.provider).toMatchObject({ id: ids.provider, name: "Test Provider Labs" });
    expect(identity.family).toMatchObject({ id: ids.family, providerId: ids.provider });
    expect(identity.version).toMatchObject({
      id: ids.v2,
      familyId: ids.family,
      displayName: "Example Model v2",
      versionLabel: "v2",
    });
    // Two versions in one family keep distinct identities.
    expect(mapModelVersionIdentity(provider, family, v1).version.id).not.toBe(identity.version.id);
  });

  it("refuses to assemble an identity from rows that do not belong together", () => {
    const otherFamily = { ...family, id: ids.draftFamily, publication_state: "published" as const };
    expect(() => mapModelVersionIdentity(provider, otherFamily, v1)).toThrow(/does not belong/);
    const otherProvider = { ...provider, id: ids.draftProvider };
    expect(() => mapModelVersionIdentity(otherProvider, family, v1)).toThrow(/does not belong/);
  });

  it("never maps an unpublished catalog row", () => {
    const draft = byId(providers, ids.draftProvider);
    expect(() => mapProvider(draft)).toThrow(DataAccessError);
    for (const state of ["withdrawn", "validated", "extracted", "rejected"] as const) {
      expect(() => mapProvider({ ...provider, publication_state: state })).toThrow(/not published/);
    }
  });

  it("does not leak database column names into domain models", () => {
    const mapped = mapProvider(provider);
    expect(Object.keys(mapped).some((key) => key.includes("_"))).toBe(false);
    expect(mapped).not.toHaveProperty("publication_state");
  });
});

describe("benchmark result mapper", () => {
  const row = byId(benchmarkResults, resultIds.v2);

  it("attaches the result to the exact version, benchmark version, metric and configuration", () => {
    const result = mapBenchmarkResult(row, metric, configuration);
    expect(result.modelVersionId).toBe(ids.v2);
    expect(result.benchmarkVersionId).toBe(ids.benchmarkV1);
    expect(result.metric).toMatchObject({ id: ids.metricPassRate, higherIsBetter: true });
    expect(result.configuration).toMatchObject({
      id: ids.configuration,
      reasoning: { mode: "disabled" },
      aggregation: { method: "single_attempt", attemptsPerTask: 1 },
      toolAccess: ["none"],
    });
    expect(result.score).toBe(55);
    expect(result.confidenceInterval).toEqual({ lower: 53, upper: 57 });
  });

  it("labels first-party results as vendor-reported", () => {
    expect(mapBenchmarkResult(row, metric, configuration).origin.vendorReported).toBe(true);
    const independent = byId(benchmarkResults, resultIds.v1);
    expect(mapBenchmarkResult(independent, metric, configuration).origin.vendorReported).toBe(
      false,
    );
  });

  it("requires an exact model version, benchmark version and configuration", () => {
    expect(() =>
      mapBenchmarkResult({ ...row, model_version_id: "" }, metric, configuration),
    ).toThrow(/exact model version/);
    expect(() =>
      mapBenchmarkResult({ ...row, benchmark_version_id: "" }, metric, configuration),
    ).toThrow(/benchmark version/);
    expect(() =>
      mapBenchmarkResult({ ...row, evaluation_configuration_id: "" }, metric, configuration),
    ).toThrow(/evaluation configuration/);
  });

  it("refuses a family or provider id in place of the exact version", () => {
    // A non-version id can be a valid UUID; the brand stops it at compile time and the
    // repository compares ids at runtime. Here: an unparseable id is rejected outright.
    expect(() =>
      mapBenchmarkResult({ ...row, model_version_id: "family:example" }, metric, configuration),
    ).toThrow(DataAccessError);
  });

  it("refuses a metric or configuration that the result does not reference", () => {
    const otherMetric = byId(benchmarkMetrics, ids.metricPassRateV2);
    expect(() => mapBenchmarkResult(row, otherMetric, configuration)).toThrow(/does not match/);
    const draftConfiguration = byId(evaluationConfigurations, ids.draftConfiguration);
    expect(() => mapBenchmarkResult(row, metric, draftConfiguration)).toThrow(/does not match/);
    expect(() =>
      mapBenchmarkResult(
        { ...row, evaluation_configuration_id: ids.draftConfiguration },
        metric,
        draftConfiguration,
      ),
    ).toThrow(/not published/);
  });

  it("never maps a draft result", () => {
    const draft = byId(benchmarkResults, resultIds.v2Draft);
    expect(() => mapBenchmarkResult(draft, metric, configuration)).toThrow(
      /public publication state/,
    );
  });

  it("labels superseded and withdrawn results as history", () => {
    expect(
      mapBenchmarkResult(byId(benchmarkResults, resultIds.v1Superseded), metric, configuration)
        .state,
    ).toBe("superseded");
    expect(
      mapBenchmarkResult(byId(benchmarkResults, resultIds.v2Withdrawn), metric, configuration)
        .state,
    ).toBe("withdrawn");
  });
});

describe("pricing mapper", () => {
  it("keeps money as an exact decimal string with its currency and unit", () => {
    const record = mapPriceRecord(byId(pricingRecords, priceIds.inputAfterChange));
    expect(record.amount).toBe("8.00");
    expect(record.series).toMatchObject({
      modelVersionId: ids.v1,
      billingDimension: "input_tokens",
      currency: "XTS",
      unit: "token",
      unitQuantity: "1000000",
    });
  });

  it("writes numeric values without float artifacts or exponent notation", () => {
    expect(toDecimalString(0.1, "x")).toBe("0.1");
    expect(toDecimalString(0.0000001, "x")).toBe("0.0000001");
    expect(toDecimalString(1000000, "x")).toBe("1000000");
    expect(toDecimalString(1e21, "x")).toBe("1000000000000000000000");
    expect(toDecimalString(-2.5e-8, "x")).toBe("-0.000000025");
    expect(toDecimalString("12.345678901234567890", "x")).toBe("12.345678901234567890");
    expect(() => toDecimalString("1e3", "x")).toThrow(DataAccessError);
    expect(() => toDecimalString(Number.NaN, "x")).toThrow(DataAccessError);
  });

  it("never maps a draft price", () => {
    expect(() => mapPriceRecord(byId(pricingRecords, priceIds.inputFutureDraft))).toThrow(
      /public publication state/,
    );
  });
});

describe("source citation mapper", () => {
  it("prefers the current canonical URL and drops internal fields", () => {
    const moved = provenanceLinkDetails.find((row) => row.role === "primary")!;
    const citation = mapSourceCitation(moved);
    expect(citation.document.url).toBe("https://source.example.test/results/2-moved");
    expect(JSON.stringify(citation)).not.toMatch(/content_sha256|evidence|Internal synthetic note/);
    expect(citation).not.toHaveProperty("contentSha256");
  });
});

describe("branded ids", () => {
  it("accepts only UUIDs as exact model version ids", () => {
    expect(asModelVersionId(ids.v1)).toBe(ids.v1);
    expect(() => asModelVersionId("example-model-v1")).toThrow(DataAccessError);
  });
});
