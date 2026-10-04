import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { AdminPermission, AdminViewer } from "@/components/admin/types";
import { loadAdminProfile, type AdminProfile } from "@/lib/admin/mutations/authorization";
import { getAdminContext } from "@/lib/admin/mutations/server";
import { requireAdmin } from "@/lib/auth/server";
import { ADMIN_UNAUTHORIZED_PATH, signInPathFor } from "@/lib/auth/routes";

/**
 * The signed-in admin for this request. `requireAdmin()` verifies the session with the
 * auth server and redirects anyone who is signed out, unknown or disabled. Roles and
 * permissions are then read from the database (`nfai_admin_whoami`) with the admin's own
 * token, so nothing here trusts cookies, headers or client input. Memoized per request.
 */
export const loadViewer = cache(async (): Promise<AdminViewer> => {
  const actor = await requireAdmin();
  const db = await getAdminContext().database();
  if (!db) redirect(signInPathFor());

  let profile: AdminProfile | null = null;
  try {
    profile = await loadAdminProfile(db);
  } catch {
    profile = null;
  }
  if (!profile || profile.adminId.toLowerCase() !== actor.authUserId.toLowerCase()) {
    redirect(ADMIN_UNAUTHORIZED_PATH);
  }

  return {
    displayName: profile.displayName || actor.displayName,
    roles: profile.roles,
    permissions: [...profile.permissions] satisfies AdminPermission[],
  };
});
