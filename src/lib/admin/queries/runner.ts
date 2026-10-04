import { authorizeAdmin, type AuthorizedAdmin } from "@/lib/admin/mutations/authorization";
import type { AdminContext, AdminPermission } from "@/lib/admin/mutations/context";
import { AdminActionError, sanitizeError } from "@/lib/admin/mutations/errors";
import type { AdminResult } from "@/lib/admin/mutations/result";

/**
 * Shared path for admin reads: authenticate, resolve the identity, check the
 * read permission, then call SECURITY DEFINER read functions over the admin's
 * own JWT (which check the permission again in SQL). Failures are sanitized
 * exactly like mutations.
 */
export async function runAdminQuery<T>(
  ctx: AdminContext,
  name: string,
  permission: AdminPermission,
  read: (admin: AuthorizedAdmin) => Promise<T>,
): Promise<AdminResult<T>> {
  try {
    const admin = await authorizeAdmin(ctx, permission);
    return { ok: true, data: await read(admin) };
  } catch (error) {
    const failure = sanitizeError(error);
    if (failure.code === "internal" || !(error instanceof AdminActionError)) {
      ctx.report?.(error, name);
    }
    return failure;
  }
}

/** Reads rows from a set-returning read function. A non-array answer is a server fault. */
export async function readRows(
  admin: AuthorizedAdmin,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const { data, error } = await admin.db.rpc(fn, args);
  if (error) throw error;
  if (data === null) return [];
  if (!Array.isArray(data)) throw new AdminActionError("internal", `${fn} returned no rows array`);
  return data.filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
  );
}

/** Reads one value (jsonb or a single composite row). */
export async function readOne(
  admin: AuthorizedAdmin,
  fn: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin.db.rpc(fn, args);
  if (error) throw error;
  const value: unknown = Array.isArray(data) ? data[0] : data;
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// Tolerant field readers for rows returned by the read functions.

export const str = (row: Record<string, unknown>, key: string): string | null =>
  typeof row[key] === "string" ? (row[key] as string) : null;

export const num = (row: Record<string, unknown>, key: string): number | null => {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

export const bool = (row: Record<string, unknown>, key: string): boolean => row[key] === true;

export const strings = (row: Record<string, unknown>, key: string): string[] =>
  Array.isArray(row[key])
    ? (row[key] as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
