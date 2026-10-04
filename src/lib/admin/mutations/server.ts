import "server-only";
import type { AdminContext, AdminRpcClient } from "@/lib/admin/mutations/context";
import * as access from "@/lib/admin/mutations/access";
import * as operations from "@/lib/admin/mutations/operations";
import type { AdminResult } from "@/lib/admin/mutations/result";
import { getAdminAccess, getAdminDatabaseClient } from "@/lib/auth/server";

/**
 * Production wiring for admin mutations and queries: the verified session and
 * identity from `@/lib/auth/server`, and a Supabase client carrying the
 * admin's own JWT (role `authenticated`). The service-role client is never used
 * on the admin path (docs/ADMIN.md §5).
 *
 * Server Actions call the bound functions below; they return sanitized
 * `AdminResult`s and never throw for expected failures.
 */
export function getAdminContext(): AdminContext {
  return {
    access: () => getAdminAccess(),
    async database(): Promise<AdminRpcClient | null> {
      const session = await getAdminDatabaseClient();
      if (!session) return null;
      const { client } = session;
      return { rpc: (fn, args) => client.rpc(fn, args) };
    },
    report(error, operation) {
      // Server logs only. The caller receives a fixed, generic message.
      console.error(`[admin] ${operation} failed`, error);
    },
  };
}

type Operation = (ctx: AdminContext, input: unknown) => Promise<AdminResult>;

const bind =
  (operation: Operation) =>
  (input: unknown): Promise<AdminResult> =>
    operation(getAdminContext(), input);

export const createDraft = bind(operations.createDraft);
export const updateDraft = bind(operations.updateDraft);
export const createSource = bind(operations.createSource);
export const createSourceDocument = bind(operations.createSourceDocument);
export const setSourceStatus = bind(operations.setSourceStatus);
export const attachSource = bind(operations.attachSource);
export const revokeSource = bind(operations.revokeSource);
export const submitForReview = bind(operations.submitForReview);
export const retractSubmission = bind(operations.retractSubmission);
export const validateRecord = bind(operations.validateRecord);
export const returnToDraft = bind(operations.returnToDraft);
export const publishRecord = bind(operations.publishRecord);
export const rejectRecord = bind(operations.rejectRecord);
export const supersedeRecord = bind(operations.supersedeRecord);
export const withdrawRecord = bind(operations.withdrawRecord);
export const closePeriod = bind(operations.closePeriod);
export const deleteDraft = bind(operations.deleteDraft);
export const createIdentity = bind(access.createIdentity);
export const setIdentityStatus = bind(access.setIdentityStatus);
export const setDisplayName = bind(access.setDisplayName);
export const grantRole = bind(access.grantRole);
export const revokeRole = bind(access.revokeRole);
