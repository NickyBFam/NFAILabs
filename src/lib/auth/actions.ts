"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  isAuthApiError,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { resolveAdminAccess } from "@/lib/auth/access";
import { ADMIN_AUTH_COOKIE_NAME, readAuthConfig } from "@/lib/auth/config";
import { ADMIN_ROOT_PATH, safeAdminRedirect, signInPathFor } from "@/lib/auth/routes";
import { parseSignInForm, type SignInState } from "@/lib/auth/sign-in-state";
import { createAdminAuthClient, gatewayFor } from "@/lib/auth/supabase";

/**
 * Admin sign-in and sign-out server actions. Server actions are POST-only and
 * Next.js rejects cross-origin calls, and the session cookie is SameSite=Lax.
 * There is deliberately no sign-up action: admin accounts are created by the owner.
 */

async function writableClient(): Promise<SupabaseClient | null> {
  const config = readAuthConfig();
  if (!config) return null;
  const store = await cookies();
  return createAdminAuthClient(config, {
    getAll: () => store.getAll(),
    setAll: (toSet) => {
      for (const { name, value, options } of toSet) store.set(name, value, options);
    },
  });
}

/** Removes every admin session cookie (including @supabase/ssr chunks and verifiers). */
async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (name.startsWith(ADMIN_AUTH_COOKIE_NAME)) {
      store.delete({ name, path: ADMIN_ROOT_PATH });
    }
  }
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const input = parseSignInForm(formData);
  if (!input) return { error: "invalid_input" };

  const client = await writableClient();
  if (!client) return { error: "unavailable" };

  const { error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) {
    if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
      return { error: "unavailable" };
    }
    if (isAuthApiError(error) && error.status === 429) return { error: "rate_limited" };
    return { error: "invalid_credentials" };
  }

  // A valid Supabase account is not enough: it needs an active admin identity. Anyone
  // else is signed straight back out, so no non-admin session lingers.
  const access = await resolveAdminAccess(gatewayFor(client));
  if (access.status !== "allowed") {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    await clearSessionCookies();
    return { error: access.status === "unavailable" ? "unavailable" : "not_authorized" };
  }

  redirect(safeAdminRedirect(input.next));
}

/**
 * Ends the session: revokes it with Supabase Auth (this device's refresh token) and
 * clears the cookies even if Auth cannot be reached, then returns to sign-in.
 */
export async function signOutAction(): Promise<void> {
  const client = await writableClient();
  if (client) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  await clearSessionCookies();
  redirect(signInPathFor(null, "signed_out"));
}
