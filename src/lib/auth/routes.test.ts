import { describe, expect, it } from "vitest";
import {
  ADMIN_ROOT_PATH,
  ADMIN_SIGN_IN_PATH,
  isAdminAuthPath,
  isProtectedAdminPath,
  safeAdminRedirect,
  signInPathFor,
} from "@/lib/auth/routes";

describe("admin route classification", () => {
  it.each([
    ["/admin", true],
    ["/admin/review", true],
    ["/admin/models/123", true],
    ["/admin/auth/sign-in", false],
    ["/admin/auth", false],
    ["/administrator", false],
    ["/", false],
    ["/models", false],
  ])("%s protected: %s", (path, expected) => {
    expect(isProtectedAdminPath(path)).toBe(expected);
  });

  it("treats only /admin/auth pages as auth pages", () => {
    expect(isAdminAuthPath("/admin/auth/sign-out")).toBe(true);
    expect(isAdminAuthPath("/admin/authx")).toBe(false);
    expect(isAdminAuthPath("/admin")).toBe(false);
  });
});

describe("safeAdminRedirect", () => {
  it.each([
    ["/admin/review", "/admin/review"],
    ["/admin/models?state=draft", "/admin/models?state=draft"],
    ["/admin", "/admin"],
  ])("keeps the admin page %s", (input, expected) => {
    expect(safeAdminRedirect(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.example.test/admin"],
    ["//evil.example.test/admin"],
    ["/\\evil.example.test"],
    ["\\\\evil.example.test"],
    ["/admin/../models"],
    ["/models"],
    ["/admin/auth/sign-in"],
    ["javascript:alert(1)"],
    ["/admin\n/x"],
    [`/admin/${"a".repeat(600)}`],
  ])("falls back to the admin home for %j", (input) => {
    expect(safeAdminRedirect(input)).toBe(ADMIN_ROOT_PATH);
  });
});

describe("signInPathFor", () => {
  it("returns the plain sign-in path when there is nothing to carry", () => {
    expect(signInPathFor()).toBe(ADMIN_SIGN_IN_PATH);
    expect(signInPathFor("https://evil.example.test")).toBe(ADMIN_SIGN_IN_PATH);
  });

  it("carries a safe return path and a notice", () => {
    expect(signInPathFor("/admin/review", "expired")).toBe(
      "/admin/auth/sign-in?next=%2Fadmin%2Freview&notice=expired",
    );
  });
});
