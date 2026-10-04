/**
 * TEST-ONLY admin context with a scripted rpc client, for unit tests of the
 * mutation pipeline. Database-backed behaviour is tested separately against
 * PGlite (see `pglite-context.ts`).
 */
import type {
  AdminAccess,
  AdminContext,
  AdminPermission,
  AdminRpcClient,
  RpcResponse,
} from "@/lib/admin/mutations/context";

export const SYNTHETIC_ADMIN_ID = "00000000-0000-4000-8000-00000000a001";

export type RpcCall = { fn: string; args: Record<string, unknown> | undefined };

export type FakeContextOptions = {
  access?: AdminAccess;
  permissions?: readonly AdminPermission[];
  /** Admin id the database reports (defaults to the session's). */
  databaseAdminId?: string;
  /** Responses for workflow functions, by name. */
  responses?: Record<string, RpcResponse | (() => RpcResponse)>;
  noDatabase?: boolean;
};

export function fakeContext(options: FakeContextOptions = {}) {
  const calls: RpcCall[] = [];
  const reported: { error: unknown; operation: string }[] = [];
  const access: AdminAccess = options.access ?? {
    status: "allowed",
    actor: { authUserId: SYNTHETIC_ADMIN_ID, displayName: "Synthetic Test Admin" },
  };

  const client: AdminRpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      if (fn === "nfai_admin_whoami") {
        return Promise.resolve({
          data: [
            {
              admin_id: options.databaseAdminId ?? SYNTHETIC_ADMIN_ID,
              display_name: "Synthetic Test Admin",
              roles: [],
              permissions: [...(options.permissions ?? [])],
            },
          ],
          error: null,
        });
      }
      const response = options.responses?.[fn];
      const resolved = typeof response === "function" ? response() : response;
      return Promise.resolve(resolved ?? { data: null, error: null });
    },
  };

  const ctx: AdminContext = {
    access: () => Promise.resolve(access),
    database: () => Promise.resolve(options.noDatabase ? null : client),
    report: (error, operation) => reported.push({ error, operation }),
  };

  /** Calls other than the permission lookup, i.e. attempted workflow writes. */
  const workflowCalls = () => calls.filter((call) => call.fn !== "nfai_admin_whoami");
  return { ctx, calls, workflowCalls, reported };
}
