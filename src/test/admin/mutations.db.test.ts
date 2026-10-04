/**
 * Database-backed authorization tests for the admin mutation path.
 *
 * Every call goes through the real TypeScript pipeline into the real
 * `nfai_admin_*` functions (migrations 0001-0007 in PGlite), as `authenticated`
 * with JWT claims for synthetic identities, exactly as Supabase would run them.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminResult } from "@/lib/admin/mutations/result";
import * as ops from "@/lib/admin/mutations/operations";
import { createTestDatabase } from "@/test/db/harness";
import { pgliteAdminContext, pgliteRpcClient } from "@/test/admin/pglite-rpc";
import {
  createSyntheticAdmin,
  createSyntheticSourceDocument,
  syntheticUuid,
} from "@/test/admin/synthetic-admins";

type Ids = Record<
  "editor" | "reviewer" | "publisher" | "reviewerPublisher" | "viewer" | "disabled",
  string
>;

let db: PGlite;
let ids: Ids;
let t1Document: string;
let t4Document: string;

const ctx = (who: keyof Ids) => pgliteAdminContext(db, ids[who]);
let slugCounter = 0;
const provider = () => ({
  table: "providers",
  values: { slug: `synthetic-provider-${++slugCounter}`, name: "Synthetic Test Provider" },
});

function expectOk(result: AdminResult): string {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return (result as { id?: string }).id ?? "";
}

async function stateOf(table: string, id: string): Promise<string | undefined> {
  const { rows } = await db.query<{ publication_state: string }>(
    `select publication_state from public.${table} where id = $1`,
    [id],
  );
  return rows[0]?.publication_state;
}

async function eventsOf(table: string, id: string) {
  const { rows } = await db.query<{
    to_state: string;
    actor_id: string | null;
    actor_kind: string;
  }>(
    `select to_state, actor_id, actor_kind from public.publication_events
      where subject_table = $1 and record_id = $2 order by id`,
    [`public.${table}`, id],
  );
  return rows;
}

/** Draft provider with an approved T1 primary source, submitted for review by the editor. */
async function submittedProvider(): Promise<string> {
  const id = expectOk(await ops.createDraft(ctx("editor"), provider()));
  expectOk(
    await ops.attachSource(ctx("editor"), {
      table: "providers",
      id,
      sourceDocumentId: t1Document,
      role: "primary",
    }),
  );
  expectOk(await ops.submitForReview(ctx("editor"), { table: "providers", id }));
  return id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  ids = {
    editor: await createSyntheticAdmin(db, { name: "Synthetic Editor", roles: ["editor"] }),
    reviewer: await createSyntheticAdmin(db, { name: "Synthetic Reviewer", roles: ["reviewer"] }),
    publisher: await createSyntheticAdmin(db, {
      name: "Synthetic Publisher",
      roles: ["publisher"],
    }),
    reviewerPublisher: await createSyntheticAdmin(db, {
      name: "Synthetic Reviewer Publisher",
      roles: ["reviewer", "publisher"],
    }),
    viewer: await createSyntheticAdmin(db, { name: "Synthetic Viewer", roles: ["viewer"] }),
    disabled: await createSyntheticAdmin(db, {
      name: "Synthetic Disabled Editor",
      roles: ["editor"],
      status: "disabled",
    }),
  };
  t1Document = await createSyntheticSourceDocument(db, "T1");
  t4Document = await createSyntheticSourceDocument(db, "T4");
});

afterAll(async () => {
  await db.close();
});

