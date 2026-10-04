/**
 * The Next.js proxy (src/proxy.ts) as the first admin gate, with @supabase/ssr faked.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeIdentity,
  createFakeSupabase,
  TEST_ENV,
  type FakeAuthScenario,
} from "@/lib/auth/testing/fake-auth";

const state = vi.hoisted(() => ({ scenario: undefined as unknown as FakeAuthScenario }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: Record<string, unknown>) =>
    createFakeSupabase(state.scenario, options.cookies as Parameters<typeof createFakeSupabase>[1]),
}));

const request = (path: string, cookie = "nfai-admin-auth=session") =>
  new NextRequest(new URL(path, "https://nfai.example.test"), { headers: { cookie } });

const run = async (path: string, cookie?: string) => {
  const { proxy } = await import("@/proxy");
  return proxy(request(path, cookie));
};

beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries(TEST_ENV)) vi.stubEnv(key, value);
  state.scenario = { user: "signed_in", identity: activeIdentity, signIn: "ok" };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin proxy", () => {
  it("only runs on /admin", async () => {
    const { config } = await import("@/proxy");
    expect(config.matcher).toEqual(["/admin", "/admin/:path*"]);
  });

  it("sends a request without a session to sign-in, keeping the requested page", async () => {
    state.scenario.user = "signed_out";
    const response = await run("/admin/review?state=draft", "");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://nfai.example.test/admin/auth/sign-in?next=%2Fadmin%2Freview%3Fstate%3Ddraft",
    );
  });

  it("sends a rejected or expired session to sign-in", async () => {
    state.scenario.user = "invalid";
    const response = await run("/admin");
    expect(response.headers.get("location")).toBe("https://nfai.example.test/admin/auth/sign-in");
  });

  it("lets a verified session through, private and noindex", async () => {
    const response = await run("/admin/models");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("writes refreshed session cookies to the response", async () => {
    state.scenario.user = "refresh";
    const response = await run("/admin");
    expect(response.cookies.get("nfai-admin-auth")?.value).toBe("rotated");
  });

  it("always lets the auth pages render", async () => {
    state.scenario.user = "signed_out";
    for (const path of [
      "/admin/auth/sign-in",
      "/admin/auth/sign-out",
      "/admin/auth/unauthorized",
    ]) {
      const response = await run(path, "");
      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  it("fails closed when Supabase Auth is down or not configured", async () => {
    state.scenario.user = "outage";
    expect((await run("/admin")).headers.get("location")).toBe(
      "https://nfai.example.test/admin/auth/sign-in?notice=unavailable",
    );

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    state.scenario.user = "signed_in";
    expect((await run("/admin")).headers.get("location")).toBe(
      "https://nfai.example.test/admin/auth/sign-in?notice=unavailable",
    );
  });
});
