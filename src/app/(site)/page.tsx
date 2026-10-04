import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { createPageMetadata } from "@/lib/metadata";
import { navGroups } from "@/lib/product-areas";
import { siteConfig } from "@/lib/site";

export const metadata = createPageMetadata({
  title: `${siteConfig.name}: AI intelligence, benchmarking, and recommendations`,
  absoluteTitle: true,
  description: siteConfig.description,
  path: "/",
});

const principles = [
  {
    title: "Exact versions, not brands",
    body: "Benchmark results, prices, and capabilities will be attached to the exact model version that was tested or priced, never to a provider or model family as a whole.",
  },
  {
    title: "Every fact has a source",
    body: "Capabilities, prices, release dates, and results will link to their source, with preference for official documentation and original benchmark organizations.",
  },
  {
    title: "Comparable or clearly flagged",
    body: "Results obtained under different benchmark versions, harnesses, or reasoning settings will not be silently mixed.",
  },
  {
    title: "Use case over a single score",
    body: "Rankings will answer 'best for what?' by use case, and any NFAI-derived score will be traceable back to its source measurements.",
  },
  {
    title: "History is preserved",
    body: "Price changes, result corrections, and ranking changes will be recorded over time rather than overwritten.",
  },
  {
    title: "People approve what is published",
    body: "Automated collection may propose updates, but facts are published only after validation and human review.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="hero-heading" className="border-b border-line bg-surface">
        <Container className="py-16 sm:py-24">
          <Badge tone="notice">In development: no data is published yet</Badge>
          <h1
            id="hero-heading"
            className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
          >
            {siteConfig.tagline}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            {siteConfig.name} is being built as an AI intelligence, benchmarking, comparison, and
            recommendation platform. The goal is evidence-based guidance on which AI to use for a
            task, backed by sourced data and a transparent methodology.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/methodology">Read the methodology</ButtonLink>
            <ButtonLink href="#product-areas" variant="secondary">
              See what is planned
            </ButtonLink>
          </div>
        </Container>
      </section>

      <section aria-labelledby="what-heading">
        <Container className="grid gap-8 py-14 lg:grid-cols-3">
          <div>
            <h2 id="what-heading" className="text-2xl font-semibold tracking-tight text-foreground">
              More than a leaderboard
            </h2>
          </div>
          <div className="space-y-4 text-muted lg:col-span-2">
            <p>
              A single &ldquo;best AI&rdquo; score hides the trade-offs that matter in practice. The
              right model for refactoring a large codebase is not necessarily the right one for
              research, for a student on a budget, or for a latency-sensitive product.
            </p>
            <p>
              {siteConfig.name} is designed around use-case-specific rankings, direct comparisons,
              and guided recommendations, with each claim traceable to where it came from and how it
              was measured.
            </p>
          </div>
        </Container>
      </section>

      <section
        id="product-areas"
        aria-labelledby="areas-heading"
        className="scroll-mt-4 border-y border-line bg-surface-muted"
      >
        <Container className="py-14">
          <h2 id="areas-heading" className="text-2xl font-semibold tracking-tight text-foreground">
            Planned product areas
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            These sections are under construction. Each page describes what it will contain and
            which development phase delivers it.
          </p>
          <div className="mt-8 space-y-10">
            {navGroups.map(({ group, label, areas }) => (
              <div key={group}>
                <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                  {label}
                </h3>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {areas.map((area) => (
                    <li key={area.slug}>
                      <Card className="h-full">
                        <h4 className="font-semibold text-foreground">
                          <Link
                            href={area.href}
                            className="underline-offset-4 hover:text-accent hover:underline"
                          >
                            {area.title}
                          </Link>
                        </h4>
                        <p className="mt-2 text-sm text-muted">{area.summary}</p>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="principles-heading">
        <Container className="py-14">
          <h2
            id="principles-heading"
            className="text-2xl font-semibold tracking-tight text-foreground"
          >
            Why methodology comes first
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Recommendations are only as trustworthy as the data and rules behind them. These
            principles are set before any data is collected.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {principles.map((principle) => (
              <li key={principle.title}>
                <Card className="h-full">
                  <h3 className="font-semibold text-foreground">{principle.title}</h3>
                  <p className="mt-2 text-sm text-muted">{principle.body}</p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <ButtonLink href="/methodology" variant="secondary">
              Read the methodology principles
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
