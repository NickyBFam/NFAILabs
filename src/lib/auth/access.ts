/**
 * Admin access decision. Pure: the Supabase calls are passed in as an AuthGateway, so
 * every outcome (no session, valid admin, missing or disabled identity, Auth outage)
 * is unit tested without a network. `server.ts` wires the real gateway.
 */

/** The signed-in administrator. `authUserId` is the Supabase Auth user id and the admin id. */
export type AdminActor = {
  readonly authUserId: string;
  readonly displayName: string;
};

export type AdminAccess =
  | { readonly status: "allowed"; readonly actor: AdminActor }
  | { readonly status: "unauthenticated" }
  | { readonly status: "identity_missing" }
  | { readonly status: "identity_disabled" }
  | { readonly status: "unavailable" };

/** Row shape readable by `authenticated` on public.admin_identities (own row only, 0006). */
export type AdminIdentityRow = {
  id: string;
  display_name: string;
  status: string;
};

export type VerifiedUser =
  { status: "signed_in"; userId: string } | { status: "signed_out" } | { status: "error" };

export type IdentityLookup = { status: "ok"; row: AdminIdentityRow | null } | { status: "error" };

export interface AuthGateway {
  /** Verifies the session with the Supabase Auth server (never trusts cookie contents). */
  verifyUser(): Promise<VerifiedUser>;
  /** Reads the user's own admin identity row with the user's own token (RLS). */
  lookupIdentity(userId: string): Promise<IdentityLookup>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decides whether the current request belongs to an active administrator. Any
 * unexpected shape or failure denies access; nothing here can be influenced by
 * client-supplied identity values.
 */
export async function resolveAdminAccess(gateway: AuthGateway): Promise<AdminAccess> {
  let user: VerifiedUser;
  try {
    user = await gateway.verifyUser();
  } catch {
    return { status: "unavailable" };
  }
  if (user.status === "error") return { status: "unavailable" };
  if (user.status !== "signed_in" || !UUID.test(user.userId)) return { status: "unauthenticated" };

  let identity: IdentityLookup;
  try {
    identity = await gateway.lookupIdentity(user.userId);
  } catch {
    return { status: "unavailable" };
  }
  if (identity.status !== "ok") return { status: "unavailable" };

  const row = identity.row;
  if (!row || row.id.toLowerCase() !== user.userId.toLowerCase()) {
    return { status: "identity_missing" };
  }
  if (row.status !== "active") return { status: "identity_disabled" };

  return {
    status: "allowed",
    actor: { authUserId: user.userId, displayName: row.display_name },
  };
}
