/**
 * Test doubles for the admin auth tests: a fake @supabase/ssr client and a fake
 * Next.js cookie store. Synthetic values only; nothing here talks to a network.
 */
import type { AdminIdentityRow } from "@/lib/auth/access";

export const TEST_USER = "00000000-0000-4000-8000-00000000a001";
export const TEST_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
};

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };
type CookieAdapter = {
  getAll: () => { name: string; value: string }[] | null;
  setAll?: (cookies: CookieToSet[], headers: Record<string, string>) => void;
};

export type FakeAuthScenario = {
  /** What getUser() reports. "refresh" signs in and writes rotated cookies first. */
  user: "signed_in" | "signed_out" | "invalid" | "outage" | "refresh";
  identity: AdminIdentityRow | null | "error";
  signIn: "ok" | "bad_credentials" | "rate_limited" | "outage";
};

export const activeIdentity: AdminIdentityRow = {
  id: TEST_USER,
  display_name: "Test Admin A",
  status: "active",
};

export function createFakeSupabase(scenario: FakeAuthScenario, cookies: CookieAdapter) {
  const calls = { signOut: [] as unknown[], getUser: 0, identityQueries: [] as string[] };
  let signedIn = scenario.user === "signed_in" || scenario.user === "refresh";

  const apiError = (message: string, status: number) =>
    Object.assign(new Error(message), { name: "AuthApiError", status, __isAuthError: true });

  const client = {
    calls,
    auth: {
      async getUser() {
        calls.getUser += 1;
        if (scenario.user === "refresh") {
          cookies.setAll?.(
            [{ name: "nfai-admin-auth", value: "rotated", options: { path: "/admin" } }],
            { "Cache-Control": "private, no-store" },
          );
        }
        if (scenario.user === "outage") {
          return { data: { user: null }, error: apiError("down", 503) };
        }
        if (scenario.user === "invalid") {
          return { data: { user: null }, error: apiError("invalid JWT", 401) };
        }
        if (!signedIn) {
          return {
            data: { user: null },
            error: Object.assign(new Error("Auth session missing!"), {
              name: "AuthSessionMissingError",
              status: 400,
              __isAuthError: true,
            }),
          };
        }
        return { data: { user: { id: TEST_USER } }, error: null };
      },
      async signInWithPassword() {
        if (scenario.signIn === "ok") {
          signedIn = true;
          cookies.setAll?.(
            [{ name: "nfai-admin-auth", value: "session", options: { path: "/admin" } }],
            {},
          );
          return { data: {}, error: null };
        }
        if (scenario.signIn === "rate_limited") {
          return { data: {}, error: apiError("rate limit", 429) };
        }
        if (scenario.signIn === "outage") return { data: {}, error: apiError("down", 502) };
        return { data: {}, error: apiError("Invalid login credentials", 400) };
      },
      async signOut(options: unknown) {
        calls.signOut.push(options);
        signedIn = false;
        cookies.setAll?.([{ name: "nfai-admin-auth", value: "", options: { maxAge: 0 } }], {});
        return { error: null };
      },
    },
    from(table: string) {
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          calls.identityQueries.push(`${table}:${value}`);
          return query;
        },
        maybeSingle: async () =>
          scenario.identity === "error"
            ? { data: null, error: { message: "db down" } }
            : { data: scenario.identity, error: null },
      };
      return query;
    },
  };
  return client;
}

/** In-memory stand-in for the object returned by next/headers cookies(). */
export function createCookieStore(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const deleted: { name: string; path?: string }[] = [];
  return {
    jar,
    deleted,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (arg: string | { name: string; path?: string }) => {
      const entry = typeof arg === "string" ? { name: arg } : arg;
      deleted.push(entry);
      jar.delete(entry.name);
    },
  };
}

/** Error thrown by the mocked next/navigation redirect(). */
export class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}
