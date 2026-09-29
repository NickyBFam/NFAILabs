import Link from "next/link";
import { SiteNav } from "@/components/layout/site-nav";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="relative z-20 border-b border-line bg-surface">
      <Container className="flex min-h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md text-base font-semibold tracking-tight text-foreground"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-md bg-accent font-mono text-xs font-bold text-accent-foreground"
          >
            NF
          </span>
          {siteConfig.name}
        </Link>
        <SiteNav />
      </Container>
    </header>
  );
}
