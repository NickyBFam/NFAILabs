import type { AdminContext, AdminRpcClient } from "@/lib/admin/mutations/context";
import { AdminActionError } from "@/lib/admin/mutations/errors";
import {
  callRpc,
  type MutationDefinition,
  returnedId,
  runAdminMutation,
} from "@/lib/admin/mutations/pipeline";
import type { AdminResult } from "@/lib/admin/mutations/result";
import { parseInput, type Schema, type Values } from "@/lib/admin/mutations/validation";

/**
 * Access management (docs/ADMIN.md §3-§4): admin identities and role
 * assignments. Every operation needs `manage_admins`, which the identity and
 * role functions check again in SQL, together with the rules that nobody
 * changes their own status or roles and that every change has a reason.
 */

/** Role codes (docs/ADMIN.md §4). The database rejects anything else. */
export const ADMIN_ROLES = ["viewer", "editor", "reviewer", "publisher", "administrator"] as const;

const REASON = { kind: "text", required: true, multiline: true, max: 1000 } as const;
const DISPLAY_NAME = { kind: "text", required: true, max: 120 } as const;
const ADMIN_ID = { kind: "uuid", required: true } as const;

function accessDefinition(
  name: string,
  schema: Schema,
  execute: (db: AdminRpcClient, values: Values) => Promise<string>,
): MutationDefinition<Values, never> {
  return {
    name,
    permission: "manage_admins",
    parse: (raw) => parseInput(schema, raw),
    execute: async (db, values) => ({ id: await execute(db, values) }),
  };
}

const createIdentityDefinition = accessDefinition(
  "create_identity",
  { authUserId: ADMIN_ID, displayName: DISPLAY_NAME, reason: REASON },
  async (db, values) =>
    returnedId(
      await callRpc(db, "nfai_admin_create_identity", {
        p_id: values.authUserId,
        p_display_name: values.displayName,
        p_reason: values.reason,
      }),
    ),
);

const setIdentityStatusDefinition = accessDefinition(
  "set_identity_status",
  {
    adminId: ADMIN_ID,
    status: { kind: "enum", required: true, values: ["active", "disabled"] },
    reason: REASON,
  },
  async (db, values) => {
    await callRpc(db, "nfai_admin_set_identity_status", {
      p_id: values.adminId,
      p_status: values.status,
      p_reason: values.reason,
    });
    return values.adminId as string;
  },
);

const setDisplayNameDefinition = accessDefinition(
  "set_display_name",
  { adminId: ADMIN_ID, displayName: DISPLAY_NAME, reason: REASON },
  async (db, values) => {
    await callRpc(db, "nfai_admin_set_identity_display_name", {
      p_id: values.adminId,
      p_display_name: values.displayName,
      p_reason: values.reason,
    });
    return values.adminId as string;
  },
);

const ROLE = { kind: "enum", required: true, values: ADMIN_ROLES } as const;

const grantRoleDefinition = accessDefinition(
  "grant_role",
  { adminId: ADMIN_ID, role: ROLE, reason: REASON },
  async (db, values) =>
    returnedId(
      await callRpc(db, "nfai_admin_grant_role", {
        p_admin_id: values.adminId,
        p_role: values.role,
        p_reason: values.reason,
      }),
    ),
);

/**
 * Revokes the admin's active assignment of `role`. The assignment id is looked
 * up through the role-history read function (manage_admins in SQL), then one
 * write call revokes it; the write re-checks everything, including self-revoke.
 */
const revokeRoleDefinition = accessDefinition(
  "revoke_role",
  { adminId: ADMIN_ID, role: ROLE, reason: REASON },
  async (db, values) => {
    const history = await callRpc(db, "nfai_admin_role_history", { p_admin_id: values.adminId });
    const active = (Array.isArray(history) ? history : []).find(
      (row: unknown): row is Record<string, unknown> =>
        typeof row === "object" &&
        row !== null &&
        (row as Record<string, unknown>).role_code === values.role &&
        (row as Record<string, unknown>).revoked_at === null,
    );
    const assignmentId = active?.assignment_id;
    if (typeof assignmentId !== "string") {
      throw new AdminActionError("invalid_state", "no active assignment of that role", {
        fieldErrors: { role: "This admin does not hold that role." },
      });
    }
    await callRpc(db, "nfai_admin_revoke_role", {
      p_assignment_id: assignmentId,
      p_reason: values.reason,
    });
    return assignmentId;
  },
);

/** `{ authUserId, displayName, reason }`: an admin identity (no roles) for an existing Auth user. */
export const createIdentity = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, createIdentityDefinition, input);

/** `{ adminId, status: "active" | "disabled", reason }`: never the caller's own. */
export const setIdentityStatus = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, setIdentityStatusDefinition, input);

/** `{ adminId, displayName, reason }`. */
export const setDisplayName = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, setDisplayNameDefinition, input);

/** `{ adminId, role, reason }`: never to oneself. Returns the assignment id. */
export const grantRole = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, grantRoleDefinition, input);

/** `{ adminId, role, reason }`: revokes the active assignment; never one's own. */
export const revokeRole = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, revokeRoleDefinition, input);
