import type { DatabaseErrorLike } from "@/lib/data/errors";

/**
 * Ports the admin mutation and query layers depend on. Production wiring
 * (`server.ts`) connects them to Thread A's session helpers; tests connect
 * them to synthetic identities in PGlite. Nothing here reads cookies, headers
 * or environment variables itself.
 */

/** Permission codes (docs/ADMIN.md §4). The database is authoritative. */
export const ADMIN_PERMISSIONS = [
  "view_admin",
  "edit_draft",
  "submit_review",
  "validate_fact",
  "reject_fact",
  "publish_fact",
  "supersede_fact",
  "withdraw_fact",
  "view_audit",
  "manage_admins",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type AdminActor = { authUserId: string; displayName: string };

/** Mirrors `getAdminAccess()` from `@/lib/auth/server` (docs/ADMIN.md §3). */
export type AdminAccess =
  | { status: "allowed"; actor: AdminActor }
  | { status: "unauthenticated" }
  | { status: "identity_missing" }
  | { status: "identity_disabled" }
  | { status: "unavailable" };

export type RpcResponse = { data: unknown; error: DatabaseErrorLike | null };

/**
 * The only database surface admin code uses: `rpc` on a client that carries
 * the signed-in admin's own JWT (role `authenticated`). A Supabase client
 * satisfies it structurally. The actor is derived in SQL from `auth.uid()`;
 * this layer never sends an actor id, role or target state.
 */
export type AdminRpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
};

export type AdminContext = {
  /** Verifies the session with the auth server and resolves the admin identity. */
  access(): Promise<AdminAccess>;
  /** A client bound to the same verified session, or null when there is none. */
  database(): Promise<AdminRpcClient | null>;
  /** Server-side logging hook for unexpected failures. Never shown to users. */
  report?(error: unknown, operation: string): void;
};