describe("authentication and identity", () => {
  it("unauthenticated mutation fails, in TypeScript and in SQL", async () => {
    expect(await ops.createDraft(pgliteAdminContext(db, null), provider())).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
    // A request without a user calling the function directly is refused by the database.
    const anonymous = pgliteRpcClient(db, {});
    const { error } = await anonymous.rpc("nfai_admin_create_draft", {
      p_table: "public.providers",
      p_values: provider().values,
    });
    expect(error?.code).toBe("NFA01");
    const anon = pgliteRpcClient(db, {}, "anon");
    expect(
      (await anon.rpc("nfai_admin_create_draft", { p_table: "public.providers", p_values: {} }))
        .error?.code,
    ).toBe("42501");
  });

  it("a signed-in user without an admin identity is refused by the database", async () => {
    const stranger = syntheticUuid("bbbbbbbb");
    const result = await ops.createDraft(
      pgliteAdminContext(db, stranger, {
        status: "allowed",
        actor: { authUserId: stranger, displayName: "Not An Admin" },
      }),
      provider(),
    );
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("disabled admin fails even when the session layer still says allowed", async () => {
    const result = await ops.createDraft(
      pgliteAdminContext(db, ids.disabled, {
        status: "allowed",
        actor: { authUserId: ids.disabled, displayName: "Stale Session" },
      }),
      provider(),
    );
    expect(result).toMatchObject({ ok: false, code: "account_disabled" });
    const { rows } = await db.query("select 1 from public.providers where name = 'Stale Session'");
    expect(rows).toEqual([]);
  });
});

describe("authorization", () => {
  it("unauthorized role fails in TypeScript and when the function is called directly", async () => {
    expect(await ops.createDraft(ctx("viewer"), provider())).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(await ops.createDraft(ctx("reviewer"), provider())).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    const direct = pgliteRpcClient(db, { sub: ids.viewer });
    const { error } = await direct.rpc("nfai_admin_create_draft", {
      p_table: "public.providers",
      p_values: provider().values,
    });
    expect(error?.code).toBe("NFA03");
  });

  it("an editor cannot validate or publish", async () => {
    const id = await submittedProvider();
    expect(await ops.validateRecord(ctx("editor"), { table: "providers", id })).toMatchObject({
      code: "forbidden",
    });
    const direct = pgliteRpcClient(db, { sub: ids.editor });
    expect(
      (await direct.rpc("nfai_admin_publish", { p_table: "public.providers", p_id: id })).error
        ?.code,
    ).toBe("NFA03");
    expect(await stateOf("providers", id)).toBe("draft");
  });
});

describe("forged actors and direct state manipulation", () => {
  it("forged actor fails: the actor always comes from auth.uid(), never from settings", async () => {
    let createdId: string | undefined;
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "authenticated", sub: ids.editor }),
      ]);
      await tx.exec("set local role authenticated");
      // Try to impersonate the publisher through the actor settings Phase 2 reads.
      await tx.query("select set_config('nfai.actor_id', $1, true)", [ids.publisher]);
      await tx.query("select set_config('nfai.actor_label', 'Forged Publisher', true)");
      const { rows } = await tx.query<{ id: string }>(
        "select public.nfai_admin_create_draft('public.providers', $1::jsonb) as id",
        [JSON.stringify(provider().values)],
      );
      createdId = rows[0]!.id;
    });
    const events = await eventsOf("providers", createdId!);
    expect(events).toEqual([{ to_state: "draft", actor_id: ids.editor, actor_kind: "user" }]);
    const { rows } = await db.query<{ actor_id: string; actor_label: string }>(
      `select actor_id, actor_label from public.audit_log
        where table_name = 'public.providers' and record_key = $1 and action = 'INSERT'`,
      [createdId],
    );
    expect(rows[0]?.actor_id).toBe(ids.editor);
    expect(rows[0]?.actor_label).not.toBe("Forged Publisher");
  });

  it("forged actor, role and state fields in input are rejected before the database", async () => {
    for (const forged of [
      { created_by: ids.publisher },
      { publication_state: "published" },
      { role: "publisher" },
    ]) {
      const result = await ops.createDraft(ctx("editor"), {
        table: "providers",
        values: { ...provider().values, ...forged },
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    }
    // The database allow-list refuses the same fields when called directly.
    const direct = pgliteRpcClient(db, { sub: ids.editor });
    const { error } = await direct.rpc("nfai_admin_create_draft", {
      p_table: "public.providers",
      p_values: { ...provider().values, publication_state: "published" },
    });
    expect(error).not.toBeNull();
  });

  it("direct state manipulation fails for authenticated and service_role", async () => {
    const id = await submittedProvider();
    const attempts: [string, string, string][] = [
      [
        "authenticated",
        ids.reviewerPublisher,
        `update public.providers set publication_state = 'validated' where id = $1`,
      ],
      [
        "authenticated",
        ids.reviewerPublisher,
        `select public.nfai_transition('public.providers', $1, 'validated')`,
      ],
      [
        "service_role",
        "",
        `update public.providers set publication_state = 'validated' where id = $1`,
      ],
      ["service_role", "", `select public.nfai_transition('public.providers', $1, 'validated')`],
    ];
    for (const [role, sub, sql] of attempts) {
      let failed = false;
      try {
        await db.transaction(async (tx) => {
          await tx.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify(sub ? { role, sub } : { role }),
          ]);
          await tx.exec(`set local role ${role}`);
          await tx.query(sql, [id]);
          await tx.exec("set constraints all immediate");
        });
      } catch {
        failed = true;
      }
      expect(failed, `${role}: ${sql}`).toBe(true);
    }
    expect(await stateOf("providers", id)).toBe("draft");
  });
});

