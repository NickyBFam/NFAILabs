import type { PublicClient } from "@/lib/data/clients/types";
import type { BenchmarkResult, ModelVersionId } from "@/lib/data/domain";
import { invalidData } from "@/lib/data/errors";
import { mapBenchmarkResult } from "@/lib/data/mappers/benchmarks";
import { selectPublishedResultsForVersion } from "@/lib/data/queries/benchmarks";
import { CURRENT_STATE } from "@/lib/data/queries/history";
import { rowsOf } from "@/lib/data/repositories/response";

/**
 * Published benchmark results for ONE exact model version, each with its
 * metric and full evaluation configuration.
 *
 * There is deliberately no function that lists results by provider or family:
 * results belong to exact versions (METHODOLOGY.md §1, D-003). Grouping
 * results into comparable sets is Phase 5 work (METHODOLOGY.md §6).
 */
export async function listPublishedResultsForModelVersion(
  client: PublicClient,
  modelVersionId: ModelVersionId,
): Promise<BenchmarkResult[]> {
  const operation = "listPublishedResultsForModelVersion";
  const results = await rowsOf(
    operation,
    client
      .from("benchmark_results")
      .select("*")
      .eq("model_version_id", modelVersionId)
      .eq("publication_state", CURRENT_STATE),
  );
  if (results.length === 0) return [];

  const metricIds = [...new Set(results.map((row) => row.benchmark_metric_id))];
  const configurationIds = [...new Set(results.map((row) => row.evaluation_configuration_id))];
  const [metrics, configurations] = await Promise.all([
    rowsOf(
      operation,
      client
        .from("benchmark_metrics")
        .select("*")
        .in("id", metricIds)
        .eq("publication_state", CURRENT_STATE),
    ),
    rowsOf(
      operation,
      client
        .from("evaluation_configurations")
        .select("*")
        .in("id", configurationIds)
        .eq("publication_state", CURRENT_STATE),
    ),
  ]);
  const metricById = new Map(metrics.map((row) => [row.id, row]));
  const configurationById = new Map(configurations.map((row) => [row.id, row]));

  const mapped = results.map((row) => {
    const metric = metricById.get(row.benchmark_metric_id);
    const configuration = configurationById.get(row.evaluation_configuration_id);
    // A published result whose metric or configuration is not publicly visible
    // cannot be shown without its conditions: surface it, never drop the context.
    if (!metric) throw invalidData(operation, "result references an unpublished metric");
    if (!configuration) {
      throw invalidData(operation, "result references an unpublished evaluation configuration");
    }
    return mapBenchmarkResult(row, metric, configuration);
  });
  return selectPublishedResultsForVersion(mapped, modelVersionId);
}
