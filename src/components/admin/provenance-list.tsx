import { EmptyState } from "@/components/admin/notice";
import type { ProvenanceLinkView } from "@/components/admin/types";

/** The sources cited for a record. Links open the original document; nothing is copied. */
export function ProvenanceList({ links }: { links: readonly ProvenanceLinkView[] }) {
  if (links.length === 0) {
    return (
      <EmptyState title="No sources attached">
        A record cannot be validated or published without an approved T1 to T3 source.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {links.map((link) => (
        <li key={link.id} className={link.revoked ? "p-4 text-sm opacity-70" : "p-4 text-sm"}>
          <p className="font-medium text-foreground">
            {link.documentUrl ? (
              <a
                href={link.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                {link.documentTitle}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              link.documentTitle
            )}
          </p>
          <p className="mt-1 text-muted">
            {link.sourceName} · {link.tier} · {link.role}
            {link.revoked ? " · revoked" : ""}
          </p>
          {link.locator ? <p className="mt-1">Location: {link.locator}</p> : null}
          {link.evidenceNote ? <p className="mt-1">{link.evidenceNote}</p> : null}
        </li>
      ))}
    </ul>
  );
}
