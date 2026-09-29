import { invalidData } from "@/lib/data/errors";
import type {
  AggregationMethod,
  BillingDimension,
  ChannelType,
  Confidence,
  ContaminationStatus,
  DatePrecision,
  DisclosureLevel,
  HarnessDisclosure,
  OriginType,
  PriceUnit,
  PromptingStyle,
  ProvenanceRole,
  PublicationState,
  ReasoningMode,
  ReproducibilityGrade,
  ServiceTier,
  SourceTier,
  ToolAccess,
  VerificationStatus,
} from "@/types/database";

/**
 * Application/domain models returned by the data-access layer.
 *
 * They hide database details (snake_case columns, numeric encodings, internal
 * workflow states) from the rest of the app. UI code imports these, never the
 * row types in `@/types/database`.
 */

// ---------------------------------------------------------------------------
// Branded identifiers
// ---------------------------------------------------------------------------

declare const brand: unique symbol;
type Id<Kind extends string> = string & { readonly [brand]: Kind };

export type ProviderId = Id<"ProviderId">;
export type DeploymentChannelId = Id<"DeploymentChannelId">;
export type ModelFamilyId = Id<"ModelFamilyId">;
/**
 * An exact model version. Benchmark results and prices are only queryable by
 * this id, so a provider or family id cannot be passed where an exact version
 * is required (METHODOLOGY.md §1, D-003).
 */
export type ModelVersionId = Id<"ModelVersionId">;
export type BenchmarkId = Id<"BenchmarkId">;
export type BenchmarkVersionId = Id<"BenchmarkVersionId">;
export type BenchmarkMetricId = Id<"BenchmarkMetricId">;
export type EvaluationConfigurationId = Id<"EvaluationConfigurationId">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toId<T extends Id<string>>(kind: string, value: string): T {
  if (!UUID.test(value)) {
    throw invalidData(kind, "not a UUID");
  }
  return value.toLowerCase() as T;
}

export const asProviderId = (value: string) => toId<ProviderId>("ProviderId", value);
export const asDeploymentChannelId = (value: string) =>
  toId<DeploymentChannelId>("DeploymentChannelId", value);
export const asModelFamilyId = (value: string) => toId<ModelFamilyId>("ModelFamilyId", value);
export const asModelVersionId = (value: string) => toId<ModelVersionId>("ModelVersionId", value);
export const asBenchmarkId = (value: string) => toId<BenchmarkId>("BenchmarkId", value);
export const asBenchmarkVersionId = (value: string) =>
  toId<BenchmarkVersionId>("BenchmarkVersionId", value);
export const asBenchmarkMetricId = (value: string) =>
  toId<BenchmarkMetricId>("BenchmarkMetricId", value);
export const asEvaluationConfigurationId = (value: string) =>
  toId<EvaluationConfigurationId>("EvaluationConfigurationId", value);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type Provider = {
  id: ProviderId;
  slug: string;
  name: string;
  organizationType: string | null;
  websiteUrl: string | null;
  description: string | null;
};

export type DeploymentChannel = {
  id: DeploymentChannelId;
  providerId: ProviderId;
  slug: string;
  name: string;
  channelType: ChannelType;
};

export type ModelFamily = {
  id: ModelFamilyId;
  providerId: ProviderId;
  slug: string;
  name: string;
  description: string | null;
};

export type ModelVersion = {
  id: ModelVersionId;
  familyId: ModelFamilyId;
  slug: string;
  displayName: string;
  /** The provider's own version string, verbatim. */
  versionLabel: string | null;
  snapshotDate: string | null;
  baseModelVersionId: ModelVersionId | null;
  description: string | null;
};

/** The full, unambiguous identity of one exact model version. */
export type ModelVersionIdentity = {
  provider: Provider;
  family: ModelFamily;
  version: ModelVersion;
};

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** States a publicly visible fact can be in (`publication_states.is_public`). */
export type PublicFactState = Extract<PublicationState, "published" | "superseded" | "withdrawn">;

export type BenchmarkMetric = {
  id: BenchmarkMetricId;
  key: string;
  name: string;
  unit: string;
  higherIsBetter: boolean;
  minValue: number | null;
  maxValue: number | null;
};

export type EvaluationConfiguration = {
  id: EvaluationConfigurationId;
  label: string;
  disclosureLevel: DisclosureLevel;
  reasoning: { mode: ReasoningMode; effort: string | null; budgetTokens: number | null };
  sampling: { temperature: number | null; topP: number | null };
  maxOutputTokens: number | null;
  aggregation: { method: AggregationMethod; attemptsPerTask: number | null };
  prompting: { style: PromptingStyle; fewShotExamples: number | null };
  toolAccess: readonly ToolAccess[];
  harness: { disclosure: HarnessDisclosure; harnessVersionId: string | null };
  limits: { steps: number | null; timeSeconds: number | null; tokenBudget: number | null };
  weightsPrecision: string | null;
};

export type BenchmarkResult = {
  id: string;
  /** Always the exact model version that was evaluated. */
  modelVersionId: ModelVersionId;
  benchmarkVersionId: BenchmarkVersionId;
  metric: BenchmarkMetric;
  configuration: EvaluationConfiguration;
  deploymentChannelId: DeploymentChannelId | null;
  score: number;
  confidenceInterval: { lower: number; upper: number } | null;
  trialCount: number | null;
  subset: string;
  origin: {
    type: OriginType;
    /** METHODOLOGY.md §3.1: first-party results are labelled vendor-reported everywhere. */
    vendorReported: boolean;
    evaluatorName: string | null;
  };
  reproducibilityGrade: ReproducibilityGrade;
  evaluatedOn: { date: string | null; precision: DatePrecision };
  reportedOn: string | null;
  contaminationStatus: ContaminationStatus;
  verificationStatus: VerificationStatus;
  state: PublicFactState;
};

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Identifies one price series; a price change is a new record in the same series. */
export type PriceSeries = {
  modelVersionId: ModelVersionId;
  deploymentChannelId: DeploymentChannelId;
  billingDimension: BillingDimension;
  dimensionDetail: string | null;
  serviceTier: ServiceTier;
  contextThresholdTokens: number | null;
  region: string | null;
  currency: string;
  unit: PriceUnit;
  /** Decimal string, e.g. "1000000" for "per million tokens". */
  unitQuantity: string;
};

export type PriceRecord = {
  id: string;
  series: PriceSeries;
  /** Exact decimal string; never converted to a float. */
  amount: string;
  validFrom: string;
  validTo: string | null;
  announcedOn: string | null;
  state: PublicFactState;
};

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export type SourceCitation = {
  role: ProvenanceRole;
  tierAtCitation: SourceTier;
  confidence: Confidence;
  confidenceReason: string | null;
  locator: string | null;
  document: {
    title: string;
    kind: string;
    /** Latest canonical URL when the page moved, else the URL first cited. */
    url: string | null;
    externalIdentifier: string | null;
    publishedOn: string | null;
  };
  source: { name: string; publisher: string };
  retrievedAt: string | null;
};
