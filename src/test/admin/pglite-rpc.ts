/**
 * TEST-ONLY `AdminRpcClient` backed by PGlite, standing in for a Supabase
 * client that carries a signed-in admin's JWT.
 *
 * Each `rpc` call runs in its own committed transaction as the `authenticated`
 * role with `request.jwt.claims` set, exactly like a PostgREST request: grants,
 * RLS, SECURITY DEFINER checks and deferred (commit-time) constraints all apply.
 * Errors are reduced to the fields PostgREST returns (code, message, details,
 * hint), so the sanitizer is tested against what production really sees.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { AdminContext, AdminRpcClient, RpcResponse } from "@/lib/admin/mutations/context";
import type { AdminAccess } from "@/lib/admin/mutations/context";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

type FunctionShape = { returnsSet: boolean };

async function functionShape(db: PGlite, fn: string): Promise<FunctionShape | null> {
  const { rows } = await db.query<{ proretset: boolean }>(
    `select p.proretset from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = $1
      limit 1`,
    [fn],
  );
  return rows[0] ? { returnsSet: rows[0].proretset } : null;
}

function postgrestError(error: unknown) {
  const e = (error ?? {}) as Record<string, unknown>;
  return {
    code: typeof e.code === "string" ? e.code : "XX000",
    message: typeof e.message === "string" ? e.message : String(error),
    details: typeof e.detail === "string" ? e.detail : null,
    hint: typeof e.hint === "string" ? e.hint : null,
  };
}

export type JwtRole = "authenticated" | "anon";

/**
 * A client whose calls carry `claims` (use `{ sub: <auth user id> }` for a
 * signed-in admin, `{}` for a request without a user).
 */
export function pgliteRpcClient(
  db: PGlite,
  claims: Record<string, unknown>,
  role: JwtRole = "authenticated",
): AdminRpcClient {
  return {
    async rpc(fn, args = {}): Promise<RpcResponse> {
      if (!IDENTIFIER.test(fn)) throw new Error(`unsafe function name ${fn}`);
      const shape = await functionShape(db, fn);
      if (!shape) {
        return { data: null, error: { code: "PGRST202", message: "function not found" } };
      }
      const names = Object.keys(args);
      for (const name of names) {
        if (!IDENTIFIER.test(name)) throw new Error(`unsafe argument name ${name}`);
      }
      const call = `public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(", ")})`;
      const params = names.map((name) => {
        const value = args[name];
        return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
      });
      const sql = shape.returnsSet
        ? `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as data from ${call} r`
        : `select to_jsonb(${call}) as data`;

      try {
        let data: unknown = null;
        await db.transaction(async (tx) => {
          await tx.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ role, ...claims }),
          ]);
          await tx.exec(`set local role ${role}`);
          const { rows } = await tx.query<{ data: unknown }>(sql, params);
          data = rows[0]?.data ?? null;
        });
        return { data, error: null };
      } catch (error) {
        return { data: null, error: postgrestError(error) };
      }
    },
  };
}

/**
 * An `AdminContext` for a synthetic admin. `access` defaults to what Thread A's
 * `getAdminAccess()` would report for an active identity; pass another status
 * to simulate signed-out, missing or disabled callers at the session layer.
 */
export function pgliteAdminContext(
  db: PGlite,
  adminId: string | null,
  access?: AdminAccess,
  reported: unknown[] = [],
): AdminContext {
  return {
    access: async () =>
      access ??
      (adminId
        ? { status: "allowed", actor: { authUserId: adminId, displayName: "Synthetic Test Admin" } }
        : { status: "unauthenticated" }),
    database: async () => (adminId ? pgliteRpcClient(db, { sub: adminId }) : null),
    report: (error) => reported.push(error),
  };
}
