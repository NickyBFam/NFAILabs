import { describe, expect, it } from "vitest";
import { DataAccessError } from "@/lib/data/errors";
import {
  type HistoricalRecord,
  isCurrentAt,
  isPublicState,
  isWithinPeriod,
  selectEffectiveRecord,
  selectEffectiveRecordsByKey,
} from "@/lib/data/queries/history";
import type { PublicationState } from "@/types/database";

type TestRecord = HistoricalRecord & { key: string };

function record(
  id: string,
  from: string,
  to: string | null,
  options: { state?: PublicationState; key?: string } = {},
): TestRecord {
  return {
    id,
    key: options.key ?? "k",
    publicationState: options.state ?? "published",
    effective: { from, to },
  };
}

const at = (iso: string) => new Date(iso);

describe("isWithinPeriod", () => {
  it("treats the start as inclusive and the end as exclusive", () => {
    const period = { from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" };
    expect(isWithinPeriod(period, at("2025-12-31T23:59:59Z"))).toBe(false);
    expect(isWithinPeriod(period, at("2026-01-01T00:00:00Z"))).toBe(true);
    expect(isWithinPeriod(period, at("2026-01-31T23:59:59Z"))).toBe(true);
    expect(isWithinPeriod(period, at("2026-02-01T00:00:00Z"))).toBe(false);
  });

  it("treats a null end as open-ended", () => {
    expect(isWithinPeriod({ from: "2026-01-01T00:00:00Z", to: null }, at("2099-01-01"))).toBe(true);
  });

  it("rejects malformed dates instead of guessing", () => {
    expect(() => isWithinPeriod({ from: "not a date", to: null }, at("2026-01-01"))).toThrow(
      DataAccessError,
    );
  });
});

describe("publication states", () => {
  it("only treats published as current; every other state is never current", () => {
    const states: PublicationState[] = [
      "draft",
      "extracted",
      "validated",
      "rejected",
      "superseded",
      "withdrawn",
    ];
    for (const state of states) {
      expect(
        isCurrentAt(record("r", "2026-01-01T00:00:00Z", null, { state }), at("2026-06-01")),
      ).toBe(false);
    }
    expect(isCurrentAt(record("r", "2026-01-01T00:00:00Z", null), at("2026-06-01"))).toBe(true);
  });

  it("marks only published, superseded and withdrawn as public history", () => {
    expect(["published", "superseded", "withdrawn"].every(isPublicState)).toBe(true);
    expect(["draft", "extracted", "validated", "rejected", "unknown"].some(isPublicState)).toBe(
      false,
    );
  });
});

describe("selectEffectiveRecord", () => {
  const history = [
    record("old", "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
    record("new", "2026-03-01T00:00:00Z", "2026-06-01T00:00:00Z"),
    record("scheduled", "2026-06-01T00:00:00Z", null),
  ];

  it("chooses the record whose period contains the as-of time", () => {
    expect(selectEffectiveRecord(history, at("2026-02-15"))?.id).toBe("old");
    expect(selectEffectiveRecord(history, at("2026-03-01"))?.id).toBe("new");
    expect(selectEffectiveRecord(history, at("2026-05-31T23:59:59Z"))?.id).toBe("new");
  });

  it("does not treat a future-dated record as current before it starts", () => {
    expect(selectEffectiveRecord(history, at("2026-04-01"))?.id).toBe("new");
    expect(selectEffectiveRecord(history, at("2026-06-01"))?.id).toBe("scheduled");
  });

  it("returns null before any record is in effect or after the last one ends", () => {
    expect(selectEffectiveRecord(history, at("2025-06-01"))).toBeNull();
    const ended = [record("ended", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z")];
    expect(selectEffectiveRecord(ended, at("2026-02-01"))).toBeNull();
  });

  it("never returns a superseded record, even inside its period", () => {
    const records = [
      record("wrong", "2026-01-01T00:00:00Z", null, { state: "superseded" }),
      record("corrected", "2026-01-01T00:00:00Z", null),
    ];
    expect(selectEffectiveRecord(records, at("2026-02-01"))?.id).toBe("corrected");
  });

  it("ignores drafts and withdrawn records", () => {
    const records = [
      record("published", "2026-01-01T00:00:00Z", null),
      record("draft", "2026-01-01T00:00:00Z", null, { state: "draft" }),
      record("withdrawn", "2026-01-01T00:00:00Z", null, { state: "withdrawn" }),
    ];
    expect(selectEffectiveRecord(records, at("2026-02-01"))?.id).toBe("published");
  });

  it("throws on overlapping current records instead of picking one", () => {
    const records = [
      record("a", "2026-01-01T00:00:00Z", null),
      record("b", "2026-02-01T00:00:00Z", null),
    ];
    expect(() => selectEffectiveRecord(records, at("2026-03-01"))).toThrow(/overlap/);
  });
});

describe("selectEffectiveRecordsByKey", () => {
  it("selects one current record per key and omits keys with none", () => {
    const records = [
      record("input-old", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", { key: "input" }),
      record("input-new", "2026-02-01T00:00:00Z", null, { key: "input" }),
      record("output", "2026-01-01T00:00:00Z", null, { key: "output" }),
      record("cached-draft", "2026-01-01T00:00:00Z", null, { key: "cached", state: "draft" }),
    ];
    const result = selectEffectiveRecordsByKey(records, (r) => r.key, at("2026-03-01"));
    expect(result.map((r) => r.id)).toEqual(["input-new", "output"]);
  });
});
