import Link from "next/link";
import { Container } from "@/components/ui/container";
import { navGroups } from "@/lib/product-areas";
import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <Container className="py-10">
        <nav aria-label="Footer">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {navGroups.map(({ group, label, areas }) => (
              <div key={group}>
                <h2 className="text-sm font-semibold text-foreground">{label}</h2>
                <ul className="mt-3 space-y-2">
                  {areas.map((area) => (
                    <li key={area.slug}>
                      <Link
                        href={area.href}
                        className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {area.navLabel}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            {siteConfig.name} is in early development. No rankings, benchmark results, or model data
            are published yet.
          </p>
          <p>© {siteConfig.name}. All rights reserved.</p>
        </div>
      </Container>
    </footer>
  );
}
