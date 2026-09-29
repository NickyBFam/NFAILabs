import { NotImplementedNotice } from "@/components/page/not-implemented-notice";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { createAreaMetadata } from "@/lib/metadata";
import { getProductArea } from "@/lib/product-areas";

const area = getProductArea("methodology");

export const metadata = createAreaMetadata(area);

/** Source tiers from docs/DATA_SOURCES.md §2, in order of preference. */
const sourceTiers = [
  "Official provider and API documentation",
  "Original benchmark organizations",
  "Reproducible independent evaluators",
  "Credible secondary reporting (context only, clearly labeled)",
] as const;

const rules = [
  {
    title: "Results belong to exact model versions",
    body: "A benchmark result is always attached to the exact model version and evaluation configuration that produced it, including reasoning settings, tool access, and harness.",
  },
  {
    title: "No silent mixing",
    body: "Results from different benchmark versions, attempt counts, harnesses, or tool access are shown separately or flagged, and never combined into one number.",
  },
  {
    title: "Origin is always labeled",
    body: "Vendor-reported, benchmark-owner, independent, and future NFAI results are labeled as such. Vendor-reported numbers with undisclosed conditions are not treated as comparable.",
  },
  {
    title: "Rankings are per use case",
    body: "There is no single universal 'best AI' score. Category weights will be set through a documented, reviewable process rather than chosen arbitrarily.",
  },
  {
    title: "Derived scores are traceable",
    body: "Any score NFAI Labs computes will record its inputs, normalization, weights, and methodology version so it can be reproduced exactly.",
  },
  {
    title: "History is kept",
    body: "Corrections supersede earlier records instead of deleting them, and methodology changes are versioned with a public changelog.",
  },
  {
    title: "Commercial independence",
    body: "Payment, sponsorship, or affiliate relationships never influence results, rankings, derived scores, or methodology. Any sponsored content will be disclosed and kept separate.",
  },
] as const;

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        title={area.title}
        description={area.summary}
        eyebrow={<Badge tone="accent">Principles approved · detailed methodology pending</Badge>}
      />
      <Container className="max-w-3xl py-10">
        <NotImplementedNotice plannedPhases={area.plannedPhases} />

        <section aria-labelledby="rules-heading" className="mt-10">
          <h2 id="rules-heading" className="text-xl font-semibold text-foreground">
            Core rules
          </h2>
          <dl className="mt-4 space-y-5">
            {rules.map((rule) => (
              <div key={rule.title}>
                <dt className="font-semibold text-foreground">{rule.title}</dt>
                <dd className="mt-1 text-muted">{rule.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="sources-heading" className="mt-10">
          <h2 id="sources-heading" className="text-xl font-semibold text-foreground">
            Source preference
          </h2>
          <p className="mt-2 text-muted">
            Every capability, price, release date, and benchmark result will link to a source.
            Sources are preferred in this order:
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted marker:font-semibold marker:text-foreground">
            {sourceTiers.map((tier) => (
              <li key={tier}>{tier}</li>
            ))}
          </ol>
          <p className="mt-4 text-muted">
            NFAI Labs stores structured facts, short original summaries, and links to originals. It
            does not copy articles or benchmark websites.
          </p>
        </section>
      </Container>
    </>
  );
}
