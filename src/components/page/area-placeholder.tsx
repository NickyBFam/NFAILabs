import { NotImplementedNotice } from "@/components/page/not-implemented-notice";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";
import type { ProductArea } from "@/lib/product-areas";

type AreaPlaceholderProps = {
  area: ProductArea;
};

/** Standard page body for a product area whose functionality is not built yet. */
export function AreaPlaceholder({ area }: AreaPlaceholderProps) {
  return (
    <>
      <PageHeader
        title={area.title}
        description={area.summary}
        eyebrow={<Badge tone="notice">In development</Badge>}
      />
      <Container className="grid gap-8 py-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NotImplementedNotice plannedPhases={area.plannedPhases} />
          <h2 className="mt-8 text-xl font-semibold text-foreground">
            What this section will contain
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted marker:text-accent">
            {area.plannedContents.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <aside
          aria-labelledby={`${area.slug}-methodology`}
          className="rounded-lg border border-line bg-surface p-5"
        >
          <h2 id={`${area.slug}-methodology`} className="text-base font-semibold text-foreground">
            How data will be handled
          </h2>
          <p className="mt-2 text-sm text-muted">
            Every fact shown here will link to its source, and results gathered under different
            conditions will not be mixed.
          </p>
          <ButtonLink href="/methodology" variant="secondary" className="mt-4">
            Read the methodology
          </ButtonLink>
        </aside>
      </Container>
    </>
  );
}
