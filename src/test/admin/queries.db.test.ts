/**
 * Database-backed tests for admin reads: review queue, record state,
 * provenance summary, audit history and permission-aware action availability,
 * through the real read functions as synthetic admins.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as ops from "@/lib/admin/mutations/operations";
import type { AdminResult } from "@/lib/admin/mutations/result";
import * as reads from "@/lib/admin/queries/reads";
import { pgliteAdminContext } from "@/test/admin/pglite-rpc";
import { createSyntheticAdmin, createSyntheticSourceDocument } from "@/test/admin/synthetic-admins";
import { createTestDatabase } from "@/test/db/harness";

let db: PGlite;
const ids: Record<string, string> = {};
let t1Document: string;
let counter = 0;
const ctx = (who: string) => pgliteAdminContext(db, ids[who]!);

function data<T>(result: AdminResult<T>): T {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return (result as { data: T }).data;
}

function idOf(result: AdminResult): string {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return (result as { id: string }).id;
}

async function draftProvider(withSource: boolean, submit: boolean): Promise<string> {
  const id = idOf(
    await ops.createDraft(ctx("editor"), {
      table: "providers",
      values: {
        slug: `synthetic-query-provider-${++counter}`,
        name: `Synthetic Query Provider ${counter}`,
      },
    }),
  );
  if (withSource) {
    idOf(
      await ops.attachSource(ctx("editor"), {
        table: "providers",
        id,
        sourceDocumentId: t1Document,
        role: "primary",
      }),
    );
  }
  if (submit) idOf(await ops.submitForReview(ctx("editor"), { table: "providers", id }));
  return id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  ids.editor = await createSyntheticAdmin(db, { name: "Synthetic Editor", roles: ["editor"] });
  ids.reviewer = await createSyntheticAdmin(db, {
    name: "Synthetic Reviewer",
    roles: ["reviewer"],
  });
  ids.publisher = await createSyntheticAdmin(db, {
    name: "Synthetic Publisher",
    roles: ["publisher"],
  });
  ids.both = await createSyntheticAdmin(db, {
    name: "Synthetic Reviewer Publisher",
    roles: ["reviewer", "publisher"],
  });
  ids.viewer = await createSyntheticAdmin(db, { name: "Synthetic Viewer", roles: ["viewer"] });
  t1Document = await createSyntheticSourceDocument(db, "T1");
});

afterAll(async () => {
  await db.close();
});

describe("review queue", () => {
  it("lists submitted records with submitter, provenance and the reviewer's actions", async () => {
    const sourced = await draftProvider(true, true);
    const unsourced = await draftProvider(false, true);
    const notSubmitted = await draftProvider(true, false);

    const queue = data(await reads.listReviewQueue(ctx("reviewer")));
    const byId = new Map(queue.map((item) => [item.recordId, item]));
    expect(byId.has(notSubmitted)).toBe(false);

    const ready = byId.get(sourced)!;
    expect(ready).toMatchObject({
      table: "providers",
      state: "draft",
      submittedBy: "Synthetic Editor",
      provenance: { supportingCount: 1, bestTier: "T1", gateSatisfied: true },
      approval: { highImpact: false, required: 1, received: 0 },
    });
    expect(ready.label).toMatch(/^Synthetic Query Provider/);
    expect(ready.actions).toEqual(
      expect.arrayContaining([
        { action: "validate", enabled: true },
        { action: "reject", enabled: true },
      ]),
    );
    expect(ready.actions.map((a) => a.action)).not.toContain("publish");

    expect(byId.get(unsourced)!.provenance).toEqual({
      supportingCount: 0,
      bestTier: null,
      gateSatisfied: false,
    });
    expect(byId.get(unsourced)!.actions).toContainEqual({
      action: "validate",
      enabled: false,
      disabledReason: "Attach an approved T1 to T3 source first.",
    });
  });

  it("shows no workflow actions to a viewer", async () => {
    await draftProvider(true, true);
    const queue = data(await reads.listReviewQueue(ctx("viewer")));
    expect(queue.length).toBeGreaterThan(0);
    for (const item of queue) expect(item.actions).toEqual([]);
  });

  it("is refused without an identity", async () => {
    expect(await reads.listReviewQueue(pgliteAdminContext(db, null))).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
  });
});

describe("record state and action availability", () => {
  it("returns fields, provenance, history and the editor's actions for a draft", async () => {
    const id = await draftProvider(true, false);
    const detail = data(await reads.getRecord(ctx("editor"), { table: "providers", id }));
    expect(detail).toMatchObject({ table: "providers", id, state: "draft", editable: true });
    expect(detail.values.slug).toMatch(/^synthetic-query-provider-/);
    expect(detail.fields.find((field) => field.label === "Name")?.value).toMatch(
      /^Synthetic Query/,
    );
    expect(detail.provenance).toHaveLength(1);
    expect(detail.provenance[0]).toMatchObject({ role: "primary", tier: "T1", revoked: false });
    expect(detail.actions).toEqual([
      { action: "submit_review", enabled: true },
      { action: "delete_draft", enabled: true },
    ]);
    // The editor has no view_audit, so no history is read.
    expect(detail.history).toEqual([]);
  });

  it("offers recall after submission and freezes editing", async () => {
    const id = await draftProvider(true, true);
    const detail = data(await reads.getRecord(ctx("editor"), { table: "providers", id }));
    expect(detail.editable).toBe(false);
    expect(detail.actions).toEqual([{ action: "recall", enabled: true }]);
  });

  it("shows publish disabled for the validator of a separated record, enabled for another publisher", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.benchmarks (slug, name) values ('synthetic-query-benchmark', 'Synthetic Benchmark') returning id`,
    );
    const id = idOf(
      await ops.createDraft(ctx("editor"), {
        table: "benchmark_versions",
        values: { benchmark_id: rows[0]!.id, version_label: "synthetic-v1" },
      }),
    );
    idOf(
      await ops.attachSource(ctx("editor"), {
        table: "benchmark_versions",
        id,
        sourceDocumentId: t1Document,
        role: "primary",
      }),
    );
    idOf(await ops.submitForReview(ctx("editor"), { table: "benchmark_versions", id }));
    idOf(await ops.validateRecord(ctx("both"), { table: "benchmark_versions", id }));

    const asValidator = data(
      await reads.getRecord(ctx("both"), { table: "benchmark_versions", id }),
    );
    expect(asValidator.approval).toMatchObject({
      highImpact: true,
      required: 2,
      received: 1,
      validatedBy: "Synthetic Reviewer Publisher",
    });
    expect(asValidator.actions).toContainEqual({
      action: "publish",
      enabled: false,
      disabledReason: "A different admin must publish: you validated this record.",
    });

    const asOther = data(
      await reads.getRecord(ctx("publisher"), { table: "benchmark_versions", id }),
    );
    expect(asOther.actions).toContainEqual({ action: "publish", enabled: true });
  });

  it("reports not_found and rejects unknown tables without leaking detail", async () => {
    expect(
      await reads.getRecord(ctx("editor"), {
        table: "providers",
        id: "00000000-0000-4000-8000-0000000fffff",
      }),
    ).toEqual({ ok: false, code: "not_found", message: "The record was not found." });
    expect(await reads.getRecord(ctx("editor"), { table: "audit_log", id: "x" })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });

  it("lists records and reference options", async () => {
    const id = await draftProvider(false, false);
    const list = data(await reads.listRecords(ctx("viewer"), { table: "providers", limit: 500 }));
    expect(list.find((record) => record.id === id)).toMatchObject({ state: "draft" });
    const options = data(await reads.listReferenceOptions(ctx("viewer"), { table: "providers" }));
    expect(options.find((option) => option.value === id)?.label).toMatch(
      /^Synthetic Query Provider/,
    );
    const sources = data(await reads.listRecords(ctx("viewer"), { table: "sources" }));
    expect(sources[0]).toMatchObject({ table: "sources", state: null });
  });
});

describe("audit history", () => {
  it("is refused without view_audit", async () => {
    expect(await reads.listAuditEntries(ctx("editor"))).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });

  it("attributes every step of a record to the acting admin, with paging", async () => {
    const id = await draftProvider(true, true);
    idOf(await ops.validateRecord(ctx("reviewer"), { table: "providers", id }));
    idOf(await ops.publishRecord(ctx("publisher"), { table: "providers", id }));

    const detail = data(await reads.getRecord(ctx("publisher"), { table: "providers", id }));
    const stateEvents = detail.history.filter((entry) => !entry.reason?.startsWith("Workflow:"));
    expect(stateEvents.map((entry) => [entry.toState, entry.actorLabel])).toEqual(
      expect.arrayContaining([
        ["draft", "Synthetic Editor"],
        ["validated", "Synthetic Reviewer"],
        ["published", "Synthetic Publisher"],
      ]),
    );

    const page = data(
      await reads.listAuditEntries(ctx("reviewer"), { table: "providers", recordId: id, limit: 2 }),
    );
    expect(page.entries).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    const rest = data(
      await reads.listAuditEntries(ctx("reviewer"), {
        table: "providers",
        recordId: id,
        cursor: page.nextCursor,
        limit: 50,
      }),
    );
    const all = [...page.entries, ...rest.entries];
    const transitions = all
      .filter((entry) => entry.toState && entry.fromState !== entry.toState)
      .map((entry) => [
        entry.action,
        entry.fromState,
        entry.toState,
        entry.actorLabel,
        entry.actorKind,
      ]);
    expect(transitions).toEqual(
      expect.arrayContaining([
        ["INSERT", null, "draft", "Synthetic Editor", "user"],
        ["UPDATE", "draft", "validated", "Synthetic Reviewer", "user"],
        ["UPDATE", "validated", "published", "Synthetic Publisher", "user"],
      ]),
    );
  });

  it("rejects malformed filters", async () => {
    expect(await reads.listAuditEntries(ctx("reviewer"), { from: "yesterday" })).toMatchObject({
      ok: false,
      code: "invalid_input",
      fieldErrors: { from: expect.any(String) },
    });
  });
});
