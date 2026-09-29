import { describe, expect, it } from "vitest";
import { readSupabasePublicConfig } from "@/lib/data/clients/config";
import { readSupabaseServiceConfig } from "@/lib/data/clients/service-config";
import { DataAccessError, queryFailed } from "@/lib/data/errors";

const SECRET = "synthetic-secret-value-for-tests";

describe("queryFailed", () => {
  const dbError = {
    message: 'permission denied for table audit_log at "db.internal.test"',
    code: "42501",
    details: "row data",
    hint: null,
  };

  it("keeps the raw database error as the cause for server logs", () => {
    const error = queryFailed("listPublishedProviders", dbError);
    expect(error).toBeInstanceOf(DataAccessError);
    expect(error.code).toBe("query_failed");
    expect(error.cause).toBe(dbError);
    expect(error.message).toBe("listPublishedProviders failed (42501)");
  });

  it("exposes only a generic public message", () => {
    const error = queryFailed("listPublishedProviders", dbError);
    expect(error.publicMessage).not.toMatch(/audit_log|permission|42501|internal/);
  });
});

describe("Supabase configuration", () => {
  it("reads the public URL and anon key", () => {
    expect(
      readSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      }),
    ).toEqual({ url: "http://127.0.0.1:54321", anonKey: "anon" });
  });

  it("fails with a configuration error when values are missing or malformed", () => {
    expect(() => readSupabasePublicConfig({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/);
    expect(() =>
      readSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "javascript:alert(1)",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      }),
    ).toThrow(/must be an http\(s\) URL/);
    expect(() =>
      readSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY is not set/);
  });

  it("never echoes configured values into error messages", () => {
    try {
      readSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: SECRET });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(SECRET);
    }
  });

  it("requires the service-role key only for the service configuration", () => {
    expect(() =>
      readSupabaseServiceConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY is not set/);
    expect(
      readSupabaseServiceConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
      }).serviceRoleKey,
    ).toBe(SECRET);
  });
});
