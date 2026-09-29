import type { SourceCitation } from "@/lib/data/domain";
import type { ProvenanceLinkDetailsRow } from "@/types/database";

/**
 * Maps a provenance link to a public citation. Internal fields (content hashes,
 * extractor versions, evidence notes, observation ids, registry status) are
 * deliberately not carried over.
 */
export function mapSourceCitation(row: ProvenanceLinkDetailsRow): SourceCitation {
  return {
    role: row.role,
    tierAtCitation: row.tier_at_citation,
    confidence: row.confidence,
    confidenceReason: row.confidence_reason,
    locator: row.locator,
    document: {
      title: row.document_title,
      kind: row.document_kind,
      url: row.current_url ?? row.original_url,
      externalIdentifier: row.external_identifier,
      publishedOn: row.published_on,
    },
    source: { name: row.source_name, publisher: row.publisher_name },
    retrievedAt: row.retrieved_at,
  };
}
