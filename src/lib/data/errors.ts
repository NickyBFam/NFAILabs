/**
 * Predictable error behavior for the data-access layer.
 *
 * - Database and configuration failures are never swallowed: they surface as a
 *   DataAccessError that keeps the original error as `cause` for server logs.
 * - `publicMessage` is the only text safe to show in public UI. It never
 *   contains raw PostgreSQL/PostgREST messages, table names, keys, or URLs.
 */

export type DataAccessErrorCode =
  /** Required environment configuration is missing or malformed. */
  | "configuration"
  /** The database or API rejected or failed the request. */
  | "query_failed"
  /** A returned row violated an invariant the data layer relies on. */
  | "invalid_data";

const PUBLIC_MESSAGES: Record<DataAccessErrorCode, string> = {
  configuration: "Data is temporarily unavailable.",
  query_failed: "Data could not be loaded. Please try again later.",
  invalid_data: "Data could not be loaded. Please try again later.",
};

export class DataAccessError extends Error {
  override readonly name = "DataAccessError";
  readonly code: DataAccessErrorCode;

  constructor(code: DataAccessErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }

  /** Safe, generic text for public UI. Detailed context stays in `message`/`cause`. */
  get publicMessage(): string {
    return PUBLIC_MESSAGES[this.code];
  }
}

export function isDataAccessError(error: unknown): error is DataAccessError {
  return error instanceof DataAccessError;
}

/** Shape of the error object returned by Supabase/PostgREST responses. */
export type DatabaseErrorLike = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

/**
 * Wraps a database error with the operation that failed. The internal message
 * names the operation and PostgreSQL error code only; the raw error is kept as
 * `cause` so it reaches server logs but not `publicMessage`.
 */
export function queryFailed(operation: string, error: DatabaseErrorLike): DataAccessError {
  const code = error.code ? ` (${error.code})` : "";
  return new DataAccessError("query_failed", `${operation} failed${code}`, { cause: error });
}

export function invalidData(operation: string, detail: string): DataAccessError {
  return new DataAccessError("invalid_data", `${operation}: ${detail}`);
}
