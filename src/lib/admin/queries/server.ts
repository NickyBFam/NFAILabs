import "server-only";
import { getAdminContext } from "@/lib/admin/mutations/server";
import * as access from "@/lib/admin/queries/access";
import * as reads from "@/lib/admin/queries/reads";

/**
 * Admin reads bound to the current request's verified session and the admin's
 * own JWT (no service-role client). Each returns a sanitized `AdminResult`.
 */

export const listReviewQueue = (options?: { limit?: number }) =>
  reads.listReviewQueue(getAdminContext(), options);

export const listRecords = (input: Parameters<typeof reads.listRecords>[1]) =>
  reads.listRecords(getAdminContext(), input);

export const listReferenceOptions = (input: Parameters<typeof reads.listReferenceOptions>[1]) =>
  reads.listReferenceOptions(getAdminContext(), input);

export const getRecord = (input: Parameters<typeof reads.getRecord>[1]) =>
  reads.getRecord(getAdminContext(), input);

export const listAuditEntries = (filters?: reads.AuditFilters) =>
  reads.listAuditEntries(getAdminContext(), filters);

export const listAdmins = () => access.listAdmins(getAdminContext());

export const listRoleHistory = (input?: { adminId?: unknown; limit?: number }) =>
  access.listRoleHistory(getAdminContext(), input);
