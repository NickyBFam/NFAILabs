/**
 * Roles, permissions and the review/approval workflow (migration 0007), tested in
 * PGlite by calling the `nfai_admin_*` functions as `authenticated` with synthetic
 * admin JWTs, exactly as PostgREST would. All identities and records are synthetic.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_ROLES, ROLE_PERMISSIONS } from "@/lib/admin/permissions";
import { FACT_APPROVAL_CLASSES, WORKFLOW_ACTIONS, classifyAdminError } from "@/lib/admin/workflow";
import type { AdminRpcClient } from "@/lib/admin/mutations/context";
import { pgliteRpcClient } from "@/test/admin/pglite-rpc";
import {
  createSyntheticAdmin,
  createSyntheticSourceDocument,
  type SyntheticRole,
} from "@/test/admin/synthetic-admins";
import { asRole, createTestDatabase } from "@/test/db/harness";

let db: PGlite;
let t1Document: string;
let t4Document: string;
let slugCounter = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  t1Document = await createSyntheticSourceDocument(db, "T1");
  t4Document = await createSyntheticSourceDocument(db, "T4");
});

afterAll(async () => {
  await db?.close();
});

function slug(prefix: string): string {
  slugCounter += 1;
  return `${prefix}-${slugCounter}`;
}

async function admin(
  name: string,
  roles: readonly SyntheticRole[],
): Promise<{ id: string; rpc: AdminRpcClient }> {
  const id = await createSyntheticAdmin(db, { name, roles });
  return { id, rpc: pgliteRpcClient(db, { sub: id }) };
}

async function ok<T = unknown>(
  client: AdminRpcClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.code} ${error.message}`);
  return data as T;
}

async function failure(
  client: AdminRpcClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const { error } = await client.rpc(fn, args);
  expect(error, `${fn} should have failed`).not.toBeNull();
  return error!.code ?? "";
}

async function stateOf(table: string, id: string): Promise<string> {
  const { rows } = await db.query<{ publication_state: string }>(
    `select publication_state from ${table} where id = $1`,
    [id],
  );
  return rows[0]!.publication_state;
}

/** A provider draft with a primary T1 source, created by `editor`. */
async function providerDraft(editor: AdminRpcClient, document = t1Document): Promise<string> {
  const id = await ok<string>(editor, "nfai_admin_create_draft", {
    p_table: "public.providers",
    p_values: { slug: slug("example-ai-corp"), name: "Example AI Corp (synthetic)" },
  });
  await ok(editor, "nfai_admin_attach_provenance", {
    p_values: {
      subject_table: "public.providers",
      subject_id: id,
      source_document_id: document,
      role: document === t1Document ? "primary" : "corroborating",
    },
  });
  return id;
}

/** A benchmark version draft (separated table) with a primary T1 source. */
async function benchmarkVersionDraft(editor: AdminRpcClient): Promise<string> {
  const benchmark = await ok<string>(editor, "nfai_admin_create_draft", {
    p_table: "public.benchmarks",
    p_values: { slug: slug("synthetic-benchmark"), name: "Synthetic Benchmark" },
  });
  const id = await ok<string>(editor, "nfai_admin_create_draft", {
    p_table: "public.benchmark_versions",
    p_values: { benchmark_id: benchmark, version_label: "v1-synthetic" },
  });
  await ok(editor, "nfai_admin_attach_provenance", {
    p_values: {
      subject_table: "public.benchmark_versions",
      subject_id: id,
      source_document_id: t1Document,
      role: "primary",
    },
  });
  return id;
}

const p = (table: string, id: string, extra: Record<string, unknown> = {}) => ({
  p_table: table,
  p_id: id,
  ...extra,
});

