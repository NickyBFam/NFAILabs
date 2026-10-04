import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdminAccess, type AdminAccess, type AdminActor } from "@/lib/auth/access";
import { readAuthConfig } from "@/lib/auth/config";
import { ADMIN_UNAUTHORIZED_PATH, signInPathFor } from "@/lib/auth/routes";
import { createAdminAuthClient, gatewayFor } from "@/lib/auth/supabase";

/**
 * Server-side admin session API (docs/ADMIN.md §2–§3). Every admin page, server
 * action and route handler calls `requireAdmin()` (or `getAdminAccess()`) itself;
 * the proxy only refreshes cookies and turns away obviously anonymous requests.
 *
 * The actor always comes from the Supabase-verified session and the database identity
 * row, never from request input, so a client cannot choose who it acts as.
 */

export type { AdminAccess, AdminActor } from "@/lib/auth/access";

/**
 * The request's Supabase client, bound to its admin cookies. Memoized per request.
 * In Server Components cookies are read-only, so a token refresh there cannot be
 * saved; the proxy refreshes before rendering, and server actions can write.
 */
const getRequestClient = cache(async (): Promise<SupabaseClient | null> => {
  const config = readAuthConfig();
  if (!config) return null;
  const store = await cookies();
  return createAdminAuthClient(config, {
    getAll: () => store.getAll(),
    setAll: (toSet) => {
      try {
        for (const { name, value, options } of toSet) store.set(name, value, options);
      } catch {
        // Read-only in Server Components; the proxy persists refreshed sessions.
      }
    },
  });
});

/** The request's client and its access decision, resolved together and memoized. */
const resolveRequest = cache(
  async (): Promise<{ client: SupabaseClient | null; access: AdminAccess }> => {
    const client = await getRequestClient();
    if (!client) return { client: null, access: { status: "unavailable" } };
    return { client, access: await resolveAdminAccess(gatewayFor(client)) };
  },
);

/** Access decision for the current request, memoized per request. */
export async function getAdminAccess(): Promise<AdminAccess> {
  return (await resolveRequest()).access;
}

/** The signed-in active administrator, or null. */
export async function getAdminSession(): Promise<AdminActor | null> {
  const access = await getAdminAccess();
  return access.status === "allowed" ? access.actor : null;
}

/**
 * Returns the active administrator or ends the request with a redirect: to sign-in
 * when signed out, to the unauthorized page for a missing or disabled identity, and
 * to sign-in with an "unavailable" notice when Supabase Auth cannot be reached.
 * Authorization for a specific permission is checked separately (Thread B / D).
 */
export async function requireAdmin(): Promise<AdminActor> {
  const access = await getAdminAccess();
  switch (access.status) {
    case "allowed":
      return access.actor;
    case "unauthenticated":
      redirect(signInPathFor());
    case "identity_missing":
    case "identity_disabled":
      redirect(ADMIN_UNAUTHORIZED_PATH);
    case "unavailable":
      redirect(signInPathFor(null, "unavailable"));
  }
}

/**
 * The active administrator plus a Supabase client that carries their own JWT (role
 * `authenticated`). Admin mutations call `nfai_admin_*` functions through it, and the
 * database derives the actor from `auth.uid()`. Returns null when not an active admin.
 */
export async function getAdminDatabaseClient(): Promise<{
  actor: AdminActor;
  client: SupabaseClient;
} | null> {
  // The same client whose session was just verified, so actor and token always match.
  const { client, access } = await resolveRequest();
  return client && access.status === "allowed" ? { actor: access.actor, client } : null;
}
