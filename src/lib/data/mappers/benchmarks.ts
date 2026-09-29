import {
  asBenchmarkMetricId,
  asBenchmarkVersionId,
  asDeploymentChannelId,
  asEvaluationConfigurationId,
  asModelVersionId,
  type BenchmarkMetric,
  type BenchmarkResult,
  type EvaluationConfiguration,
} from "@/lib/data/domain";
import { invalidData } from "@/lib/data/errors";
import { toNumber, toNumberOrNull, toPublicFactState } from "@/lib/data/mappers/values";
import { CURRENT_STATE } from "@/lib/data/queries/history";
import type {
  BenchmarkMetricRow,
  BenchmarkResultRow,
  EvaluationConfigurationRow,
} from "@/types/database";

export function mapBenchmarkMetric(row: BenchmarkMetricRow): BenchmarkMetric {
  if (row.publication_state !== CURRENT_STATE) {
    throw invalidData("mapBenchmarkMetric", "metric is not published");
  }
  return {
    id: asBenchmarkMetricId(row.id),
    key: row.key,
    name: row.name,
    unit: row.unit,
    higherIsBetter: row.higher_is_better,
    minValue: toNumberOrNull(row.min_value, "min_value"),
    maxValue: toNumberOrNull(row.max_value, "max_value"),
  };
}

export function mapEvaluationConfiguration(
  row: EvaluationConfigurationRow,
): EvaluationConfiguration {
  if (row.publication_state !== CURRENT_STATE) {
    throw invalidData("mapEvaluationConfiguration", "configuration is not published");
  }
  return {
    id: asEvaluationConfigurationId(row.id),
    label: row.label,
    disclosureLevel: row.disclosure_level,
    reasoning: {
      mode: row.reasoning_mode,
      effort: row.reasoning_effort,
      budgetTokens: row.reasoning_budget_tokens,
    },
    sampling: {
      temperature: toNumberOrNull(row.temperature, "temperature"),
      topP: toNumberOrNull(row.top_p, "top_p"),
    },
    maxOutputTokens: row.max_output_tokens,
    aggregation: { method: row.aggregation_method, attemptsPerTask: row.attempts_per_task },
    prompting: { style: row.prompting_style, fewShotExamples: row.few_shot_examples },
    toolAccess: [...row.tool_access],
    harness: {
      disclosure: row.harness_disclosure,
      harnessVersionId: row.evaluation_harness_version_id,
    },
    limits: {
      steps: row.step_limit,
      timeSeconds: row.time_limit_seconds,
      tokenBudget: row.token_budget,
    },
    weightsPrecision: row.weights_precision,
  };
}

/**
 * A benchmark result is only meaningful attached to its exact model version,
 * benchmark version, metric, and evaluation configuration (METHODOLOGY.md §5,
 * D-003). The mapper refuses rows where any of these is missing or where the
 * supplied metric/configuration rows are not the ones the result references.
 */
export function mapBenchmarkResult(
  row: BenchmarkResultRow,
  metricRow: BenchmarkMetricRow,
  configurationRow: EvaluationConfigurationRow,
): BenchmarkResult {
  const operation = "mapBenchmarkResult";
  if (!row.model_version_id) throw invalidData(operation, "missing exact model version");
  if (!row.benchmark_version_id) throw invalidData(operation, "missing benchmark version");
  if (!row.evaluation_configuration_id)
    throw invalidData(operation, "missing evaluation configuration");
  if (metricRow.id !== row.benchmark_metric_id) {
    throw invalidData(operation, "metric row does not match the result");
  }
  if (metricRow.benchmark_version_id !== row.benchmark_version_id) {
    throw invalidData(operation, "metric belongs to a different benchmark version");
  }
  if (configurationRow.id !== row.evaluation_configuration_id) {
    throw invalidData(operation, "configuration row does not match the result");
  }

  const hasInterval = row.score_ci_lower !== null && row.score_ci_upper !== null;
  return {
    id: row.id,
    modelVersionId: asModelVersionId(row.model_version_id),
    benchmarkVersionId: asBenchmarkVersionId(row.benchmark_version_id),
    metric: mapBenchmarkMetric(metricRow),
    configuration: mapEvaluationConfiguration(configurationRow),
    deploymentChannelId:
      row.deployment_channel_id === null ? null : asDeploymentChannelId(row.deployment_channel_id),
    score: toNumber(row.score, "score"),
    confidenceInterval: hasInterval
      ? {
          lower: toNumber(row.score_ci_lower!, "score_ci_lower"),
          upper: toNumber(row.score_ci_upper!, "score_ci_upper"),
        }
      : null,
    trialCount: row.trial_count,
    subset: row.subset_label,
    origin: {
      type: row.origin_type,
      vendorReported: row.origin_type === "first_party",
      evaluatorName: row.evaluator_name,
    },
    reproducibilityGrade: row.reproducibility_grade,
    evaluatedOn: { date: row.evaluated_on, precision: row.evaluated_on_precision },
    reportedOn: row.reported_on,
    contaminationStatus: row.contamination_status,
    verificationStatus: row.verification_status,
    state: toPublicFactState(row.publication_state, operation),
  };
}
