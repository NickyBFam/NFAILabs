import type { ReactNode } from "react";
import { siteConfig } from "@/lib/site";

/**
 * Minimal layout for the admin sign-in, sign-out and unauthorized pages. These pages
 * must render without an admin session, so there is no admin shell or auth check here.
 */
export default function AdminAuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex flex-1 items-center justify-center bg-background px-4 py-16 focus:outline-none"
    >
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-wide text-muted uppercase">
          {siteConfig.name} admin
        </p>
        {children}
      </div>
    </main>
  );
}
