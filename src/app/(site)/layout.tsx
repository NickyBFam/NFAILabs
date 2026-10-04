import type { ReactNode } from "react";
import { SiteShell } from "@/components/layout/site-shell";

/** Layout for the public website. /admin has its own layout without the public navigation (D-009). */
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
