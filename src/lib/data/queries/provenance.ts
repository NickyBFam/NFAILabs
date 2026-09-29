import type { ProvenanceLinkDetailsRow, ProvenanceRole } from "@/types/database";

/**
 * Roles shown next to a public fact. `discovery` links (how NFAI found a fact,
 * possibly an untrusted T5 source) and `context` links are never support and
 * are not shown as citations.
 */
const CITABLE_ROLES: readonly ProvenanceRole[] = [
  "primary",
  "corroborating",
  "verification",
  "contradicting",
  "retraction_notice",
];

/** Active, citable links, primary source first. Revoked links are excluded. */
export function selectPublicCitationRows(
  rows: readonly ProvenanceLinkDetailsRow[],
): ProvenanceLinkDetailsRow[] {
  return rows
    .filter((row) => row.revoked_at === null && CITABLE_ROLES.includes(row.role))
    .sort((a, b) => CITABLE_ROLES.indexOf(a.role) - CITABLE_ROLES.indexOf(b.role));
}
