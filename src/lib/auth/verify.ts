import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { VerifiedUser } from "@/lib/auth/access";

/**
 * Session verification shared by the proxy and server code. It holds no secrets (the
 * client carries only the anon key and the request's own session), so the proxy can
 * import it without the `server-only` marker.
 */

/** Auth API statuses that mean "this session is not valid", as opposed to an outage. */
const INVALID_SESSION_STATUSES = new Set([400, 401, 403, 404, 422]);

/** Maps a getUser() failure to signed-out (bad or missing session) or error (outage). */
export function classifyAuthError(error: unknown): VerifiedUser {
  if (isAuthSessionMissingError(error)) return { status: "signed_out" };
  if (isAuthRetryableFetchError(error)) return { status: "error" };
  if (isAuthApiError(error) && INVALID_SESSION_STATUSES.has(error.status)) {
    return { status: "signed_out" };
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number" || status >= 500) return { status: "error" };
  return { status: "signed_out" };
}

/**
 * Asks the Supabase Auth server to validate the session's access token (refreshing it
 * first when expired). Never trusts cookie contents or getSession() alone: a revoked,
 * expired, tampered or deleted-user session comes back as signed out.
 */
export async function verifyUser(client: SupabaseClient): Promise<VerifiedUser> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return classifyAuthError(error);
    return data.user ? { status: "signed_in", userId: data.user.id } : { status: "signed_out" };
  } catch {
    return { status: "error" };
  }
}
