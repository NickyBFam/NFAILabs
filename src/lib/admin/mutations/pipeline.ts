import {
  authenticateAdmin,
  loadPermissions,
  requirePermission,
} from "@/lib/admin/mutations/authorization";
import type { AdminContext, AdminPermission, AdminRpcClient } from "@/lib/admin/mutations/context";
import { AdminActionError, sanitizeError } from "@/lib/admin/mutations/errors";
import type { AdminResult } from "@/lib/admin/mutations/result";

/**
 * The one path every admin mutation takes:
 *
 *   1. authenticate            (verified session; `ctx.access`)
 *   2. resolve admin identity  (active `admin_identities` row; disabled fails)
 *   3. authorize permission    (re-read from the database for this request)
 *   4. validate input          (allowlist; unknown fields such as actor, role or
 *                               state are rejected, never ignored)
 *   5. set actor context  ┐   one `rpc` to one `nfai_admin_*` SQL function over
 *   6. execute            ┘   the admin's own JWT; SQL derives the actor from
 *                              auth.uid() and re-checks 2-3 before it writes
 *   7. sanitize errors        (fixed messages only; details go to `ctx.report`)
 *
 * Input is validated only after authorization, so an unauthorized caller learns
 * nothing about the input rules.
 */

export type MutationDefinition<Input, Output> = {
  /** Stable name for logs. */
  name: string;
  permission: AdminPermission;
  parse(raw: unknown): Input;
  execute(db: AdminRpcClient, input: Input): Promise<{ id?: string; data?: Output }>;
  /** Table and field names used to turn database checks into field errors. */
  errorContext?(input: Input | undefined): { table?: string; fields?: readonly string[] };
};

export async function runAdminMutation<Input, Output>(
  ctx: AdminContext,
  definition: MutationDefinition<Input, Output>,
  raw: unknown,
): Promise<AdminResult<Output>> {
  let input: Input | undefined;
  try {
    const { actor, db } = await authenticateAdmin(ctx);
    const permissions = await loadPermissions(db, actor);
    requirePermission(permissions, definition.permission);
    input = definition.parse(raw);
    const { id, data } = await definition.execute(db, input);
    const result: AdminResult<Output> = { ok: true };
    if (id !== undefined) result.id = id;
    if (data !== undefined) result.data = data;
    return result;
  } catch (error) {
    const failure = sanitizeError(error, definition.errorContext?.(input) ?? {});
    if (failure.code === "internal" || !(error instanceof AdminActionError)) {
      ctx.report?.(error, definition.name);
    }
    return failure;
  }
}

/** Calls one workflow function and throws its error for the pipeline to sanitize. */
export async function callRpc(
  db: AdminRpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workflow functions that create rows return the new id; anything else is a server fault. */
export function returnedId(data: unknown): string {
  const value = Array.isArray(data) ? data[0] : data;
  const candidate =
    typeof value === "object" && value !== null
      ? Object.values(value as Record<string, unknown>)[0]
      : value;
  if (typeof candidate !== "string" || !UUID.test(candidate)) {
    throw new AdminActionError("internal", "workflow function did not return an id");
  }
  return candidate;
}
