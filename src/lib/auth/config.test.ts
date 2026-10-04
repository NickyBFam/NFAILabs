import { describe, expect, it } from "vitest";
import { adminAuthCookieOptions, ADMIN_SESSION_IDLE_SECONDS } from "@/lib/auth/config";

describe("adminAuthCookieOptions", () => {
  it("keeps the session cookie away from scripts and other paths", () => {
    expect(adminAuthCookieOptions("production")).toEqual({
      name: "nfai-admin-auth",
      path: "/admin",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: ADMIN_SESSION_IDLE_SECONDS,
    });
  });

  it("allows plain http only outside production", () => {
    expect(adminAuthCookieOptions("development").secure).toBe(false);
    expect(adminAuthCookieOptions("test").secure).toBe(false);
  });

  it("ends idle sessions within a working day", () => {
    expect(ADMIN_SESSION_IDLE_SECONDS).toBeLessThanOrEqual(12 * 60 * 60);
  });
});
