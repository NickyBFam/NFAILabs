import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDatabase } from "./harness";

// Checks the harness itself, independent of the Phase 2 schema, using a scratch schema.
describe("database test harness", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
    await db.exec(`
      create schema scratch;
      grant usage on schema scratch to anon, service_role;
      create table scratch.items (id int primary key, visible boolean not null);
      grant select, insert on scratch.items to anon, service_role;
      alter table scratch.items enable row level security;
      create policy items_read on scratch.items for select to anon using (visible);
      insert into scratch.items values (1, true), (2, false);
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it("runs queries as the requested API role with JWT claims", async () => {
    const who = await asRole(
      db,
      "authenticated",
      (tx) =>
        tx.query<{ role: string; uid: string | null; api_role: string | null }>(
          "select current_user as role, auth.uid()::text as uid, auth.role() as api_role",
        ),
      { sub: "00000000-0000-4000-8000-000000000001" },
    );
    expect(who.rows[0]).toEqual({
      role: "authenticated",
      uid: "00000000-0000-4000-8000-000000000001",
      api_role: "authenticated",
    });
  });

  it("applies RLS to API roles", async () => {
    const rows = await asRole(db, "anon", (tx) =>
      tx.query<{ id: number }>("select id from scratch.items order by id"),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([1]);
  });

  it("surfaces permission errors and leaves no state behind", async () => {
    await expect(
      asRole(db, "anon", (tx) => tx.query("insert into scratch.items values (3, true)")),
    ).rejects.toThrow(/row-level security/);

    await asRole(db, "service_role", (tx) =>
      tx.query("insert into scratch.items values (4, true)"),
    );
    const after = await db.query<{ n: number }>("select count(*)::int as n from scratch.items");
    expect(after.rows[0]?.n).toBe(2);
    expect((await db.query<{ u: string }>("select current_user as u")).rows[0]?.u).toBe("postgres");
  });
});