describe("draft creation and the review workflow", () => {
  it("valid draft creation passes and is attributed to the editor", async () => {
    const result = await ops.createDraft(ctx("editor"), provider());
    const id = expectOk(result);
    expect(await stateOf("providers", id)).toBe("draft");
    expect(await eventsOf("providers", id)).toEqual([
      { to_state: "draft", actor_id: ids.editor, actor_kind: "user" },
    ]);
  });

  it("update draft edits fields until the draft is submitted", async () => {
    const id = expectOk(await ops.createDraft(ctx("editor"), provider()));
    expectOk(
      await ops.updateDraft(ctx("editor"), {
        table: "providers",
        id,
        values: { name: "Renamed Synthetic" },
      }),
    );
    expectOk(await ops.submitForReview(ctx("editor"), { table: "providers", id }));
    expect(
      await ops.updateDraft(ctx("editor"), {
        table: "providers",
        id,
        values: { name: "Too Late" },
      }),
    ).toMatchObject({ ok: false, code: "invalid_state" });
    expectOk(
      await ops.retractSubmission(ctx("editor"), { table: "providers", id, reason: "More edits." }),
    );
    expectOk(
      await ops.updateDraft(ctx("editor"), {
        table: "providers",
        id,
        values: { name: "Edited Again" },
      }),
    );
  });

  it("publish requires provenance: no source, or T4-only evidence, cannot be validated", async () => {
    const bare = expectOk(await ops.createDraft(ctx("editor"), provider()));
    expectOk(await ops.submitForReview(ctx("editor"), { table: "providers", id: bare }));
    expect(
      await ops.validateRecord(ctx("reviewer"), { table: "providers", id: bare }),
    ).toMatchObject({
      ok: false,
      code: "provenance_required",
    });

    const t4Only = expectOk(await ops.createDraft(ctx("editor"), provider()));
    expectOk(
      await ops.attachSource(ctx("editor"), {
        table: "providers",
        id: t4Only,
        sourceDocumentId: t4Document,
        role: "corroborating",
      }),
    );
    expectOk(await ops.submitForReview(ctx("editor"), { table: "providers", id: t4Only }));
    expect(
      await ops.validateRecord(ctx("reviewer"), { table: "providers", id: t4Only }),
    ).toMatchObject({
      ok: false,
      code: "provenance_required",
    });
    expect(await stateOf("providers", bare)).toBe("draft");
    expect(await stateOf("providers", t4Only)).toBe("draft");
  });

  it("validate needs an open submission", async () => {
    const id = expectOk(await ops.createDraft(ctx("editor"), provider()));
    expect(await ops.validateRecord(ctx("reviewer"), { table: "providers", id })).toMatchObject({
      ok: false,
      code: "invalid_state",
    });
  });

  it("runs the full workflow with correct actor attribution at every step", async () => {
    const id = await submittedProvider();
    expectOk(await ops.validateRecord(ctx("reviewer"), { table: "providers", id }));
    expectOk(await ops.publishRecord(ctx("publisher"), { table: "providers", id }));
    expect(await stateOf("providers", id)).toBe("published");
    expect(await eventsOf("providers", id)).toEqual([
      { to_state: "draft", actor_id: ids.editor, actor_kind: "user" },
      { to_state: "validated", actor_id: ids.reviewer, actor_kind: "user" },
      { to_state: "published", actor_id: ids.publisher, actor_kind: "user" },
    ]);
    const { rows: links } = await db.query<{ created_by: string }>(
      `select created_by from public.provenance_links where subject_table = 'public.providers' and subject_id = $1`,
      [id],
    );
    expect(links).toEqual([{ created_by: ids.editor }]);
    const { rows: actions } = await db.query<{ action: string; actor_id: string }>(
      `select action, actor_id from public.workflow_actions
        where subject_table = 'public.providers' and record_id = $1 order by id`,
      [id],
    );
    expect(actions).toEqual([
      { action: "submit", actor_id: ids.editor },
      { action: "validate", actor_id: ids.reviewer },
      { action: "publish", actor_id: ids.publisher },
    ]);

    // Withdrawal of a published record needs a reason and is attributed too.
    expect(await ops.withdrawRecord(ctx("publisher"), { table: "providers", id })).toMatchObject({
      code: "invalid_input",
    });
    expectOk(
      await ops.withdrawRecord(ctx("publisher"), {
        table: "providers",
        id,
        reason: "Synthetic withdrawal.",
        reasonCode: "other",
      }),
    );
    expect((await eventsOf("providers", id)).at(-1)).toEqual({
      to_state: "withdrawn",
      actor_id: ids.publisher,
      actor_kind: "user",
    });
  });

  it("reject needs a reason and records the reviewer", async () => {
    const id = await submittedProvider();
    expectOk(
      await ops.rejectRecord(ctx("reviewer"), {
        table: "providers",
        id,
        reason: "Synthetic rejection.",
        reasonCode: "insufficient_evidence",
      }),
    );
    expect(await stateOf("providers", id)).toBe("rejected");
    expect((await eventsOf("providers", id)).at(-1)?.actor_id).toBe(ids.reviewer);
  });
});

