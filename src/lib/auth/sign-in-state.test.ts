import { describe, expect, it } from "vitest";
import { parseSignInForm, SIGN_IN_ERROR_MESSAGES } from "@/lib/auth/sign-in-state";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseSignInForm", () => {
  it("accepts a trimmed email, a password and an optional next path", () => {
    expect(
      parseSignInForm(form({ email: " test-admin@example.test ", password: "pw", next: "/admin" })),
    ).toEqual({ email: "test-admin@example.test", password: "pw", next: "/admin" });
  });

  it.each([
    [{ password: "pw" }],
    [{ email: "test-admin@example.test" }],
    [{ email: "no-at-sign", password: "pw" }],
    [{ email: "test-admin@example.test", password: "" }],
    [{ email: "test-admin@example.test", password: "x".repeat(1025) }],
  ])("rejects %j", (values) => {
    expect(parseSignInForm(form(values))).toBeNull();
  });

  it("uses one message for wrong email and wrong password (no account enumeration)", () => {
    expect(SIGN_IN_ERROR_MESSAGES.invalid_credentials).toMatch(/email address or password/);
  });
});
