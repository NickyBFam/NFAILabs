import { describe, expect, it } from "vitest";
import { resolveAdminAccess, type AuthGateway, type IdentityLookup } from "@/lib/auth/access";

// Synthetic ids only.
const USER = "00000000-0000-4000-8000-00000000a001";
const OTHER = "00000000-0000-4000-8000-00000000a002";

function gateway(overrides: Partial<AuthGateway> = {}): AuthGateway & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    verifyUser: async () => ({ status: "signed_in", userId: USER }),
    lookupIdentity: async (userId): Promise<IdentityLookup> => {
      lookups.push(userId);
      return { status: "ok", row: { id: userId, display_name: "Test Admin A", status: "active" } };
    },
    ...overrides,
  };
}

describe("resolveAdminAccess", () => {
  it("denies a request with no session without looking up any identity", async () => {
    const g = gateway({ verifyUser: async () => ({ status: "signed_out" }) });
    expect(await resolveAdminAccess(g)).toEqual({ status: "unauthenticated" });
    expect(g.lookups).toEqual([]);
  });

  it("allows a valid session with an active identity, using the verified user id", async () => {
    const g = gateway();
    expect(await resolveAdminAccess(g)).toEqual({
      status: "allowed",
      actor: { authUserId: USER, displayName: "Test Admin A" },
    });
    expect(g.lookups).toEqual([USER]);
  });

  it("denies a signed-in user with no admin identity", async () => {
    const g = gateway({ lookupIdentity: async () => ({ status: "ok", row: null }) });
    expect(await resolveAdminAccess(g)).toEqual({ status: "identity_missing" });
  });

  it("denies a disabled identity", async () => {
    const g = gateway({
      lookupIdentity: async () => ({
        status: "ok",
        row: { id: USER, display_name: "Test Admin A", status: "disabled" },
      }),
    });
    expect(await resolveAdminAccess(g)).toEqual({ status: "identity_disabled" });
  });

  it("never accepts an identity row for a different user", async () => {
    const g = gateway({
      lookupIdentity: async () => ({
        status: "ok",
        row: { id: OTHER, display_name: "Test Admin B", status: "active" },
      }),
    });
    expect(await resolveAdminAccess(g)).toEqual({ status: "identity_missing" });
  });

  it("treats a malformed user id as signed out", async () => {
    const g = gateway({ verifyUser: async () => ({ status: "signed_in", userId: "admin" }) });
    expect(await resolveAdminAccess(g)).toEqual({ status: "unauthenticated" });
    expect(g.lookups).toEqual([]);
  });

  it("fails closed when Auth or the database is unavailable", async () => {
    expect(
      await resolveAdminAccess(gateway({ verifyUser: async () => ({ status: "error" }) })),
    ).toEqual({ status: "unavailable" });
    expect(
      await resolveAdminAccess(
        gateway({
          verifyUser: async () => {
            throw new Error("network");
          },
        }),
      ),
    ).toEqual({ status: "unavailable" });
    expect(
      await resolveAdminAccess(gateway({ lookupIdentity: async () => ({ status: "error" }) })),
    ).toEqual({ status: "unavailable" });
    expect(
      await resolveAdminAccess(
        gateway({
          lookupIdentity: async () => {
            throw new Error("network");
          },
        }),
      ),
    ).toEqual({ status: "unavailable" });
  });
});
