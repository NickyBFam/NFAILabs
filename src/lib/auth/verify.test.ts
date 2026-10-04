import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { classifyAuthError, verifyUser } from "@/lib/auth/verify";

const USER = "00000000-0000-4000-8000-00000000a001";

function clientReturning(result: unknown): SupabaseClient {
  return {
    auth: {
      getUser: async () => {
        if (result instanceof Error && !("data" in result)) throw result;
        return result;
      },
    },
  } as unknown as SupabaseClient;
}

describe("classifyAuthError", () => {
  it("treats a missing session as signed out", () => {
    expect(classifyAuthError(new AuthSessionMissingError())).toEqual({ status: "signed_out" });
  });

  it.each([400, 401, 403, 404, 422])("treats Auth API %i as an invalid session", (status) => {
    expect(classifyAuthError(new AuthApiError("bad jwt", status, "bad_jwt"))).toEqual({
      status: "signed_out",
    });
  });

  it("treats outages as errors, not as signed out", () => {
    expect(classifyAuthError(new AuthRetryableFetchError("down", 0))).toEqual({ status: "error" });
    expect(classifyAuthError(new AuthApiError("boom", 503, "unexpected_failure"))).toEqual({
      status: "error",
    });
    expect(classifyAuthError(new Error("unknown"))).toEqual({ status: "error" });
  });
});

describe("verifyUser", () => {
  it("returns the user verified by the Auth server", async () => {
    const client = clientReturning({ data: { user: { id: USER } }, error: null });
    expect(await verifyUser(client)).toEqual({ status: "signed_in", userId: USER });
  });

  it("returns signed out for a rejected token", async () => {
    const client = clientReturning({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 401, "bad_jwt"),
    });
    expect(await verifyUser(client)).toEqual({ status: "signed_out" });
  });

  it("returns an error when the client throws", async () => {
    expect(await verifyUser(clientReturning(new Error("network")))).toEqual({ status: "error" });
  });
});
