/**
 * Results returned by every admin mutation.
 *
 * Expected failures (not signed in, not allowed, bad input, a rule the database
 * refused) are returned, never thrown, so Server Actions can pass them straight
 * to the UI. `message` is always safe to show: it never contains database text,
 * table internals, keys or stack traces (see `errors.ts`).
 */

export type AdminErrorCode =
  /** No verified session. */
  | "unauthenticated"
  /** Signed in, but not an admin, or the admin lacks the permission. */
  | "forbidden"
  /** The admin account exists but is disabled. */
  | "account_disabled"
  /** The input failed validation; see `fieldErrors`. */
  | "invalid_input"
  /** The record does not exist (or is not visible to admin tooling). */
  | "not_found"
  /** The action is not allowed from the record's current state. */
  | "invalid_state"
  /** Publishing or validating needs an approved T1-T3 source (D-028). */
  | "provenance_required"
  /** The same person may not both propose and approve a record. */
  | "separation_of_duties"
  /** A uniqueness or concurrent-change conflict. */
  | "conflict"
  /** Anything unexpected. Details stay in server logs. */
  | "internal";

export type FieldErrors = Readonly<Record<string, string>>;

export type AdminSuccess<T> = { ok: true; id?: string; data?: T };

export type AdminFailure = {
  ok: false;
  code: AdminErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
};

export type AdminResult<T = undefined> = AdminSuccess<T> | AdminFailure;
