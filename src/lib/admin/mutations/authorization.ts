import {
  ADMIN_PERMISSIONS,
  type AdminActor,
  type AdminContext,
  type AdminPermission,
  type AdminRpcClient,
} from "@/lib/admin/mutations/context";
import { AdminActionError } from "@/lib/admin/mutations/errors";

/**
 * Reusable authorization helpers. They fail closed: any missing, malformed or
 * unexpected answer is treated as "not allowed". They are a first layer only;
 * the `nfai_admin_*` SQL functions check identity, status and permission again
 * on every call, so skipping these helpers can never grant access.
 */

export type AuthorizedAdmin = {
  actor: AdminActor;
  db: AdminRpcClient;
  permissions: ReadonlySet<AdminPermission>;
};

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(ADMIN_PERMISSIONS);

/** Steps 1-2: a verified session that belongs to an active admin identity. */
export async function authenticateAdmin(
  ctx: AdminContext,
): Promise<{ actor: AdminActor; db: AdminRpcClient }> {
  const access = await ctx.access();
  switch (access.status) {
    case "allowed":
      break;
    case "unauthenticated":
      throw new AdminActionError("unauthenticated");
    case "identity_missing":
      throw new AdminActionError("forbidden", "signed-in user has no admin identity");
    case "identity_disabled":
      throw new AdminActionError("account_disabled");
    case "unavailable":
      throw new AdminActionError("internal", "authentication is unavailable");
    default:
      throw new AdminActionError("forbidden", "unrecognised access status");
  }
  const db = await ctx.database();
  if (!db)
    throw new AdminActionError(
      "unauthenticated",
      "session ended before the database client was created",
    );
  return { actor: access.actor, db };
}

/**
 * The caller as the database sees it for this request (`nfai_admin_whoami()`):
 * identity, active roles and effective permissions, re-read on every call.
 */
export type AdminProfile = {
  adminId: string;
  displayName: string;
  roles: readonly string[];
  permissions: ReadonlySet<AdminPermission>;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Reads the caller's profile from the database. Unknown permission codes are
 * dropped; an error or an unexpected shape fails closed.
 */
export async function loadAdminProfile(db: AdminRpcClient): Promise<AdminProfile> {
  const { data, error } = await db.rpc("nfai_admin_whoami");
  if (error) throw error;
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (typeof row !== "object" || row === null) {
    throw new AdminActionError("forbidden", "no admin profile returned");
  }
  const { admin_id, display_name, roles, permissions } = row as Record<string, unknown>;
  if (typeof admin_id !== "string")
    throw new AdminActionError("forbidden", "admin profile has no id");
  return {
    adminId: admin_id,
    displayName: typeof display_name === "string" ? display_name : "",
    roles: stringList(roles),
    permissions: new Set(
      stringList(permissions).filter((code): code is AdminPermission =>
        KNOWN_PERMISSIONS.has(code),
      ),
    ),
  };
}

/**
 * Steps 2-3 for one request: the database profile must belong to the same
 * person as the verified session (a mismatch means the session and the
 * database client disagree, and is refused), and its permissions are returned.
 */
export async function loadPermissions(
  db: AdminRpcClient,
  actor?: AdminActor,
): Promise<ReadonlySet<AdminPermission>> {
  const profile = await loadAdminProfile(db);
  if (actor && profile.adminId.toLowerCase() !== actor.authUserId.toLowerCase()) {
    throw new AdminActionError("forbidden", "database identity does not match the session");
  }
  return profile.permissions;
}

export function hasPermission(
  permissions: ReadonlySet<AdminPermission>,
  permission: AdminPermission,
): boolean {
  return permissions.has(permission);
}

/** Step 3: throws `forbidden` unless every listed permission is held. */
export function requirePermission(
  permissions: ReadonlySet<AdminPermission>,
  ...required: readonly AdminPermission[]
): void {
  if (required.length === 0) throw new AdminActionError("forbidden", "no permission declared");
  for (const permission of required) {
    if (!permissions.has(permission)) {
      throw new AdminActionError("forbidden", `missing permission ${permission}`);
    }
  }
}

/** Steps 1-3 together, for queries and mutations. */
export async function authorizeAdmin(
  ctx: AdminContext,
  ...required: readonly AdminPermission[]
): Promise<AuthorizedAdmin> {
  const { actor, db } = await authenticateAdmin(ctx);
  const permissions = await loadPermissions(db, actor);
  requirePermission(permissions, ...required);
  return { actor, db, permissions };
}
