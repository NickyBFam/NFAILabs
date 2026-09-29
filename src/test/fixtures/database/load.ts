/**
 * TEST-ONLY loader: writes the SYNTHETIC fixtures in ./synthetic.ts into a test
 * database created by src/test/db/harness.ts.
 *
 * It goes through the real publication workflow of migrations 0001–0004 rather
 * than inserting final states directly: rows are created as drafts, given a
 * provenance link to an approved synthetic source, then moved
 * draft → validated → published with nfai_transition(); corrections use
 * nfai_supersede() and withdrawals nfai_withdraw(). If the schema's rules
 * change, loading fails loudly instead of the fixtures drifting silently.
 *
 * Never point this at a real Supabase project.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";
import {
  benchmarkMetrics,
  benchmarkResults,
  benchmarks,
  benchmarkVersions,
  deploymentChannels,
  evaluationConfigurations,
  modelFamilies,
  modelVersions,
  pricingRecords,
  providers,
  provenanceLinkDetails,
  supersededBy,
  synthId,
} from "@/test/fixtures/database/synthetic";

type Row = { id: string; publication_state: string } & Record<string, unknown>;

/** Tables loaded in dependency order (parents before children). */
export const FIXTURE_TABLES: ReadonlyArray<[table: string, rows: readonly Row[]]> = [
  ["providers", providers],
  ["deployment_channels", deploymentChannels],
  ["model_families", modelFamilies],
  ["model_versions", modelVersions],
  ["benchmarks", benchmarks],
  ["benchmark_versions", benchmarkVersions],
  ["benchmark_metrics", benchmarkMetrics],
  ["evaluation_configurations", evaluationConfigurations],
  ["benchmark_results", benchmarkResults],
  ["pricing_records", pricingRecords],
];

/** Registered with requires_provenance = false in 0003. */
const NO_PROVENANCE = new Set(["evaluation_configurations"]);

const SOURCE_ID = synthId(14, 1);
const GENERIC_DOCUMENT_ID = synthId(12, 100);
const GENERIC_OBSERVATION_ID = synthId(13, 100);

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

function toParam(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

async function insert(tx: Transaction, table: string, values: Record<string, unknown>) {
  const columns = Object.keys(values);
  const sql = `insert into public.${quote(table)} (${columns.map(quote).join(", ")}) values (${columns
    .map((_, index) => `$${index + 1}`)
    .join(", ")})`;
  await tx.query(
    sql,
    columns.map((column) => toParam(values[column])),
  );
}

async function transition(tx: Transaction, table: string, id: string, state: string) {
  await tx.query("select public.nfai_transition($1, $2::uuid, $3, $4)", [
    `public.${table}`,
    id,
    state,
    "Synthetic fixture workflow.",
  ]);
}

async function loadSources(tx: Transaction) {
  await insert(tx, "sources", {
    id: SOURCE_ID,
    slug: "synthetic-test-source",
    name: "Synthetic Test Source",
    publisher_name: "Synthetic Benchmark Org",
    tier: "T2",
    source_kind: "benchmark_organization",
    homepage_url: "https://source.example.test",
    registry_status: "approved",
  });

  const documents = [
    ...provenanceLinkDetails,
    {
      source_document_id: GENERIC_DOCUMENT_ID,
      document_title: "Synthetic Catalog Page",
      document_kind: "web_page",
      original_url: "https://source.example.test/catalog",
      current_url: null,
      published_on: "2026-01-01",
      source_observation_id: GENERIC_OBSERVATION_ID,
      retrieved_at: "2026-01-02T00:00:00.000Z",
      retrieved_url: "https://source.example.test/catalog",
      content_sha256: "0".repeat(64),
    },
  ];
  for (const document of documents) {
    await insert(tx, "source_documents", {
      id: document.source_document_id,
      source_id: SOURCE_ID,
      title: document.document_title,
      document_kind: document.document_kind,
      original_url: document.original_url,
      published_on: document.published_on,
    });
    if (document.source_observation_id) {
      await insert(tx, "source_observations", {
        id: document.source_observation_id,
        source_document_id: document.source_document_id,
        retrieved_at: document.retrieved_at,
        retrieved_url: document.retrieved_url,
        content_sha256: document.content_sha256,
      });
    }
    if (document.current_url) {
      await insert(tx, "source_document_locations", {
        source_document_id: document.source_document_id,
        url: document.current_url,
        relation: "canonical",
      });
    }
  }
}

async function linkProvenance(tx: Transaction, table: string, id: string) {
  const specific = provenanceLinkDetails.filter((link) => link.subject_id === id);
  if (specific.length === 0) {
    await insert(tx, "provenance_links", {
      subject_table: `public.${table}`,
      subject_id: id,
      source_document_id: GENERIC_DOCUMENT_ID,
      source_observation_id: GENERIC_OBSERVATION_ID,
      role: "primary",
    });
    return;
  }
  for (const link of specific) {
    await insert(tx, "provenance_links", {
      id: link.provenance_link_id,
      subject_table: link.subject_table,
      subject_id: id,
      source_document_id: link.source_document_id,
      source_observation_id: link.source_observation_id,
      role: link.role,
      locator: link.locator,
      evidence_note: link.evidence_note,
      extraction_method: link.extraction_method,
      confidence: link.confidence,
    });
  }
}

async function revokeLinks(tx: Transaction) {
  for (const link of provenanceLinkDetails.filter((candidate) => candidate.revoked_at !== null)) {
    await tx.query(
      "update public.provenance_links set revoked_at = $2, revoked_reason = $3 where id = $1",
      [link.provenance_link_id, link.revoked_at, link.revoked_reason],
    );
  }
}

/** Loads every synthetic fixture. Runs as the database owner in one transaction. */
export async function loadSyntheticFixtures(db: PGlite): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("select set_config('nfai.actor_kind', 'system', true)");
    await tx.query("select set_config('nfai.actor_label', 'synthetic-fixture-loader', true)");
    await loadSources(tx);

    for (const [table, rows] of FIXTURE_TABLES) {
      for (const row of rows) {
        // Every row starts as a draft; timestamps come from the database.
        const values: Record<string, unknown> = { ...row, publication_state: "draft" };
        delete values.created_at;
        delete values.updated_at;
        await insert(tx, table, values);
        if (row.publication_state === "draft") continue;
        if (!NO_PROVENANCE.has(table)) await linkProvenance(tx, table, row.id);
        await transition(tx, table, row.id, "validated");
        await transition(tx, table, row.id, "published");
      }
    }

    for (const [table, rows] of FIXTURE_TABLES) {
      for (const row of rows) {
        if (row.publication_state === "superseded") {
          const replacement = supersededBy[row.id];
          if (!replacement) throw new Error(`fixture ${row.id} has no replacement`);
          await tx.query("select public.nfai_supersede($1, $2::uuid, $3::uuid, $4, $5)", [
            `public.${table}`,
            row.id,
            replacement,
            "correction",
            "Synthetic correction.",
          ]);
        } else if (row.publication_state === "withdrawn") {
          await tx.query("select public.nfai_withdraw($1, $2::uuid, $3)", [
            `public.${table}`,
            row.id,
            "Synthetic withdrawal.",
          ]);
        }
      }
    }

    await revokeLinks(tx);
  });
}
