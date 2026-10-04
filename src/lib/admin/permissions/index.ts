/**
 * Admin roles and permissions (docs/ADMIN.md §4).
 *
 * The database is authoritative: migration 0007 holds the same matrix in
 * `admin_role_permissions`, and every `nfai_admin_*` function checks permissions
 * in SQL. This module mirrors it for typing and UI decisions only; a database
 * test fails if the two drift. Code checks permissions, never role names.
 */

export const ADMIN_PERMISSIONS = [
  "view_admin",
  "edit_draft",
  "submit_review",
  "validate_fact",
  "reject_fact",
  "publish_fact",
  "supersede_fact",
  "withdraw_fact",
  "view_audit",
  "manage_admins",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLES = ["viewer", "editor", "reviewer", "publisher", "administrator"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  viewer: ["view_admin"],
  editor: ["view_admin", "edit_draft", "submit_review"],
  reviewer: ["view_admin", "validate_fact", "reject_fact", "view_audit"],
  publisher: [
    "view_admin",
    "reject_fact",
    "publish_fact",
    "supersede_fact",
    "withdraw_fact",
    "view_audit",
  ],
  // Manages access only; a person who also publishes holds both roles.
  administrator: ["view_admin", "view_audit", "manage_admins"],
};

const PERMISSION_SET: ReadonlySet<string> = new Set(ADMIN_PERMISSIONS);
const ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === "string" && PERMISSION_SET.has(value);
}

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

/** Union of the permissions granted by the given roles. */
export function permissionsForRoles(roles: Iterable<AdminRole>): ReadonlySet<AdminPermission> {
  const result = new Set<AdminPermission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  return result;
}

/**
 * Parses the `permissions` array returned by `nfai_admin_whoami()`. Unknown
 * codes are dropped (fail closed) rather than trusted.
 */
export function parsePermissions(value: unknown): ReadonlySet<AdminPermission> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter(isAdminPermission));
}
