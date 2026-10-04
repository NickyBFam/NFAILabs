import type { AdminIdentityView, AdminRole, RoleHistoryEntry } from "@/components/admin/types";
import type { AdminContext } from "@/lib/admin/mutations/context";
import { parseInput } from "@/lib/admin/mutations/validation";
import type { AdminResult } from "@/lib/admin/mutations/result";
import { readRows, runAdminQuery, str, strings } from "@/lib/admin/queries/runner";

/**
 * Admin identities and role history for the access page. Requires
 * `manage_admins`, which the read functions check again in SQL.
 */

const ROLES: ReadonlySet<string> = new Set([
  "viewer",
  "editor",
  "reviewer",
  "publisher",
  "administrator",
]);
const isRole = (value: string | null): value is AdminRole => value !== null && ROLES.has(value);

export async function listAdmins(ctx: AdminContext): Promise<AdminResult<AdminIdentityView[]>> {
  return runAdminQuery(ctx, "list_admins", "manage_admins", async (admin) => {
    const rows = await readRows(admin, "nfai_admin_list_admins");
    const self = admin.actor.authUserId.toLowerCase();
    return rows.map((row) => {
      const id = str(row, "admin_id") ?? "";
      return {
        id,
        displayName: str(row, "display_name") ?? "",
        status: str(row, "status") === "active" ? "active" : "disabled",
        // The disable reason stays server-side (0006); the audit log holds it.
        disabledReason: null,
        activeRoles: strings(row, "roles").filter(isRole),
        createdAt: str(row, "created_at") ?? "",
        isSelf: id.toLowerCase() === self,
      };
    });
  });
}

/** One entry per grant and per revocation, newest first. */
export async function listRoleHistory(
  ctx: AdminContext,
  input: { adminId?: unknown; limit?: number } = {},
): Promise<AdminResult<RoleHistoryEntry[]>> {
  return runAdminQuery(ctx, "role_history", "manage_admins", async (admin) => {
    const { adminId } = parseInput({ adminId: { kind: "uuid" } }, { adminId: input.adminId });
    const rows = await readRows(admin, "nfai_admin_role_history", { p_admin_id: adminId ?? null });
    const entries: RoleHistoryEntry[] = [];
    for (const row of rows) {
      const role = str(row, "role_code");
      const assignment = str(row, "assignment_id");
      if (!isRole(role) || !assignment) continue;
      const adminLabel = str(row, "admin_name") ?? "";
      entries.push({
        id: `${assignment}-granted`,
        adminLabel,
        role,
        change: "granted",
        actorLabel: str(row, "granted_by_name") ?? "Owner bootstrap",
        occurredAt: str(row, "granted_at") ?? "",
        reason: str(row, "grant_reason"),
      });
      const revokedAt = str(row, "revoked_at");
      if (revokedAt) {
        entries.push({
          id: `${assignment}-revoked`,
          adminLabel,
          role,
          change: "revoked",
          actorLabel: str(row, "revoked_by_name") ?? "",
          occurredAt: revokedAt,
          reason: str(row, "revoke_reason"),
        });
      }
    }
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 200), 1), 1000);
    return entries
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, limit);
  });
}
