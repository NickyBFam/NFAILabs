/**
 * TEST-ONLY PublicClient backed by the in-process PGlite database from
 * src/test/db/harness.ts.
 *
 * Translates the small PostgREST filter subset the repositories use (eq, in,
 * is, lte, order) into SQL and runs it with `asRole`, i.e. as a Supabase API
 * role under the real grants and Row Level Security of the migrations. Rows are
 * returned through `to_jsonb`, the same JSON encoding PostgREST uses
 * (timestamps as ISO strings, numeric as JSON numbers).
 */
import type { PGlite } from "@electric-sql/pglite";
import type { PublicClient } from "@/lib/data/clients/types";
import type { DatabaseErrorLike } from "@/lib/data/errors";
import { type ApiRole, asRole } from "@/test/db/harness";

type Row = Record<string, unknown>;
type Response = { data: Row[] | null; error: DatabaseErrorLike | null };

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`unsafe identifier ${name}`);
  return `"${name}"`;
}

class PgliteQuery implements PromiseLike<Response> {
  private conditions: string[] = [];
  private params: unknown[] = [];
  private orderBy: string[] = [];

  constructor(
    private readonly db: PGlite,
    private readonly role: ApiRole,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  private add(column: string, operator: string, value: unknown): this {
    this.params.push(value);
    this.conditions.push(`t.${identifier(column)} ${operator} $${this.params.length}`);
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.add(column, "=", value);
  }

  lte(column: string, value: unknown): this {
    return this.add(column, "<=", value);
  }

  in(column: string, values: readonly unknown[]): this {
    this.params.push([...values]);
    this.conditions.push(`t.${identifier(column)}::text = any($${this.params.length}::text[])`);
    return this;
  }

  is(column: string, value: null): this {
    if (value !== null) throw new Error("only IS NULL is supported");
    this.conditions.push(`t.${identifier(column)} is null`);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orderBy.push(`t.${identifier(column)} ${options.ascending === false ? "desc" : "asc"}`);
    return this;
  }

  private async execute(): Promise<Response> {
    const where = this.conditions.length ? ` where ${this.conditions.join(" and ")}` : "";
    const order = this.orderBy.length ? ` order by ${this.orderBy.join(", ")}` : "";
    const sql = `select to_jsonb(t) as row from public.${identifier(this.table)} t${where}${order}`;
    try {
      const result = await asRole(this.db, this.role, (tx) =>
        tx.query<{ row: Row }>(sql, this.params),
      );
      return { data: result.rows.map((r) => r.row), error: null };
    } catch (error) {
      const pgError = error as { message?: string; code?: string };
      return {
        data: null,
        error: { message: pgError.message ?? String(error), code: pgError.code },
      };
    }
  }

  then<TResult1 = Response, TResult2 = never>(
    onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createPgliteClient(db: PGlite, role: ApiRole = "anon"): PublicClient {
  const client = {
    from: (table: string) => new PgliteQuery(db, role, table),
  };
  return client as unknown as PublicClient;
}
