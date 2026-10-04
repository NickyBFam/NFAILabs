/**
 * TEST-ONLY synthetic admin identities, roles and sources for database-backed
 * admin tests. Everything is created as the migration owner (the same path as
 * the owner's SQL bootstrap in docs/ADMIN.md §9) and is obviously fictional.
 */
import type { PGlite } from "@electric-sql/pglite";

export type SyntheticRole = "viewer" | "editor" | "reviewer" | "publisher" | "administrator";

let counter = 0;

/** Fixed-format, obviously synthetic UUIDs (never real user ids). */
export function syntheticUuid(prefix: string): string {
  counter += 1;
  const tail = counter.toString(16).padStart(12, "0");
  return `${prefix.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${tail}`;
}

export async function createSyntheticAdmin(
  db: PGlite,
  options: { name: string; roles: readonly SyntheticRole[]; status?: "active" | "disabled" },
): Promise<string> {
  const id = syntheticUuid("aaaaaaaa");
  await db.query(
    `insert into public.admin_identities (id, display_name, status, disabled_reason)
     values ($1, $2, $3, $4)`,
    [
      id,
      options.name,
      options.status ?? "active",
      options.status === "disabled" ? "Synthetic test: disabled" : null,
    ],
  );
  for (const role of options.roles) {
    await db.query(
      `insert into public.admin_role_assignments (admin_id, role_code, grant_reason)
       values ($1, $2, 'Synthetic test bootstrap')`,
      [id, role],
    );
  }
  return id;
}

/** An approved synthetic source of the given tier and one document; returns the document id. */
export async function createSyntheticSourceDocument(
  db: PGlite,
  tier: "T1" | "T4" = "T1",
): Promise<string> {
  const slug = `synthetic-source-${syntheticUuid("5").slice(-6).replace(/^0+/, "x")}`;
  const { rows } = await db.query<{ id: string }>(
    `with s as (
       insert into public.sources (slug, name, publisher_name, tier, source_kind, registry_status)
       values ($1, 'Synthetic Test Source', 'Example Publisher', $2, 'other', 'approved') returning id
     )
     insert into public.source_documents (source_id, title, document_kind, original_url)
     select s.id, 'Synthetic test document', 'web_page', $3 from s returning id`,
    [slug, tier, `https://${slug}.example.test/doc`],
  );
  return rows[0]!.id;
}
