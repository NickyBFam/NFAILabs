import "server-only";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthGateway, IdentityLookup } from "@/lib/auth/access";
import { adminAuthCookieOptions } from "@/lib/auth/config";
import { verifyUser } from "@/lib/auth/verify";
import type { SupabasePublicConfig } from "@/lib/data/clients/config";

/**
 * Supabase clients for admin auth. They use the anon key plus the signed-in user's
 * session from the admin cookies, so every database call runs as `authenticated`
 * with that user's JWT and Row Level Security applies. The service-role key is never
 * used here.
 */

/**
 * Creates a per-request client over a cookie adapter. Create one per request and
 * never share it: it carries that request's session.
 */
export function createAdminAuthClient(
  config: SupabasePublicConfig,
  cookies: CookieMethodsServer,
): SupabaseClient {
  return createServerClient(config.url, config.anonKey, {
    cookieOptions: adminAuthCookieOptions(),
    cookies,
    auth: { detectSessionInUrl: false },
  });
}

/** Reads the user's own identity row; RLS (0006) makes any other row invisible. */
export async function lookupIdentity(
  client: SupabaseClient,
  userId: string,
): Promise<IdentityLookup> {
  const { data, error } = await client
    .from("admin_identities")
    .select("id, display_name, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { status: "error" };
  return { status: "ok", row: data ?? null };
}

export function gatewayFor(client: SupabaseClient): AuthGateway {
  return {
    verifyUser: () => verifyUser(client),
    lookupIdentity: (userId) => lookupIdentity(client, userId),
  };
}
