import type { AdminErrorCode, AdminFailure, FieldErrors } from "@/lib/admin/mutations/result";

/**
 * Error handling for admin mutations and queries.
 *
 * Every failure leaves the server as an `AdminFailure` whose `message` comes
 * from the fixed table below. Raw PostgreSQL/PostgREST text, constraint
 * details, SQL, table names, environment values and stack traces never reach
 * the caller; they stay on the error's `cause` for server logs only.
 */

const PUBLIC_MESSAGES: Record<AdminErrorCode, string> = {
  unauthenticated: "Please sign in to continue.",
  forbidden: "You do not have permission to do this.",
  account_disabled: "This admin account is disabled.",
  invalid_input: "Some fields are missing or invalid.",
  not_found: "The record was not found.",
  invalid_state: "This action is not available for the record in its current state.",
  provenance_required:
    "This record needs an approved primary, corroborating or verification source (tier T1 to T3) first.",
  separation_of_duties: "A different admin must review a record you proposed or edited.",
  conflict: "The change conflicts with an existing record or a concurrent change.",
  internal: "Something went wrong. Please try again later.",
};

export function publicMessage(code: AdminErrorCode): string {
  return PUBLIC_MESSAGES[code];
}

/** Thrown inside the pipeline for expected failures; converted to a result at the edge. */
export class AdminActionError extends Error {
  override readonly name = "AdminActionError";
  readonly code: AdminErrorCode;
  readonly fieldErrors: FieldErrors | undefined;

  constructor(
    code: AdminErrorCode,
    internalMessage?: string,
    options?: { cause?: unknown; fieldErrors?: FieldErrors },
  ) {
    super(internalMessage ?? code, { cause: options?.cause });
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
  }
}

export function failure(code: AdminErrorCode, fieldErrors?: FieldErrors): AdminFailure {
  return fieldErrors && Object.keys(fieldErrors).length > 0
    ? { ok: false, code, message: PUBLIC_MESSAGES[code], fieldErrors }
    : { ok: false, code, message: PUBLIC_MESSAGES[code] };
}

/** The parts of a PostgreSQL / PostgREST error we read. Everything else is ignored. */
type DatabaseErrorShape = {
  code?: unknown;
  message?: unknown;
  constraint?: unknown;
  table?: unknown;
  column?: unknown;
};

function asDatabaseError(error: unknown): DatabaseErrorShape | null {
  if (typeof error !== "object" || error === null) return null;
  return error as DatabaseErrorShape;
}

/**
 * SQLSTATEs raised by the Phase 3 workflow functions (class `NFA`) and the
 * standard PostgreSQL codes the Phase 2 guards raise, mapped by meaning.
 */
const SQLSTATE_CODES: Readonly<Record<string, AdminErrorCode>> = {
  // Not an admin, disabled admin, missing permission, separation of duties,
  // workflow precondition (wrong state, not submitted, direct state change).
  NFA01: "forbidden",
  NFA02: "account_disabled",
  NFA03: "forbidden",
  NFA04: "separation_of_duties",
  NFA05: "invalid_state",
  // insufficient_privilege: grants or RLS refused the operation.
  "42501": "forbidden",
  // no_data_found: nfai_transition on a missing row.
  P0002: "not_found",
  // unique_violation, exclusion_violation, serialization/deadlock.
  "23505": "conflict",
  "23P01": "conflict",
  "40001": "conflict",
  "40P01": "conflict",
  // foreign_key_violation: a referenced record does not exist.
  "23503": "invalid_input",
  // not_null_violation, invalid_text_representation, datetime/numeric format errors.
  "23502": "invalid_input",
  "22P02": "invalid_input",
  "22007": "invalid_input",
  "22008": "invalid_input",
  "22003": "invalid_input",
  "22023": "invalid_input",
  // restrict_violation: delete or change blocked by history rules.
  "23001": "invalid_state",
};

const PROVENANCE_GATE_TEXT = /needs an active supporting provenance link/;
const STATE_TEXT =
  /cannot move from|content is frozen|cannot be deleted|only a published row|must be published first|becomes superseded only/;

/**
 * Maps a check_violation to a field when the constraint is named after a column
 * the caller was allowed to send (`<table>_<column>_check`). Only names from the
 * caller's own allowlist are ever returned, so no schema detail leaks.
 */
function fieldFromConstraint(
  constraint: unknown,
  table: string | undefined,
  fields: readonly string[],
) {
  if (typeof constraint !== "string" || !table) return undefined;
  const bare = table.replace(/^public\./, "");
  const prefix = `${bare}_`;
  if (!constraint.startsWith(prefix) || !constraint.endsWith("_check")) return undefined;
  const middle = constraint.slice(prefix.length, -"_check".length);
  return fields.find((field) => field === middle);
}

export type SanitizeContext = {
  /** The fact table the operation targeted, e.g. "public.providers". */
  table?: string;
  /** Field names the caller was allowed to send (for field-level messages). */
  fields?: readonly string[];
};

/**
 * Converts anything thrown during an admin operation into a safe failure.
 * Unknown errors become `internal`; nothing from the error text is copied into
 * the result.
 */
export function sanitizeError(error: unknown, context: SanitizeContext = {}): AdminFailure {
  if (error instanceof AdminActionError) {
    return failure(error.code, error.fieldErrors);
  }
  const db = asDatabaseError(error);
  const sqlstate = typeof db?.code === "string" ? db.code : undefined;
  const text = typeof db?.message === "string" ? db.message : "";

  if (sqlstate === "23514") {
    // check_violation: provenance gate, lifecycle rule, or a column check.
    if (PROVENANCE_GATE_TEXT.test(text)) return failure("provenance_required");
    if (STATE_TEXT.test(text)) return failure("invalid_state");
    // PostgREST returns only code/message/details/hint, so the constraint name is
    // read from the message; it is only ever used to pick a caller-allowed field.
    const constraint = db?.constraint ?? /check constraint "([a-z0-9_]+)"/.exec(text)?.[1];
    const field = fieldFromConstraint(constraint, context.table, context.fields ?? []);
    return field
      ? failure("invalid_input", { [field]: "Invalid value." })
      : failure("invalid_input");
  }
  if (sqlstate && sqlstate in SQLSTATE_CODES) {
    return failure(SQLSTATE_CODES[sqlstate]!);
  }
  return failure("internal");
}
