import type { PriceRecord } from "@/lib/data/domain";
import { priceSeriesKey } from "@/lib/data/mappers/pricing";
import { type HistoricalRecord, selectEffectiveRecordsByKey } from "@/lib/data/queries/history";

type Wrapped = HistoricalRecord & { record: PriceRecord };

function wrap(record: PriceRecord): Wrapped {
  return {
    id: record.id,
    publicationState: record.state,
    effective: { from: record.validFrom, to: record.validTo },
    record,
  };
}

/**
 * The price in effect at `at` for every series of the given records: one
 * record per series, published, not superseded, with [validFrom, validTo)
 * containing `at`. Overlapping current prices in one series throw.
 */
export function selectCurrentPrices(records: readonly PriceRecord[], at: Date): PriceRecord[] {
  return selectEffectiveRecordsByKey(
    records.map(wrap),
    (wrapped) => priceSeriesKey(wrapped.record.series),
    at,
    "selectCurrentPrices",
  ).map((wrapped) => wrapped.record);
}

/**
 * Full public price history, oldest first. Superseded and withdrawn records
 * are kept and labelled by `state`; they are history, never current.
 */
export function orderPriceHistory(records: readonly PriceRecord[]): PriceRecord[] {
  return [...records].sort(
    (a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom) || a.id.localeCompare(b.id),
  );
}
