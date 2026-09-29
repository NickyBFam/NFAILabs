/**
 * TEST-ONLY in-memory stand-in for the Supabase query builder.
 *
 * Implements just the PostgREST filters the repositories use (eq, in, is, lte,
 * order) over synthetic rows, and records every call so tests can assert that
 * public queries always filter by publication state. It does NOT emulate Row
 * Level Security: it returns whatever rows it is given, which is exactly what
 * lets tests prove the TypeScript layer refuses leaked drafts on its own.
 */
import type { PublicClient } from "@/lib/data/clients/types";
import type { DatabaseErrorLike } from "@/lib/data/errors";

type Row = Record<string, unknown>;
export type FakeTables = Record<string, readonly Row[]>;

export type RecordedQuery = {
  table: string;
  filters: Array<[op: string, column: string, value: unknown]>;
};

function compare(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && /\d{4}-\d{2}-\d{2}/.test(a)) return ta - tb;
    return a.localeCompare(b);
  }
  return Number(a) - Number(b);
}

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: DatabaseErrorLike | null }> {
  private predicates: Array<(row: Row) => boolean> = [];
  private sorts: Array<{ column: string; ascending: boolean }> = [];

  constructor(
    private readonly rows: readonly Row[],
    private readonly recorded: RecordedQuery,
    private readonly error: DatabaseErrorLike | null,
    private readonly ignoreFilters: boolean,
  ) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.recorded.filters.push(["eq", column, value]);
    this.predicates.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.recorded.filters.push(["in", column, values]);
    this.predicates.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: null): this {
    this.recorded.filters.push(["is", column, value]);
    this.predicates.push((row) => row[column] === value);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.recorded.filters.push(["lte", column, value]);
    this.predicates.push((row) => compare(row[column], value) <= 0);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.sorts.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: Row[] | null;
          error: DatabaseErrorLike | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let value: { data: Row[] | null; error: DatabaseErrorLike | null };
    if (this.error) {
      value = { data: null, error: this.error };
    } else {
      const data = this.ignoreFilters
        ? [...this.rows]
        : this.rows.filter((row) => this.predicates.every((predicate) => predicate(row)));
      for (const { column, ascending } of [...this.sorts].reverse()) {
        data.sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1));
      }
      value = { data: data.map((row) => structuredClone(row)), error: null };
    }
    return Promise.resolve(value).then(onfulfilled, onrejected);
  }
}

export type FakeClient = {
  client: PublicClient;
  queries: RecordedQuery[];
};

export type FakeClientOptions = {
  /** Tables whose queries fail with the given database error. */
  errors?: Record<string, DatabaseErrorLike>;
  /**
   * Return every row regardless of filters, simulating a missing RLS policy or
   * a query bug, to prove the TypeScript layer still refuses non-public rows.
   */
  ignoreFilters?: boolean;
};

export function createFakeClient(tables: FakeTables, options: FakeClientOptions = {}): FakeClient {
  const { errors = {}, ignoreFilters = false } = options;
  const queries: RecordedQuery[] = [];
  const client = {
    from(table: string) {
      const recorded: RecordedQuery = { table, filters: [] };
      queries.push(recorded);
      return new FakeQuery(tables[table] ?? [], recorded, errors[table] ?? null, ignoreFilters);
    },
  };
  return { client: client as unknown as PublicClient, queries };
}
