import { invalidData } from "@/lib/data/errors";
import type { PublicationState } from "@/types/database";

/**
 * History semantics for append-only, effective-dated facts
 * (docs/ARCHITECTURE.md §7, D-010, docs/DATABASE.md §4).
 *
 * A record is CURRENT at time T when its publication state is `published`
 * (the only state with `publication_states.is_current`) and its half-open
 * valid period [valid_from, valid_to) contains T. Superseded and withdrawn
 * records stay visible as labelled history but are never current.
 *
 * These rules run in TypeScript as a second line of defense after the database
 * (RLS and SQL helpers): even if a query returns a draft, superseded, or
 * out-of-period row, it never becomes "current" in the application.
 */

/** Publication states that are part of the public historical record (`is_public`). */
export const PUBLIC_STATES: ReadonlySet<PublicationState> = new Set([
  "published",
  "superseded",
  "withdrawn",
]);

/** The only publication state that is in force (`is_current`). */
export const CURRENT_STATE: PublicationState = "published";

export function isPublicState(state: string): state is PublicationState {
  return PUBLIC_STATES.has(state as PublicationState);
}

/** `from` inclusive, `to` exclusive (null = open-ended). ISO 8601 date or timestamp. */
export type EffectivePeriod = {
  from: string;
  to: string | null;
};

export type HistoricalRecord = {
  id: string;
  publicationState: PublicationState;
  effective: EffectivePeriod;
};

function toTime(value: string, field: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw invalidData("history", `${field} is not a valid date`);
  }
  return time;
}

export function isWithinPeriod(period: EffectivePeriod, at: Date): boolean {
  const atTime = at.getTime();
  if (atTime < toTime(period.from, "effective.from")) return false;
  return period.to === null || atTime < toTime(period.to, "effective.to");
}

/** Published (not draft, superseded, withdrawn, ...) and in its valid period at `at`. */
export function isCurrentAt(record: HistoricalRecord, at: Date): boolean {
  return record.publicationState === CURRENT_STATE && isWithinPeriod(record.effective, at);
}

/**
 * The record in effect at `at` among records for ONE key, or null.
 *
 * Two current records for one key at the same moment is a data-integrity
 * problem (overlapping periods), not a tie to break silently: it throws.
 */
export function selectEffectiveRecord<T extends HistoricalRecord>(
  records: readonly T[],
  at: Date,
  operation = "selectEffectiveRecord",
): T | null {
  const current = records.filter((record) => isCurrentAt(record, at));
  if (current.length > 1) {
    throw invalidData(operation, `${current.length} current records overlap`);
  }
  return current[0] ?? null;
}

/**
 * Groups records by key and returns the record in effect at `at` for each key.
 * Keys with no current record are omitted. Output order follows first appearance.
 */
export function selectEffectiveRecordsByKey<T extends HistoricalRecord>(
  records: readonly T[],
  keyOf: (record: T) => string,
  at: Date,
  operation = "selectEffectiveRecordsByKey",
): T[] {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const key = keyOf(record);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }
  const result: T[] = [];
  for (const group of groups.values()) {
    const current = selectEffectiveRecord(group, at, operation);
    if (current) result.push(current);
  }
  return result;
}
