import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import type { AdminViewer } from "@/components/admin/types";

type AdminShellProps = {
  viewer: AdminViewer;
  /** Sign-out control, supplied by the auth layer. */
  signOut: ReactNode;
  children: ReactNode;
};

/**
 * Frame for every signed-in admin page: identity bar, section navigation and the main
 * landmark (the root layout's skip link targets `#main-content`).
 */
export function AdminShell({ viewer, signOut, children }: AdminShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-foreground">
            NFAI Labs admin
            <span className="ml-2 rounded bg-notice px-1.5 py-0.5 text-xs font-medium text-notice-foreground">
              Internal
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p>
              <span className="sr-only">Signed in as </span>
              <span className="font-medium text-foreground">{viewer.displayName}</span>
              <span className="text-muted">
                {" "}
                · {viewer.roles.length > 0 ? viewer.roles.join(", ") : "No roles assigned"}
              </span>
            </p>
            {signOut}
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:px-8">
        <aside>
          <AdminNav permissions={viewer.permissions} />
        </aside>
        <main id="main-content" tabIndex={-1} className="min-w-0 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
