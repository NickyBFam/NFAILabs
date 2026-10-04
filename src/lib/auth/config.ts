import type { CookieOptionsWithName } from "@supabase/ssr";
import { readSupabasePublicConfig, type SupabasePublicConfig } from "@/lib/data/clients/config";
import { ADMIN_ROOT_PATH } from "@/lib/auth/routes";

/**
 * Admin auth settings shared by the proxy and server code. Only the public URL and
 * anon key are used: sessions are Supabase Auth sessions, and admin access is checked
 * with the user's own token, never with the service-role key.
 */

/** Idle timeout: each token refresh rewrites the cookie, so inactivity ends the session. */
export const ADMIN_SESSION_IDLE_SECONDS = 8 * 60 * 60;

/** Cookie name prefix; @supabase/ssr may split a long session into `.0`, `.1` chunks. */
export const ADMIN_AUTH_COOKIE_NAME = "nfai-admin-auth";

/**
 * Session cookie options. httpOnly keeps tokens away from page scripts (no browser
 * auth client is used), path limits the cookie to the admin area, SameSite=Lax blocks
 * cross-site POSTs from carrying it, and Secure is on outside local development.
 */
export function adminAuthCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CookieOptionsWithName {
  return {
    name: ADMIN_AUTH_COOKIE_NAME,
    path: ADMIN_ROOT_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: nodeEnv === "production",
    maxAge: ADMIN_SESSION_IDLE_SECONDS,
  };
}

/** Supabase URL and anon key, or null when auth is not configured (admin then fails closed). */
export function readAuthConfig(): SupabasePublicConfig | null {
  try {
    return readSupabasePublicConfig();
  } catch {
    return null;
  }
}
