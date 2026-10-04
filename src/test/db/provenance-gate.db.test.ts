/**
 * The normal publication provenance gate (D-028): a fact can be validated or published only
 * with an active supporting link to an approved T1-T3 source. T4-only evidence never
 * satisfies it, T5 never does, and T4 may still be recorded as corroborating or context
 * evidence next to a qualifying source.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOwner, createTestDatabase } from "./harness";

type Tier = "T1" | "T2" | "T3" | "T4" | "T5";

/** One approved synthetic source and document per tier, created once as the database owner. */
async function createTierDocuments(db: PGlite): Promise<Record<Tier, string>> {
  const documents = {} as Record<Tier, string>;
  for (const tier of ["T1", "T2", "T3", "T4", "T5"] as const) {
    const slug = `gate-source-${tier.toLowerCase()}`;
    const { rows } = await db.query<{ id: string }>(
      `with s as (
         insert into public.sources (slug, name, publisher_name, tier, source_kind, registry_status)
         values ($1, $2, 'Example Publisher', $3, 'other', 'approved') returning id
       )
       insert into public.source_documents (source_id, title, document_kind, original_url)
       select s.id, $2, 'web_page', $4 from s returning id`,
      [slug, `Synthetic ${tier} source`, tier, `https://${slug}.example.test/doc`],
    );
    documents[tier] = rows[0]!.id;
  }
  return documents;
}

describe("publication provenance gate", () => {
  let db: PGlite;
  let docs: Record<Tier, string>;

  beforeAll(async () => {
    db = await createTestDatabase();
    docs = await createTierDocuments(db);
  });

  afterAll(async () => {
    await db.close();
  });

  /**
   * As the database owner: create a draft provider, attach links, try to validate and publish.
   * (Since Phase 3 only the admin workflow functions and the owner may move rows past draft;
   * the gate applies to both. The admin path is tested in the Phase 3 admin tests.)
   */
  function publishWith(links: { tier: Tier; role: string; lowConfidence?: boolean }[]) {
    return asOwner(db, async (tx: Transaction) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into public.providers (slug, name) values ('gate-provider', 'Gate Test Provider') returning id`,
      );
      const id = rows[0]!.id;
      for (const link of links) {
        await tx.query(
          `insert into public.provenance_links
             (subject_table, subject_id, source_document_id, role, confidence, confidence_reason)
           values ('public.providers', $1, $2, $3, $4, $5)`,
          [
            id,
            docs[link.tier],
            link.role,
            link.lowConfidence ? "low" : "high",
            link.lowConfidence ? "Only secondary reporting available (synthetic)." : null,
          ],
        );
      }
      await tx.query("select public.nfai_transition('public.providers', $1, 'validated')", [id]);
      await tx.query("select public.nfai_transition('public.providers', $1, 'published')", [id]);
      await tx.exec("set constraints all immediate");
      const state = await tx.query<{ publication_state: string }>(
        "select publication_state from public.providers where id = $1",
        [id],
      );
      const kept = await tx.query<{ tier_at_citation: string; role: string }>(
        `select tier_at_citation, role from public.provenance_links
          where subject_table = 'public.providers' and subject_id = $1 order by tier_at_citation`,
        [id],
      );
      return { state: state.rows[0]?.publication_state, links: kept.rows };
    });
  }

  it.each(["T1", "T2", "T3"] as const)(
    "permits normal publication with %s support",
    async (tier) => {
      const result = await publishWith([{ tier, role: "primary" }]);
      expect(result.state).toBe("published");
    },
  );

  it("does not let T4-only evidence satisfy the gate", async () => {
    await expect(publishWith([{ tier: "T4", role: "primary" }])).rejects.toThrow(/T1-T3/);
    // Labelling T4 evidence low-confidence is not an override (the pre-D-028 rule allowed it).
    await expect(
      publishWith([{ tier: "T4", role: "primary", lowConfidence: true }]),
    ).rejects.toThrow(/T1-T3/);
    await expect(
      publishWith([
        { tier: "T4", role: "primary" },
        { tier: "T4", role: "corroborating" },
        { tier: "T4", role: "verification" },
      ]),
    ).rejects.toThrow(/T1-T3/);
  });

  it("never lets T5 satisfy the gate", async () => {
    await expect(publishWith([{ tier: "T5", role: "primary" }])).rejects.toThrow(
      /T5 source cannot be a primary link/,
    );
    await expect(publishWith([{ tier: "T5", role: "discovery" }])).rejects.toThrow(/T1-T3/);
  });

  it("keeps T4 (and T5) evidence alongside a qualifying source", async () => {
    const result = await publishWith([
      { tier: "T1", role: "primary" },
      { tier: "T4", role: "corroborating" },
      { tier: "T4", role: "contradicting" },
      { tier: "T5", role: "discovery" },
    ]);
    expect(result.state).toBe("published");
    expect(result.links).toEqual([
      { tier_at_citation: "T1", role: "primary" },
      { tier_at_citation: "T4", role: "corroborating" },
      { tier_at_citation: "T4", role: "contradicting" },
      { tier_at_citation: "T5", role: "discovery" },
    ]);
  });

  it("stops a published fact from losing its last T1-T3 support", async () => {
    await expect(
      asOwner(db, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `insert into public.providers (slug, name) values ('gate-provider', 'Gate Test Provider') returning id`,
        );
        const id = rows[0]!.id;
        await tx.query(
          `insert into public.provenance_links (subject_table, subject_id, source_document_id, role)
           values ('public.providers', $1, $2, 'primary'), ('public.providers', $1, $3, 'corroborating')`,
          [id, docs.T1, docs.T4],
        );
        await tx.query("select public.nfai_transition('public.providers', $1, 'validated')", [id]);
        await tx.query("select public.nfai_transition('public.providers', $1, 'published')", [id]);
        await tx.query(
          `update public.provenance_links set revoked_at = now(), revoked_reason = 'Synthetic revocation'
            where subject_id = $1 and tier_at_citation = 'T1'`,
          [id],
        );
        await tx.exec("set constraints all immediate");
      }),
    ).rejects.toThrow(/T1-T3/);
  });

  it("records the gate in the tier vocabulary", async () => {
    const tiers = await db.query<{
      code: string;
      may_be_supporting_link: boolean;
      satisfies_publication_gate: boolean;
    }>(
      "select code, may_be_supporting_link, satisfies_publication_gate from public.source_tiers order by code",
    );
    expect(tiers.rows).toEqual([
      { code: "T1", may_be_supporting_link: true, satisfies_publication_gate: true },
      { code: "T2", may_be_supporting_link: true, satisfies_publication_gate: true },
      { code: "T3", may_be_supporting_link: true, satisfies_publication_gate: true },
      { code: "T4", may_be_supporting_link: true, satisfies_publication_gate: false },
      { code: "T5", may_be_supporting_link: false, satisfies_publication_gate: false },
    ]);
  });
});