describe("role and policy vocabulary", () => {
  it("the TypeScript role matrix matches admin_role_permissions", async () => {
    const { rows } = await db.query<{ role_code: string; permission_code: string }>(
      "select role_code, permission_code from public.admin_role_permissions",
    );
    const fromDb: Record<string, string[]> = {};
    for (const row of rows) (fromDb[row.role_code] ??= []).push(row.permission_code);
    for (const role of ADMIN_ROLES) {
      expect([...(fromDb[role] ?? [])].sort(), role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
    expect(Object.keys(fromDb).sort()).toEqual([...ADMIN_ROLES].sort());
  });

  it("every registered fact table has the approval class the TypeScript mirror states", async () => {
    const { rows } = await db.query<{ table_name: string; approval_class: string | null }>(
      `select f.table_name, p.approval_class
         from public.fact_tables f left join public.fact_approval_policies p using (table_name)`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.table_name, r.approval_class]))).toEqual(
      FACT_APPROVAL_CLASSES,
    );
  });

  it("workflow action codes match the workflow_actions check constraint", async () => {
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'workflow_actions_action_check'`,
    );
    for (const action of WORKFLOW_ACTIONS) expect(rows[0]!.def).toContain(`'${action}'`);
  });

  it("the security self-audit is clean after 0007", async () => {
    const { rows } = await db.query("select * from public.nfai_security_audit()");
    expect(rows).toEqual([]);
  });

  it("administrator manages access but holds no fact permissions", () => {
    expect(ROLE_PERMISSIONS.administrator).not.toContain("publish_fact");
    expect(ROLE_PERMISSIONS.administrator).not.toContain("edit_draft");
    expect(ROLE_PERMISSIONS.editor).not.toContain("publish_fact");
  });

  it("maps admin SQLSTATEs to error kinds", () => {
    expect(classifyAdminError("NFA04")).toBe("separation_of_duties");
    expect(classifyAdminError("42P01")).toBe("unknown");
    expect(classifyAdminError(undefined)).toBe("unknown");
  });
});

describe("standard approval workflow", () => {
  it("editor drafts and submits, reviewer validates, publisher publishes; each step is attributed", async () => {
    const editor = await admin("Test Editor", ["editor"]);
    const reviewer = await admin("Test Reviewer", ["reviewer"]);
    const publisher = await admin("Test Publisher", ["publisher"]);
    const id = await providerDraft(editor.rpc);

    expect(await failure(editor.rpc, "nfai_admin_publish", p("public.providers", id))).toBe(
      "NFA03",
    );
    expect(await failure(editor.rpc, "nfai_admin_validate", p("public.providers", id))).toBe(
      "NFA03",
    );
    // Not submitted yet: a reviewer cannot validate it.
    expect(await failure(reviewer.rpc, "nfai_admin_validate", p("public.providers", id))).toBe(
      "NFA05",
    );

    await ok(editor.rpc, "nfai_admin_submit", p("public.providers", id, { p_note: "Ready" }));
    // Frozen while submitted.
    expect(
      await failure(
        editor.rpc,
        "nfai_admin_update_draft",
        p("public.providers", id, { p_values: { name: "Renamed" } }),
      ),
    ).toBe("NFA05");

    const queue = await ok<{ record_id: string; submitted_by: string }[]>(
      reviewer.rpc,
      "nfai_admin_review_queue",
    );
    expect(queue.find((r) => r.record_id === id)?.submitted_by).toBe(editor.id);

    // Publishing before validation is a workflow error, not a permission error.
    expect(await failure(publisher.rpc, "nfai_admin_publish", p("public.providers", id))).toBe(
      "NFA05",
    );
    await ok(reviewer.rpc, "nfai_admin_validate", p("public.providers", id));
    expect(await failure(reviewer.rpc, "nfai_admin_publish", p("public.providers", id))).toBe(
      "NFA03",
    );
    await ok(
      publisher.rpc,
      "nfai_admin_publish",
      p("public.providers", id, { p_note: "Approved" }),
    );
    expect(await stateOf("public.providers", id)).toBe("published");

    const { rows: events } = await db.query<{
      to_state: string;
      actor_id: string;
      actor_kind: string;
    }>(
      `select to_state, actor_id, actor_kind from public.publication_events
        where subject_table = 'public.providers' and record_id = $1 order by id`,
      [id],
    );
    expect(events.map((e) => [e.to_state, e.actor_id, e.actor_kind])).toEqual([
      ["draft", editor.id, "user"],
      ["validated", reviewer.id, "user"],
      ["published", publisher.id, "user"],
    ]);
    const { rows: actions } = await db.query<{ action: string; actor_id: string }>(
      `select action, actor_id from public.workflow_actions where record_id = $1 order by id`,
      [id],
    );
    expect(actions).toEqual([
      { action: "submit", actor_id: editor.id },
      { action: "validate", actor_id: reviewer.id },
      { action: "publish", actor_id: publisher.id },
    ]);
  });

  it("one person with every permission may validate and publish a standard record", async () => {
    const solo = await admin("Test Solo Curator", ["editor", "reviewer", "publisher"]);
    const id = await providerDraft(solo.rpc);
    await ok(solo.rpc, "nfai_admin_submit", p("public.providers", id));
    await ok(solo.rpc, "nfai_admin_validate", p("public.providers", id));
    await ok(solo.rpc, "nfai_admin_publish", p("public.providers", id));
    expect(await stateOf("public.providers", id)).toBe("published");
  });

  it("validation still requires a T1-T3 source (D-028)", async () => {
    const solo = await admin("Test Solo T4", ["editor", "reviewer"]);
    const id = await providerDraft(solo.rpc, t4Document);
    await ok(solo.rpc, "nfai_admin_submit", p("public.providers", id));
    expect(await failure(solo.rpc, "nfai_admin_validate", p("public.providers", id))).toBe("23514");
    expect(await stateOf("public.providers", id)).toBe("draft");
  });

  it("recall reopens editing; return and reject need reasons", async () => {
    const editor = await admin("Test Editor Recall", ["editor"]);
    const reviewer = await admin("Test Reviewer Recall", ["reviewer"]);
    const id = await providerDraft(editor.rpc);
    await ok(editor.rpc, "nfai_admin_submit", p("public.providers", id));
    await ok(
      editor.rpc,
      "nfai_admin_recall_submission",
      p("public.providers", id, { p_reason: "Fix name" }),
    );
    await ok(
      editor.rpc,
      "nfai_admin_update_draft",
      p("public.providers", id, { p_values: { name: "Fixed (synthetic)" } }),
    );
    await ok(editor.rpc, "nfai_admin_submit", p("public.providers", id));
    await ok(reviewer.rpc, "nfai_admin_validate", p("public.providers", id));
    expect(
      await failure(
        reviewer.rpc,
        "nfai_admin_return_to_draft",
        p("public.providers", id, { p_reason: " " }),
      ),
    ).toBe("22023");
    await ok(
      reviewer.rpc,
      "nfai_admin_return_to_draft",
      p("public.providers", id, { p_reason: "Needs a better source" }),
    );
    expect(await stateOf("public.providers", id)).toBe("draft");
    await ok(editor.rpc, "nfai_admin_submit", p("public.providers", id));
    await ok(
      reviewer.rpc,
      "nfai_admin_reject",
      p("public.providers", id, { p_reason: "Out of scope", p_reason_code: "out_of_scope" }),
    );
    expect(await stateOf("public.providers", id)).toBe("rejected");

    const { rows } = await db.query<{ action: string; cycle: number }>(
      "select action, cycle from public.workflow_actions where record_id = $1 order by id",
      [id],
    );
    expect(rows.map((r) => `${r.action}:${r.cycle}`)).toEqual([
      "submit:1",
      "recall:1",
      "submit:2",
      "validate:2",
      "return_to_draft:2",
      "submit:3",
      "reject:3",
    ]);
  });

  it("protected columns cannot be set through draft values", async () => {
    const editor = await admin("Test Editor Columns", ["editor"]);
    for (const values of [
      { slug: slug("x"), name: "X", publication_state: "published" },
      { slug: slug("x"), name: "X", id: "00000000-0000-4000-8000-000000000001" },
      { slug: slug("x"), name: "X", not_a_column: 1 },
    ]) {
      expect(
        await failure(editor.rpc, "nfai_admin_create_draft", {
          p_table: "public.providers",
          p_values: values,
        }),
      ).toBe("22023");
    }
    expect(
      await failure(editor.rpc, "nfai_admin_create_draft", {
        p_table: "public.audit_log",
        p_values: { action: "INSERT" },
      }),
    ).toBe("22023");
  });
  it("a fresh draft offers its editor the edit actions and is not submitted", async () => {
    const editor = await admin("Test Editor Fresh Draft", ["editor"]);
    const id = await providerDraft(editor.rpc);
    const status = await ok<{ submitted: boolean | null; available_actions: string[] }[]>(
      editor.rpc,
      "nfai_admin_record_status",
      p("public.providers", id),
    );
    expect(status[0]!.submitted).toBe(false);
    expect([...status[0]!.available_actions].sort()).toEqual(
      ["attach_provenance", "delete_draft", "submit", "update_draft"].sort(),
    );
  });
});

describe("separation of duties on separated tables", () => {
  it("the validator cannot also publish", async () => {
    const solo = await admin("Test Solo Separated", ["editor", "reviewer", "publisher"]);
    const id = await benchmarkVersionDraft(solo.rpc);
    await ok(solo.rpc, "nfai_admin_submit", p("public.benchmark_versions", id));
    await ok(solo.rpc, "nfai_admin_validate", p("public.benchmark_versions", id));
    expect(await failure(solo.rpc, "nfai_admin_publish", p("public.benchmark_versions", id))).toBe(
      "NFA04",
    );
    const status = await ok<
      { publish_blocked_reason: string; required_approvals: number; available_actions: string[] }[]
    >(solo.rpc, "nfai_admin_record_status", p("public.benchmark_versions", id));
    expect(status[0]).toMatchObject({
      publish_blocked_reason: "validated_by_caller",
      required_approvals: 2,
    });
    expect(status[0]!.available_actions).not.toContain("publish");
    expect(await stateOf("public.benchmark_versions", id)).toBe("validated");
  });

  it("a content author cannot publish, even when someone else validated", async () => {
    const authorPublisher = await admin("Test Author Publisher", ["editor", "publisher"]);
    const reviewer = await admin("Test Reviewer Separated", ["reviewer"]);
    const id = await benchmarkVersionDraft(authorPublisher.rpc);
    await ok(authorPublisher.rpc, "nfai_admin_submit", p("public.benchmark_versions", id));
    await ok(reviewer.rpc, "nfai_admin_validate", p("public.benchmark_versions", id));
    expect(
      await failure(authorPublisher.rpc, "nfai_admin_publish", p("public.benchmark_versions", id)),
    ).toBe("NFA04");
  });

  it("distinct author, validator and publisher pass", async () => {
    const editor = await admin("Test Editor Separated", ["editor"]);
    const reviewer = await admin("Test Reviewer Separated 2", ["reviewer"]);
    const publisher = await admin("Test Publisher Separated", ["publisher"]);
    const id = await benchmarkVersionDraft(editor.rpc);
    await ok(editor.rpc, "nfai_admin_submit", p("public.benchmark_versions", id));
    await ok(reviewer.rpc, "nfai_admin_validate", p("public.benchmark_versions", id));
    await ok(publisher.rpc, "nfai_admin_publish", p("public.benchmark_versions", id));
    expect(await stateOf("public.benchmark_versions", id)).toBe("published");
  });
});

describe("identity status and role history", () => {
  it("a disabled identity is refused at once, whatever its roles", async () => {
    const editor = await admin("Test Editor Disabled", ["editor"]);
    const reviewer = await admin("Test Reviewer Disabled", ["reviewer"]);
    const id = await providerDraft(editor.rpc);
    await ok(editor.rpc, "nfai_admin_submit", p("public.providers", id));
    await db.query(
      "update public.admin_identities set status = 'disabled', disabled_reason = 'Synthetic test' where id = $1",
      [reviewer.id],
    );
    expect(await failure(reviewer.rpc, "nfai_admin_validate", p("public.providers", id))).toBe(
      "NFA02",
    );
    expect(await failure(reviewer.rpc, "nfai_admin_whoami")).toBe("NFA02");
  });

  it("a revoked role stops working; history is kept; nobody changes their own roles", async () => {
    const administrator = await admin("Test Administrator", ["administrator"]);
    const other = await admin("Test Second Administrator", ["administrator"]);
    const target = await admin("Test Future Reviewer", ["viewer"]);
    const editor = await admin("Test Editor Revoke", ["editor"]);

    expect(
      await failure(administrator.rpc, "nfai_admin_grant_role", {
        p_admin_id: administrator.id,
        p_role: "publisher",
        p_reason: "Self grant",
      }),
    ).toBe("NFA03");
    expect(
      await failure(editor.rpc, "nfai_admin_grant_role", {
        p_admin_id: target.id,
        p_role: "reviewer",
        p_reason: "No",
      }),
    ).toBe("NFA03");

    const assignment = await ok<string>(administrator.rpc, "nfai_admin_grant_role", {
      p_admin_id: target.id,
      p_role: "reviewer",
      p_reason: "Synthetic test grant",
    });
    const id = await providerDraft(editor.rpc);
    await ok(editor.rpc, "nfai_admin_submit", p("public.providers", id));

    await ok(other.rpc, "nfai_admin_revoke_role", {
      p_assignment_id: assignment,
      p_reason: "Synthetic test revoke",
    });
    expect(await failure(target.rpc, "nfai_admin_validate", p("public.providers", id))).toBe(
      "NFA03",
    );
    expect(
      await failure(other.rpc, "nfai_admin_revoke_role", {
        p_assignment_id: assignment,
        p_reason: "Again",
      }),
    ).toBe("NFA05");

    const history = await ok<
      { role_code: string; granted_by: string; revoked_by: string | null }[]
    >(administrator.rpc, "nfai_admin_role_history", { p_admin_id: target.id });
    expect(history.find((h) => h.role_code === "reviewer")).toMatchObject({
      granted_by: administrator.id,
      revoked_by: other.id,
    });
    const whoami = await ok<{ roles: string[]; permissions: string[] }[]>(
      target.rpc,
      "nfai_admin_whoami",
    );
    expect(whoami[0]).toMatchObject({ roles: ["viewer"], permissions: ["view_admin"] });
  });

  it("a signed-in user without an identity is not an admin", async () => {
    const stranger = pgliteRpcClient(db, { sub: "bbbbbbbb-0000-4000-8000-000000000999" });
    expect(await failure(stranger, "nfai_admin_whoami")).toBe("NFA01");
    expect(
      await failure(stranger, "nfai_admin_create_draft", {
        p_table: "public.providers",
        p_values: { slug: "x", name: "X" },
      }),
    ).toBe("NFA01");
  });
});

describe("enforcement outside the admin functions", () => {
  it("service_role cannot validate or publish directly", async () => {
    const editor = await admin("Test Editor Service", ["editor"]);
    const id = await providerDraft(editor.rpc);
    await expect(
      asRole(db, "service_role", (tx) =>
        tx.query("select public.nfai_transition('public.providers', $1, 'validated')", [id]),
      ),
    ).rejects.toThrow(/admin workflow functions/);
    // Unreviewed moves between draft and extracted stay possible (future ingestion).
    await asRole(db, "service_role", async (tx) => {
      await tx.query("select public.nfai_transition('public.providers', $1, 'extracted')", [id]);
    });
  });

  it("anon cannot call the admin API and the caller cannot pick its own actor", async () => {
    const anon = pgliteRpcClient(db, {}, "anon");
    expect(await failure(anon, "nfai_admin_whoami")).toBe("42501");

    const editor = await admin("Test Editor Actor", ["editor"]);
    const someoneElse = await admin("Test Bystander", ["editor"]);
    // A pre-set actor setting is overwritten from auth.uid() inside the function.
    const actor = await asRole(
      db,
      "authenticated",
      async (tx) => {
        await tx.query("select set_config('nfai.actor_id', $1, true)", [someoneElse.id]);
        const { rows } = await tx.query<{ id: string }>(
          "select public.nfai_admin_create_draft('public.providers', $1::jsonb) as id",
          [JSON.stringify({ slug: slug("actor-check"), name: "Actor Check (synthetic)" })],
        );
        await tx.exec("reset role");
        const { rows: events } = await tx.query<{ actor_id: string }>(
          "select actor_id from public.publication_events where record_id = $1",
          [rows[0]!.id],
        );
        return events[0]?.actor_id;
      },
      { sub: editor.id },
    );
    expect(actor).toBe(editor.id);
  });

  it("audit reads need view_audit", async () => {
    const editor = await admin("Test Editor Audit", ["editor"]);
    const reviewer = await admin("Test Reviewer Audit", ["reviewer"]);
    expect(await failure(editor.rpc, "nfai_admin_audit_log")).toBe("NFA03");
    const rows = await ok<{ actor_id: string | null }[]>(reviewer.rpc, "nfai_admin_audit_log", {
      p_actor_id: editor.id,
    });
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("published records", () => {
  it("withdrawal needs a reason; supersede publishes the replacement and keeps the old row", async () => {
    const editor = await admin("Test Editor Published", ["editor"]);
    const reviewer = await admin("Test Reviewer Published", ["reviewer"]);
    const publisher = await admin("Test Publisher Published", ["publisher"]);

    const publish = async () => {
      const id = await providerDraft(editor.rpc);
      await ok(editor.rpc, "nfai_admin_submit", p("public.providers", id));
      await ok(reviewer.rpc, "nfai_admin_validate", p("public.providers", id));
      return id;
    };

    const withdrawn = await publish();
    await ok(publisher.rpc, "nfai_admin_publish", p("public.providers", withdrawn));
    expect(
      await failure(
        publisher.rpc,
        "nfai_admin_withdraw",
        p("public.providers", withdrawn, { p_reason: "" }),
      ),
    ).toBe("22023");
    expect(
      await failure(
        reviewer.rpc,
        "nfai_admin_withdraw",
        p("public.providers", withdrawn, { p_reason: "Wrong" }),
      ),
    ).toBe("NFA03");
    await ok(
      publisher.rpc,
      "nfai_admin_withdraw",
      p("public.providers", withdrawn, {
        p_reason: "Source retracted",
        p_reason_code: "source_retracted",
      }),
    );
    expect(await stateOf("public.providers", withdrawn)).toBe("withdrawn");

    const old = await publish();
    await ok(publisher.rpc, "nfai_admin_publish", p("public.providers", old));
    const replacement = await publish();
    await ok(publisher.rpc, "nfai_admin_supersede", {
      p_table: "public.providers",
      p_old_id: old,
      p_new_id: replacement,
      p_kind: "correction",
      p_reason: "Name was wrong",
    });
    expect(await stateOf("public.providers", old)).toBe("superseded");
    expect(await stateOf("public.providers", replacement)).toBe("published");
  });
});
