import Link from "next/link";
import { PageHeader } from "@/components/page/page-header";
import { Container } from "@/components/ui/container";
import { createAreaMetadata } from "@/lib/metadata";
import { getProductArea } from "@/lib/product-areas";
import { siteConfig } from "@/lib/site";

const area = getProductArea("about");

export const metadata = createAreaMetadata(area);

export default function AboutPage() {
  return (
    <>
      <PageHeader title={`About ${siteConfig.name}`} description={area.summary} />
      <Container className="max-w-3xl space-y-10 py-10">
        <section aria-labelledby="mission-heading">
          <h2 id="mission-heading" className="text-xl font-semibold text-foreground">
            Mission
          </h2>
          <p className="mt-2 text-muted">
            Make choosing AI systems an evidence-based decision rather than a marketing-driven one,
            by giving people trustworthy, transparent, and current information about what AI models
            can do, what they cost, and how they compare for specific tasks.
          </p>
          <p className="mt-3 text-muted">Every part of the product serves one question:</p>
          <blockquote className="mt-3 border-l-4 border-accent pl-4 text-lg font-medium text-foreground">
            {siteConfig.tagline}
          </blockquote>
        </section>

        <section aria-labelledby="independence-heading">
          <h2 id="independence-heading" className="text-xl font-semibold text-foreground">
            Independence
          </h2>
          <p className="mt-2 text-muted">
            Commercial relationships will never alter benchmark results, rankings, derived scores,
            or methodology. If sponsored or affiliate content is ever introduced, it will be clearly
            disclosed and kept separate from rankings, recommendations, and editorial evaluation.
          </p>
        </section>

        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-xl font-semibold text-foreground">
            Current status
          </h2>
          <p className="mt-2 text-muted">
            {siteConfig.name} is being built in deliberate phases. The product specification and
            methodology principles are complete, and the application foundation is being built now.
            Catalog data, benchmark results, rankings, and recommendation tools come in later phases
            and are not available yet.
          </p>
          <p className="mt-3 text-muted">
            See the{" "}
            <Link
              href="/methodology"
              className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              methodology principles
            </Link>{" "}
            for how data will be sourced and evaluated.
          </p>
        </section>
      </Container>
    </>
  );
}
