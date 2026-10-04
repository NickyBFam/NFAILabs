/**
 * Migration 0006: internal admin identities. Real SQL in PGlite (see docs/DATABASE.md §6).
 * All identities are synthetic: fixed test uuids and "Test Admin" names, no emails.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOwner, asRole, createTestDatabase, listMigrationFiles } from "@/test/db/harness";

const ADMIN_A = "00000000-0000-4000-8000-00000000a001";
const ADMIN_B = "00000000-0000-4000-8000-00000000a002";
const DISABLED = "00000000-0000-4000-8000-00000000a003";
const NOT_AN_ADMIN = "00000000-0000-4000-8000-00000000a004";

const signedIn = (sub: string) => ({ sub, role: "authenticated" });

describe("admin identities (0006)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
    await db.query(
      `insert into public.admin_identities (id, display_name) values ($1, 'Test Admin A'), ($2, 'Test Admin B')`,
      [ADMIN_A, ADMIN_B],
    );
    await db.query(
      `insert into public.admin_identities (id, display_name, status, disabled_reason)
       values ($1, 'Test Admin Disabled', 'disabled', 'Synthetic test identity')`,
      [DISABLED],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it("passes the security self-audit", async () => {
    const { rows } = await db.query<{ check_name: string; object_name: string }>(
      "select check_name, object_name from public.nfai_security_audit()",
    );
    if (listMigrationFiles().some((file) => file.startsWith("0007_"))) {
      // 0007 replaces the audit with the Phase 3 allow-list, which reviews 0006's functions.
      expect(rows).toEqual([]);
      return;
    }
    // Without 0007, the 0004 audit reports only the three reviewed identity functions.
    const reviewed = [
      "nfai_admin_create_identity(uuid,text,text,jsonb)",
      "nfai_admin_set_identity_status(uuid,text,text)",
      "nfai_admin_set_identity_display_name(uuid,text,text)",
    ];
    const unexpected = rows.filter(
      (r) =>
        !(
          ["security_definer_unreviewed", "api_role_function_execute"].includes(r.check_name) &&
          reviewed.includes(r.object_name.replace(/^public\./, ""))
        ),
    );
    expect(unexpected).toEqual([]);
  });

  it("has row level security and no API-role write privileges", async () => {
    const { rows } = await db.query<{ rls: boolean; anon: boolean; ins: boolean; upd: boolean }>(`
      select c.relrowsecurity as rls,
             has_any_column_privilege('anon', c.oid, 'SELECT') as anon,
             has_table_privilege('authenticated', c.oid, 'INSERT') as ins,
             has_any_column_privilege('authenticated', c.oid, 'UPDATE') as upd
        from pg_class c where c.oid = 'public.admin_identities'::regclass`);
    expect(rows[0]).toEqual({ rls: true, anon: false, ins: false, upd: false });
  });

  describe("identity lookup as the signed-in user", () => {
    const lookup = (sub: string, id: string) =>
      asRole(
        db,
        "authenticated",
        async (tx) =>
          (
            await tx.query<{ id: string; display_name: string; status: string }>(
              "select id, display_name, status from public.admin_identities where id = $1",
              [id],
            )
          ).rows,
        signedIn(sub),
      );

    it("returns the caller's own active identity", async () => {
      expect(await lookup(ADMIN_A, ADMIN_A)).toEqual([
        { id: ADMIN_A, display_name: "Test Admin A", status: "active" },
      ]);
    });

    it("returns a disabled identity as disabled, so the guard can refuse it", async () => {
      expect(await lookup(DISABLED, DISABLED)).toEqual([
        { id: DISABLED, display_name: "Test Admin Disabled", status: "disabled" },
      ]);
    });

    it("returns nothing for a signed-in user with no identity", async () => {
      expect(await lookup(NOT_AN_ADMIN, NOT_AN_ADMIN)).toEqual([]);
    });

    it("never reveals another user's identity", async () => {
      expect(await lookup(ADMIN_A, ADMIN_B)).toEqual([]);
      expect(await lookup(NOT_AN_ADMIN, ADMIN_A)).toEqual([]);
      const all = await asRole(
        db,
        "authenticated",
        async (tx) => (await tx.query("select id from public.admin_identities")).rows,
        signedIn(ADMIN_A),
      );
      expect(all).toEqual([{ id: ADMIN_A }]);
    });

    it("withholds server-side columns from the signed-in user", async () => {
      await expect(
        asRole(
          db,
          "authenticated",
          (tx) => tx.query("select metadata from public.admin_identities"),
          signedIn(ADMIN_A),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRole(
          db,
          "authenticated",
          (tx) => tx.query("select disabled_reason from public.admin_identities"),
          signedIn(DISABLED),
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it("gives anon nothing", async () => {
      await expect(
        asRole(db, "anon", (tx) => tx.query("select id from public.admin_identities")),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("no client can create or change an identity", () => {
    it.each([
      [
        "insert",
        `insert into public.admin_identities (id, display_name) values ('${NOT_AN_ADMIN}', 'Self')`,
      ],
      ["promote", `update public.admin_identities set status = 'active' where id = '${DISABLED}'`],
      ["rename", `update public.admin_identities set display_name = 'x' where id = '${ADMIN_A}'`],
      ["delete", `delete from public.admin_identities where id = '${ADMIN_A}'`],
    ])("refuses a signed-in %s", async (_name, sql) => {
      await expect(
        asRole(db, "authenticated", (tx) => tx.query(sql), signedIn(ADMIN_A)),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("integrity", () => {
    it("refuses every direct write from the service role", async () => {
      for (const sql of [
        `insert into public.admin_identities (id, display_name) values ('${NOT_AN_ADMIN}', 'Minted')`,
        `update public.admin_identities set status = 'active' where id = '${DISABLED}'`,
        `delete from public.admin_identities where id = '${DISABLED}'`,
        `truncate public.admin_identities`,
      ]) {
        await expect(asRole(db, "service_role", (tx) => tx.query(sql))).rejects.toThrow(
          /permission denied/,
        );
      }
    });

    it("never deletes or truncates identities, even for the owner", async () => {
      await expect(
        asOwner(db, (tx) =>
          tx.query("delete from public.admin_identities where id = $1", [DISABLED]),
        ),
      ).rejects.toThrow(/never deleted/);
      await expect(
        asOwner(db, (tx) => tx.query("truncate public.admin_identities")),
      ).rejects.toThrow(/never deleted|cannot truncate a table referenced/);
    });

    it("keeps the id immutable", async () => {
      await expect(
        asOwner(db, (tx) =>
          tx.query("update public.admin_identities set id = $1 where id = $2", [
            NOT_AN_ADMIN,
            ADMIN_B,
          ]),
        ),
      ).rejects.toThrow(/immutable/);
    });

    it("requires a reason to disable and stamps the time on the server", async () => {
      await expect(
        asOwner(db, (tx) =>
          tx.query("update public.admin_identities set status = 'disabled' where id = $1", [
            ADMIN_B,
          ]),
        ),
      ).rejects.toThrow(/disabled_consistency/);

      const row = await asOwner(db, async (tx) => {
        await tx.query(
          `update public.admin_identities
              set status = 'disabled', disabled_reason = 'Synthetic rotation',
                  disabled_at = '2000-01-01T00:00:00Z'
            where id = $1`,
          [ADMIN_B],
        );
        return (
          await tx.query(
            `select status, disabled_at > now() - interval '1 minute' as recent
               from public.admin_identities where id = $1`,
            [ADMIN_B],
          )
        ).rows[0];
      });
      expect(row).toEqual({ status: "disabled", recent: true });
    });

    it("clears the disable fields on re-activation", async () => {
      const row = await asOwner(db, async (tx) => {
        await tx.query("update public.admin_identities set status = 'active' where id = $1", [
          DISABLED,
        ]);
        return (
          await tx.query(
            "select status, disabled_at, disabled_reason from public.admin_identities where id = $1",
            [DISABLED],
          )
        ).rows[0];
      });
      expect(row).toEqual({ status: "active", disabled_at: null, disabled_reason: null });
    });

    it("rejects blank or padded names and non-object metadata", async () => {
      for (const sql of [
        `insert into public.admin_identities (id, display_name) values (gen_random_uuid(), '')`,
        `insert into public.admin_identities (id, display_name) values (gen_random_uuid(), ' Padded ')`,
        `insert into public.admin_identities (id, display_name, metadata) values (gen_random_uuid(), 'Test', '[]')`,
      ]) {
        await expect(asOwner(db, (tx) => tx.query(sql))).rejects.toThrow(/check/);
      }
    });

    it("records identity creation in the audit log", async () => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.audit_log
          where table_name = 'public.admin_identities' and action = 'INSERT'`,
      );
      expect(rows[0]?.n).toBe(3);
    });
  });

  describe("identity management functions", () => {
    // 0006 ships a fail-closed permission stub that 0007 replaces with the real role
    // lookup. These tests install a test double that grants manage_admins to Test Admin A
    // only, so they check 0006's own logic independently of the role model.
    const grantManageAdminsToA = (tx: Transaction) =>
      tx.exec(`
        create or replace function public.nfai_admin_has_permission(p_admin_id uuid, p_permission text)
        returns boolean language sql stable set search_path = '' as $fn$
          select p_admin_id = '${ADMIN_A}'::uuid and p_permission = 'manage_admins';
        $fn$;`);

    /** Runs `fn` as a signed-in user (rolled back), after installing the permission double. */
    const call = <T>(sub: string | null, fn: (tx: Transaction) => Promise<T>, withDouble = true) =>
      asOwner(db, async (tx) => {
        if (withDouble) await grantManageAdminsToA(tx);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(sub ? signedIn(sub) : { role: "authenticated" }),
        ]);
        await tx.exec("set local role authenticated");
        return fn(tx);
      });

    const sqlState = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        return (error as { code?: string }).code;
      }
      return "no error";
    };

    const disable =
      (id: string, reason = "Synthetic") =>
      (tx: Transaction) =>
        tx.query("select public.nfai_admin_set_identity_status($1, 'disabled', $2)", [id, reason]);

    it("fails closed before roles exist: the 0006 stub grants nothing", async () => {
      expect(await sqlState(call(ADMIN_A, disable(ADMIN_B), false))).toBe("NFA03");
    });

    it("rejects callers who are signed out, not admins, disabled or lacking the permission", async () => {
      expect(await sqlState(call(null, disable(ADMIN_B)))).toBe("NFA01");
      expect(await sqlState(call(NOT_AN_ADMIN, disable(ADMIN_B)))).toBe("NFA01");
      expect(await sqlState(call(DISABLED, disable(ADMIN_B)))).toBe("NFA02");
      expect(await sqlState(call(ADMIN_B, disable(ADMIN_A)))).toBe("NFA03");
    });

    it("is not callable by anon or the service role", async () => {
      for (const role of ["anon", "service_role"] as const) {
        await expect(asRole(db, role, disable(ADMIN_B))).rejects.toThrow(/permission denied/);
      }
    });

    it("keeps the internal helpers away from every API role", async () => {
      for (const sql of [
        "select public.nfai_admin_current_identity()",
        "select public.nfai_admin_require_permission('manage_admins')",
        `select public.nfai_admin_has_permission('${ADMIN_A}'::uuid, 'manage_admins')`,
        "select public.nfai_admin_has_permission('manage_admins')",
      ]) {
        await expect(
          asRole(db, "authenticated", (tx) => tx.query(sql), signedIn(ADMIN_A)),
        ).rejects.toThrow(/permission denied/);
      }
    });

    it("creates an identity for an existing auth user, attributed to the caller", async () => {
      const result = await call(ADMIN_A, async (tx) => {
        await tx.exec("reset role");
        await tx.query("insert into auth.users (id) values ($1)", [NOT_AN_ADMIN]);
        await tx.exec("set local role authenticated");
        // An actor the client set beforehand is overwritten by the function.
        await tx.query("select set_config('nfai.actor_id', $1, true)", [ADMIN_B]);
        await tx.query(
          "select public.nfai_admin_create_identity($1, ' Test Admin New ', 'Synthetic onboarding')",
          [NOT_AN_ADMIN],
        );
        await tx.exec("reset role");
        return {
          identity: (
            await tx.query(
              "select display_name, status from public.admin_identities where id = $1",
              [NOT_AN_ADMIN],
            )
          ).rows[0],
          audit: (
            await tx.query(
              `select actor_id, actor_kind, reason from public.audit_log
                where table_name = 'public.admin_identities' and record_key = $1`,
              [NOT_AN_ADMIN],
            )
          ).rows,
        };
      });
      expect(result.identity).toEqual({ display_name: "Test Admin New", status: "active" });
      expect(result.audit).toEqual([
        { actor_id: ADMIN_A, actor_kind: "user", reason: "Synthetic onboarding" },
      ]);
    });

    it("refuses unknown auth users, duplicates and missing reasons", async () => {
      const unknown = "00000000-0000-4000-8000-00000000a0ff";
      const create = (id: string) => (tx: Transaction) =>
        tx.query("select public.nfai_admin_create_identity($1, 'Test', 'Synthetic')", [id]);
      expect(await sqlState(call(ADMIN_A, create(unknown)))).toBe("22023");
      expect(
        await sqlState(
          call(ADMIN_A, async (tx) => {
            await tx.exec("reset role");
            await tx.query("insert into auth.users (id) values ($1)", [ADMIN_B]);
            await tx.exec("set local role authenticated");
            return create(ADMIN_B)(tx);
          }),
        ),
      ).toBe("22023");
      expect(await sqlState(call(ADMIN_A, disable(ADMIN_B, "  ")))).toBe("22023");
    });

    it("disables another admin with a reason, but never the caller", async () => {
      expect(await sqlState(call(ADMIN_A, disable(ADMIN_A)))).toBe("NFA03");

      const row = await call(ADMIN_A, async (tx) => {
        await disable(ADMIN_B, "Synthetic offboarding")(tx);
        await tx.exec("reset role");
        return (
          await tx.query(
            `select status, disabled_reason, disabled_at is not null as stamped
               from public.admin_identities where id = $1`,
            [ADMIN_B],
          )
        ).rows[0];
      });
      expect(row).toEqual({
        status: "disabled",
        disabled_reason: "Synthetic offboarding",
        stamped: true,
      });
    });

    it("keeps history resolvable after the acting admin is disabled", async () => {
      const rows = await call(ADMIN_A, async (tx) => {
        await tx.query(
          "select public.nfai_admin_set_identity_display_name($1, 'Test Admin B2', 'Synthetic rename')",
          [ADMIN_B],
        );
        await tx.exec("reset role");
        // Later, Test Admin A is disabled by the owner.
        await tx.query(
          `update public.admin_identities
              set status = 'disabled', disabled_reason = 'Synthetic offboarding'
            where id = $1`,
          [ADMIN_A],
        );
        return (
          await tx.query(
            `select l.reason, l.changed_columns, l.old_row ->> 'display_name' as old_name,
                    who.display_name as actor, who.status as actor_status
               from public.audit_log l
               join public.admin_identities who on who.id = l.actor_id
              where l.table_name = 'public.admin_identities' and l.record_key = $1
                and l.action = 'UPDATE'`,
            [ADMIN_B],
          )
        ).rows;
      });
      expect(rows).toEqual([
        {
          reason: "Synthetic rename",
          changed_columns: ["display_name", "updated_at"],
          old_name: "Test Admin B",
          actor: "Test Admin A",
          actor_status: "disabled",
        },
      ]);
    });
  });
});
