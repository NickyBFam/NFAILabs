import type { BenchmarkResult, ModelVersionId } from "@/lib/data/domain";
import { invalidData } from "@/lib/data/errors";

/**
 * Published results for exactly one model version.
 *
 * A result for any other version is a query bug, not something to filter away
 * quietly: attributing it to this version would be exactly the family- or
 * provider-level blurring METHODOLOGY.md §1 forbids, so it throws.
 * Superseded and withdrawn results are history and are excluded here.
 */
export function selectPublishedResultsForVersion(
  results: readonly BenchmarkResult[],
  modelVersionId: ModelVersionId,
): BenchmarkResult[] {
  for (const result of results) {
    if (result.modelVersionId !== modelVersionId) {
      throw invalidData("selectPublishedResultsForVersion", "result for a different model version");
    }
  }
  return results.filter((result) => result.state === "published");
}
