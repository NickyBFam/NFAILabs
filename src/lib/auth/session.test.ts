/**
 * Server session helpers, sign-in and sign-out, with next/headers, next/navigation and
 * @supabase/ssr replaced by in-memory fakes (src/lib/auth/testing/fake-auth.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeIdentity,
  createCookieStore,
  createFakeSupabase,
  RedirectSignal,
  TEST_ENV,
  TEST_USER,
  type FakeAuthScenario,
} from "@/lib/auth/testing/fake-auth";

type CookieStore = ReturnType<typeof createCookieStore>;
type FakeClient = ReturnType<typeof createFakeSupabase>;

const state = vi.hoisted(() => ({
  scenario: undefined as unknown as FakeAuthScenario,
  store: undefined as unknown as CookieStore,
  clients: [] as FakeClient[],
  options: [] as Record<string, unknown>[],
}));

vi.mock("next/headers", () => ({ cookies: async () => state.store }));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: Record<string, unknown>) => {
    state.options.push(options);
    const client = createFakeSupabase(
      state.scenario,
      options.cookies as Parameters<typeof createFakeSupabase>[1],
    );
    state.clients.push(client);
    return client;
  },
}));

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries(TEST_ENV)) vi.stubEnv(key, value);
  state.scenario = { user: "signed_in", identity: activeIdentity, signIn: "ok" };
  state.store = createCookieStore({ "nfai-admin-auth": "session" });
  state.clients = [];
  state.options = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const server = () => import("@/lib/auth/server");
const actions = () => import("@/lib/auth/actions");

describe("current session", () => {
  it("returns no admin for a request with no session", async () => {
    state.scenario.user = "signed_out";
    state.store = createCookieStore();
    const { getAdminAccess, getAdminSession } = await server();
    expect(await getAdminAccess()).toEqual({ status: "unauthenticated" });
    expect(await getAdminSession()).toBeNull();
  });

  it("returns the verified admin for a valid session", async () => {
    const { getAdminSession } = await server();
    expect(await getAdminSession()).toEqual({
      authUserId: TEST_USER,
      displayName: "Test Admin A",
    });
    // Verified with the Auth server, then the identity read with the user's own token.
    expect(state.clients[0]?.calls.getUser).toBe(1);
    expect(state.clients[0]?.calls.identityQueries).toEqual([`admin_identities:${TEST_USER}`]);
  });

  it("reports a missing identity", async () => {
    state.scenario.identity = null;
    const { getAdminAccess, getAdminSession } = await server();
    expect(await getAdminAccess()).toEqual({ status: "identity_missing" });
    expect(await getAdminSession()).toBeNull();
  });

  it("reports a disabled identity", async () => {
    state.scenario.identity = { ...activeIdentity, status: "disabled" };
    const { getAdminAccess } = await server();
    expect(await getAdminAccess()).toEqual({ status: "identity_disabled" });
  });

  it("treats a rejected token as signed out", async () => {
    state.scenario.user = "invalid";
    const { getAdminAccess } = await server();
    expect(await getAdminAccess()).toEqual({ status: "unauthenticated" });
  });

  it("fails closed when auth is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { getAdminAccess } = await server();
    expect(await getAdminAccess()).toEqual({ status: "unavailable" });
    expect(state.clients).toEqual([]);
  });

  it("uses httpOnly cookies scoped to /admin", async () => {
    const { getAdminAccess } = await server();
    await getAdminAccess();
    expect(state.options[0]?.cookieOptions).toMatchObject({
      path: "/admin",
      httpOnly: true,
      sameSite: "lax",
    });
  });
});

describe("requireAdmin (admin route guard)", () => {
  it("returns the actor for an active admin", async () => {
    const { requireAdmin } = await server();
    expect(await requireAdmin()).toEqual({ authUserId: TEST_USER, displayName: "Test Admin A" });
  });

  it.each([
    ["no session", { user: "signed_out" }, "/admin/auth/sign-in"],
    ["a missing identity", { identity: null }, "/admin/auth/unauthorized"],
    [
      "a disabled identity",
      { identity: { ...activeIdentity, status: "disabled" } },
      "/admin/auth/unauthorized",
    ],
    ["an Auth outage", { user: "outage" }, "/admin/auth/sign-in?notice=unavailable"],
    ["a database outage", { identity: "error" }, "/admin/auth/sign-in?notice=unavailable"],
  ] as const)("redirects %s to %s", async (_label, change, location) => {
    Object.assign(state.scenario, change);
    const { requireAdmin } = await server();
    expect(await redirectOf(requireAdmin())).toBe(location);
  });

  it("gives database access only to an active admin", async () => {
    const { getAdminDatabaseClient } = await server();
    const result = await getAdminDatabaseClient();
    expect(result?.actor.authUserId).toBe(TEST_USER);
    expect(result?.client).toBe(state.clients[0]);

    vi.resetModules();
    state.scenario.identity = { ...activeIdentity, status: "disabled" };
    const again = await server();
    expect(await again.getAdminDatabaseClient()).toBeNull();
  });
});

describe("signInAction", () => {
  const credentials = { email: "test-admin@example.test", password: "synthetic-password" };

  it("signs in an active admin and returns to a safe admin page", async () => {
    state.scenario.user = "signed_out";
    state.store = createCookieStore();
    const { signInAction } = await actions();
    const location = await redirectOf(
      signInAction({ error: null }, form({ ...credentials, next: "/admin/review" })),
    );
    expect(location).toBe("/admin/review");
    expect(state.store.jar.get("nfai-admin-auth")).toBe("session");
  });

  it("never redirects off-site", async () => {
    state.scenario.user = "signed_out";
    const { signInAction } = await actions();
    expect(
      await redirectOf(
        signInAction({ error: null }, form({ ...credentials, next: "https://evil.example.test" })),
      ),
    ).toBe("/admin");
  });

  it("signs a non-admin straight back out", async () => {
    state.scenario.user = "signed_out";
    state.scenario.identity = null;
    state.store = createCookieStore();
    const { signInAction } = await actions();
    expect(await signInAction({ error: null }, form(credentials))).toEqual({
      error: "not_authorized",
    });
    expect(state.clients[0]?.calls.signOut).toEqual([{ scope: "local" }]);
    expect(state.store.jar.has("nfai-admin-auth")).toBe(false);
  });

  it("signs a disabled admin straight back out", async () => {
    state.scenario.user = "signed_out";
    state.scenario.identity = { ...activeIdentity, status: "disabled" };
    const { signInAction } = await actions();
    expect(await signInAction({ error: null }, form(credentials))).toEqual({
      error: "not_authorized",
    });
    expect(state.clients[0]?.calls.signOut).toHaveLength(1);
  });

  it.each([
    ["bad_credentials", "invalid_credentials"],
    ["rate_limited", "rate_limited"],
    ["outage", "unavailable"],
  ] as const)("maps a %s sign-in failure to %s", async (signIn, error) => {
    state.scenario.signIn = signIn;
    state.scenario.user = "signed_out";
    const { signInAction } = await actions();
    expect(await signInAction({ error: null }, form(credentials))).toEqual({ error });
  });

  it("rejects malformed input before calling Supabase", async () => {
    const { signInAction } = await actions();
    expect(await signInAction({ error: null }, form({ email: "x" }))).toEqual({
      error: "invalid_input",
    });
    expect(state.clients).toEqual([]);
  });
});

describe("signOutAction (logout)", () => {
  it("revokes the session, clears every admin cookie and returns to sign-in", async () => {
    state.store = createCookieStore({
      "nfai-admin-auth.0": "chunk-0",
      "nfai-admin-auth.1": "chunk-1",
      unrelated: "keep",
    });
    const { signOutAction } = await actions();
    expect(await redirectOf(signOutAction())).toBe("/admin/auth/sign-in?notice=signed_out");
    expect(state.clients[0]?.calls.signOut).toEqual([{ scope: "local" }]);
    expect([...state.store.jar.keys()]).toEqual(["unrelated"]);
    expect(state.store.deleted.every((entry) => entry.path === "/admin")).toBe(true);
  });

  it("still clears cookies when auth is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    state.store = createCookieStore({ "nfai-admin-auth": "session" });
    const { signOutAction } = await actions();
    expect(await redirectOf(signOutAction())).toBe("/admin/auth/sign-in?notice=signed_out");
    expect(state.store.jar.size).toBe(0);
  });
});
