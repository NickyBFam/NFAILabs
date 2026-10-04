/**
 * Database-backed tests for access management and draft deletion, through the
 * TypeScript pipeline into the real identity and role functions (0006/0007).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as access from "@/lib/admin/mutations/access";
import * as ops from "@/lib/admin/mutations/operations";
import type { AdminResult } from "@/lib/admin/mutations/result";
import * as accessReads from "@/lib/admin/queries/access";
import * as reads from "@/lib/admin/queries/reads";
import { pgliteAdminContext } from "@/test/admin/pglite-rpc";
import { createSyntheticAdmin, syntheticUuid } from "@/test/admin/synthetic-admins";
import { createTestDatabase } from "@/test/db/harness";

let db: PGlite;
const ids: Record<string, string> = {};
const ctx = (who: string) => pgliteAdminContext(db, ids[who]!);

function ok(result: AdminResult): string {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return (result as { id?: string }).id ?? "";
}

async function authUser(): Promise<string> {
  const id = syntheticUuid("dddddddd");
  await db.query("insert into auth.users (id, email) values ($1, $2)", [
    id,
    `synthetic-${id.slice(-4)}@example.test`,
  ]);
  return id;
}

async function statusOf(id: string): Promise<string | undefined> {
  const { rows } = await db.query<{ status: string }>(
    "select status from public.admin_identities where id = $1",
    [id],
  );
  return rows[0]?.status;
}

beforeAll(async () => {
  db = await createTestDatabase();
  ids.admin = await createSyntheticAdmin(db, {
    name: "Synthetic Administrator",
    roles: ["administrator"],
  });
  ids.admin2 = await createSyntheticAdmin(db, {
    name: "Synthetic Second Administrator",
    roles: ["administrator"],
  });
  ids.editor = await createSyntheticAdmin(db, { name: "Synthetic Editor", roles: ["editor"] });
  ids.publisher = await createSyntheticAdmin(db, {
    name: "Synthetic Publisher",
    roles: ["publisher"],
  });
});

afterAll(async () => {
  await db.close();
});

describe("manage_admins is required", () => {
  it("refuses every access operation and read without it", async () => {
    const target = ids.publisher!;
    const results = [
      await access.createIdentity(ctx("editor"), {
        authUserId: await authUser(),
        displayName: "Synthetic New Admin",
        reason: "Synthetic test.",
      }),
      await access.setIdentityStatus(ctx("publisher"), {
        adminId: ids.editor,
        status: "disabled",
        reason: "Synthetic test.",
      }),
      await access.setDisplayName(ctx("editor"), {
        adminId: target,
        displayName: "Renamed",
        reason: "Synthetic test.",
      }),
      await access.grantRole(ctx("editor"), {
        adminId: target,
        role: "editor",
        reason: "Synthetic test.",
      }),
      await access.revokeRole(ctx("publisher"), {
        adminId: target,
        role: "publisher",
        reason: "Synthetic test.",
      }),
      await accessReads.listAdmins(ctx("editor")),
      await accessReads.listRoleHistory(ctx("publisher")),
    ];
    for (const result of results) expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(await statusOf(ids.editor!)).toBe("active");
  });
});

describe("identities and roles", () => {
  it("creates an identity, grants and revokes a role, with history and attribution", async () => {
    const user = await authUser();
    expect(
      ok(
        await access.createIdentity(ctx("admin"), {
          authUserId: user,
          displayName: "Synthetic Invited Admin",
          reason: "Synthetic onboarding.",
        }),
      ),
    ).toBe(user);
    ok(
      await access.grantRole(ctx("admin"), {
        adminId: user,
        role: "reviewer",
        reason: "Synthetic grant.",
      }),
    );

    const admins = (await accessReads.listAdmins(ctx("admin"))) as {
      ok: true;
      data: { id: string }[];
    };
    expect(admins.data.find((a) => a.id === user)).toMatchObject({
      displayName: "Synthetic Invited Admin",
      status: "active",
      activeRoles: ["reviewer"],
      isSelf: false,
    });
    expect(admins.data.find((a) => a.id === ids.admin)).toMatchObject({ isSelf: true });

    ok(
      await access.revokeRole(ctx("admin2"), {
        adminId: user,
        role: "reviewer",
        reason: "Synthetic revoke.",
      }),
    );
    const history = (await accessReads.listRoleHistory(ctx("admin"), { adminId: user })) as {
      ok: true;
      data: { change: string; actorLabel: string; reason: string | null }[];
    };
    expect(history.data.map((e) => [e.change, e.actorLabel, e.reason])).toEqual([
      ["revoked", "Synthetic Second Administrator", "Synthetic revoke."],
      ["granted", "Synthetic Administrator", "Synthetic grant."],
    ]);

    // Revoking a role the admin no longer holds is a clear, sanitized failure.
    expect(
      await access.revokeRole(ctx("admin"), { adminId: user, role: "reviewer", reason: "Again." }),
    ).toMatchObject({
      ok: false,
      code: "invalid_state",
      fieldErrors: { role: expect.any(String) },
    });
  });

  it("refuses self grant, self revoke and self disable", async () => {
    expect(
      await access.grantRole(ctx("admin"), {
        adminId: ids.admin,
        role: "publisher",
        reason: "Self.",
      }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(
      await access.revokeRole(ctx("admin"), {
        adminId: ids.admin,
        role: "administrator",
        reason: "Self.",
      }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(
      await access.setIdentityStatus(ctx("admin"), {
        adminId: ids.admin,
        status: "disabled",
        reason: "Self.",
      }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(await statusOf(ids.admin!)).toBe("active");
  });

  it("requires a reason for every change, in TypeScript and in SQL", async () => {
    for (const result of [
      await access.setIdentityStatus(ctx("admin"), { adminId: ids.editor, status: "disabled" }),
      await access.grantRole(ctx("admin"), { adminId: ids.editor, role: "viewer", reason: "  " }),
      await access.setDisplayName(ctx("admin"), { adminId: ids.editor, displayName: "X" }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        code: "invalid_input",
        fieldErrors: { reason: expect.any(String) },
      });
    }
    const direct = await pgliteAdminContext(db, ids.admin!).database();
    const { error } = await direct!.rpc("nfai_admin_set_identity_status", {
      p_id: ids.editor,
      p_status: "disabled",
      p_reason: "",
    });
    expect(error?.code).toBe("22023");
    expect(await statusOf(ids.editor!)).toBe("active");
  });

  it("a disabled admin is refused on the next call, whatever the session says", async () => {
    const victim = await createSyntheticAdmin(db, {
      name: "Synthetic Soon Disabled",
      roles: ["editor"],
    });
    const session = pgliteAdminContext(db, victim);
    ok(
      await ops.createDraft(session, {
        table: "providers",
        values: { slug: "synthetic-before-disable", name: "Synthetic Before Disable" },
      }),
    );
    ok(
      await access.setIdentityStatus(ctx("admin"), {
        adminId: victim,
        status: "disabled",
        reason: "Synthetic offboarding.",
      }),
    );
    expect(
      await ops.createDraft(session, {
        table: "providers",
        values: { slug: "synthetic-after-disable", name: "Synthetic After Disable" },
      }),
    ).toMatchObject({ ok: false, code: "account_disabled" });
    expect(await reads.listReviewQueue(session)).toMatchObject({
      ok: false,
      code: "account_disabled",
    });

    ok(
      await access.setIdentityStatus(ctx("admin"), {
        adminId: victim,
        status: "active",
        reason: "Synthetic return.",
      }),
    );
    ok(
      await ops.createDraft(session, {
        table: "providers",
        values: { slug: "synthetic-after-return", name: "Synthetic After Return" },
      }),
    );
  });

  it("renames an identity", async () => {
    ok(
      await access.setDisplayName(ctx("admin"), {
        adminId: ids.publisher,
        displayName: "Synthetic Renamed Publisher",
        reason: "Synthetic rename.",
      }),
    );
    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.admin_identities where id = $1",
      [ids.publisher],
    );
    expect(rows[0]?.display_name).toBe("Synthetic Renamed Publisher");
  });
});

describe("delete draft", () => {
  it("deletes an unsubmitted draft with a reason, and refuses submitted or reviewed rows", async () => {
    const draft = ok(
      await ops.createDraft(ctx("editor"), {
        table: "providers",
        values: { slug: "synthetic-delete-me", name: "Synthetic Delete Me" },
      }),
    );
    const detail = await reads.getRecord(ctx("editor"), { table: "providers", id: draft });
    expect(detail.ok && detail.data?.actions.map((a) => a.action)).toContain("delete_draft");
    expect(await ops.deleteDraft(ctx("editor"), { table: "providers", id: draft })).toMatchObject({
      code: "invalid_input",
    });
    expect(
      await ops.deleteDraft(ctx("publisher"), { table: "providers", id: draft, reason: "No." }),
    ).toMatchObject({
      code: "forbidden",
    });
    ok(
      await ops.deleteDraft(ctx("editor"), {
        table: "providers",
        id: draft,
        reason: "Synthetic duplicate.",
      }),
    );
    const { rows } = await db.query("select 1 from public.providers where id = $1", [draft]);
    expect(rows).toEqual([]);
    const { rows: audit } = await db.query<{ actor_id: string; reason: string }>(
      `select actor_id, reason from public.audit_log
        where table_name = 'public.providers' and record_key = $1 and action = 'DELETE'`,
      [draft],
    );
    expect(audit).toEqual([{ actor_id: ids.editor, reason: "Synthetic duplicate." }]);

    const submitted = ok(
      await ops.createDraft(ctx("editor"), {
        table: "providers",
        values: { slug: "synthetic-keep-me", name: "Synthetic Keep Me" },
      }),
    );
    ok(await ops.submitForReview(ctx("editor"), { table: "providers", id: submitted }));
    expect(
      await ops.deleteDraft(ctx("editor"), {
        table: "providers",
        id: submitted,
        reason: "Too late.",
      }),
    ).toMatchObject({ ok: false, code: "invalid_state" });
  });
});
