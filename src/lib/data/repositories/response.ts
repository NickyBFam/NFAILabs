import { type DatabaseErrorLike, invalidData, queryFailed } from "@/lib/data/errors";

type ListResponse<Row> = { data: Row[] | null; error: DatabaseErrorLike | null };

/**
 * Unwraps a PostgREST list response. Errors are never swallowed: they become a
 * DataAccessError whose public message is generic and whose cause keeps the
 * raw error for server logs.
 */
export async function rowsOf<Row>(
  operation: string,
  query: PromiseLike<ListResponse<Row>>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw queryFailed(operation, error);
  return data ?? [];
}

/** Like `rowsOf`, for lookups by a unique key: zero rows is null, never an error. */
export async function singleRowOf<Row>(
  operation: string,
  query: PromiseLike<ListResponse<Row>>,
): Promise<Row | null> {
  const rows = await rowsOf(operation, query);
  if (rows.length > 1) {
    throw invalidData(operation, "unique lookup returned several rows");
  }
  return rows[0] ?? null;
}
