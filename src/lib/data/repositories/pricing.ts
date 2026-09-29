import type { PublicClient } from "@/lib/data/clients/types";
import type { ModelVersionId, PriceRecord } from "@/lib/data/domain";
import { mapPriceRecord } from "@/lib/data/mappers/pricing";
import { CURRENT_STATE, PUBLIC_STATES } from "@/lib/data/queries/history";
import { orderPriceHistory, selectCurrentPrices } from "@/lib/data/queries/pricing";
import { rowsOf } from "@/lib/data/repositories/response";

/**
 * Prices in effect at `at` (default: now) for one exact model version, one
 * record per price series. The database narrows to published rows that have
 * started; the effective-period rule is applied by `selectCurrentPrices`.
 */
export async function getCurrentPrices(
  client: PublicClient,
  modelVersionId: ModelVersionId,
  at: Date = new Date(),
): Promise<PriceRecord[]> {
  const rows = await rowsOf(
    "getCurrentPrices",
    client
      .from("pricing_records")
      .select("*")
      .eq("model_version_id", modelVersionId)
      .eq("publication_state", CURRENT_STATE)
      .lte("valid_from", at.toISOString()),
  );
  return selectCurrentPrices(rows.map(mapPriceRecord), at);
}

/** Public price history for one exact version, oldest first, states labelled. */
export async function getPriceHistory(
  client: PublicClient,
  modelVersionId: ModelVersionId,
): Promise<PriceRecord[]> {
  const rows = await rowsOf(
    "getPriceHistory",
    client
      .from("pricing_records")
      .select("*")
      .eq("model_version_id", modelVersionId)
      .in("publication_state", [...PUBLIC_STATES]),
  );
  return orderPriceHistory(rows.map(mapPriceRecord));
}