describe("separation of duties (separated approval class)", () => {
  let benchmarkId: string;

  beforeAll(async () => {
    // A synthetic parent benchmark, created by the owner as setup.
    const { rows } = await db.query<{ id: string }>(
      `insert into public.benchmarks (slug, name) values ('synthetic-sod-benchmark', 'Synthetic Benchmark')
       returning id`,
    );
    benchmarkId = rows[0]!.id;
  });

  async function validatedVersion(validator: keyof Ids): Promise<string> {
    const id = expectOk(
      await ops.createDraft(ctx("editor"), {
        table: "benchmark_versions",
        values: { benchmark_id: benchmarkId, version_label: `synthetic-v${++slugCounter}` },
      }),
    );
    expectOk(
      await ops.attachSource(ctx("editor"), {
        table: "benchmark_versions",
        id,
        sourceDocumentId: t1Document,
        role: "primary",
      }),
    );
    expectOk(await ops.submitForReview(ctx("editor"), { table: "benchmark_versions", id }));
    expectOk(await ops.validateRecord(ctx(validator), { table: "benchmark_versions", id }));
    return id;
  }

  it("the validator cannot also publish a separated record", async () => {
    const id = await validatedVersion("reviewerPublisher");
    expect(
      await ops.publishRecord(ctx("reviewerPublisher"), { table: "benchmark_versions", id }),
    ).toMatchObject({
      ok: false,
      code: "separation_of_duties",
      message: "A different admin must review a record you proposed or edited.",
    });
    expect(await stateOf("benchmark_versions", id)).toBe("validated");
  });

  it("a different publisher can publish it", async () => {
    const id = await validatedVersion("reviewerPublisher");
    expectOk(await ops.publishRecord(ctx("publisher"), { table: "benchmark_versions", id }));
    expect(await stateOf("benchmark_versions", id)).toBe("published");
  });

  it("standard tables allow one qualified person to validate and publish", async () => {
    const id = await submittedProvider();
    expectOk(await ops.validateRecord(ctx("reviewerPublisher"), { table: "providers", id }));
    expectOk(await ops.publishRecord(ctx("reviewerPublisher"), { table: "providers", id }));
  });
});

describe("error responses", () => {
  it("never reveal database text, SQL, identifiers or keys", async () => {
    const existing = provider();
    const id = expectOk(await ops.createDraft(ctx("editor"), existing));
    const results: AdminResult[] = [
      await ops.validateRecord(ctx("reviewer"), { table: "providers", id }),
      await ops.publishRecord(ctx("publisher"), { table: "providers", id }),
      await ops.createDraft(ctx("editor"), {
        table: "providers",
        values: { slug: existing.values.slug, name: "Dup" },
      }),
      await ops.createDraft(ctx("viewer"), provider()),
      await ops.updateDraft(ctx("editor"), {
        table: "providers",
        id: syntheticUuid("cccccccc"),
        values: { name: "Missing" },
      }),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      const text = JSON.stringify(result);
      for (const leak of [
        "public.",
        "nfai_",
        "select ",
        "violates",
        "NFA0",
        "auth.",
        id,
        ids.editor,
        "constraint",
      ]) {
        expect(text, text).not.toContain(leak);
      }
    }
    expect(results.map((result) => (result as { code: string }).code)).toEqual([
      "invalid_state",
      "invalid_state",
      "conflict",
      "forbidden",
      "not_found",
    ]);
  });
});
