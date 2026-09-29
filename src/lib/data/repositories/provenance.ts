import type { PublicClient } from "@/lib/data/clients/types";
import type { SourceCitation } from "@/lib/data/domain";
import { mapSourceCitation } from "@/lib/data/mappers/provenance";
import { selectPublicCitationRows } from "@/lib/data/queries/provenance";
import { rowsOf } from "@/lib/data/repositories/response";

/** Fact tables whose rows can carry citations. */
export type CitableTable = "benchmark_results" | "pricing_records";

/**
 * Sources cited for one fact record, primary first. Revoked and non-citable
 * (discovery/context) links are excluded; RLS limits the view to public facts.
 */
export async function listCitations(
  client: PublicClient,
  table: CitableTable,
  recordId: string,
): Promise<SourceCitation[]> {
  const rows = await rowsOf(
    "listCitations",
    client
      .from("provenance_link_details")
      .select("*")
      .eq("subject_table", `public.${table}`)
      .eq("subject_id", recordId)
      .is("revoked_at", null),
  );
  return selectPublicCitationRows(rows).map(mapSourceCitation);
}
