import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { loadViewer } from "@/app/admin/_data/viewer";
import { signOutAction } from "@/lib/auth/actions";

/**
 * Signed-in admin shell. `loadViewer()` verifies the session and identity on the server
 * (redirecting to sign-in or the unauthorized page otherwise) and reads the viewer's
 * roles and permissions from the database. Each page checks again for its own
 * permission; a layout check alone is not treated as security.
 */
export default async function AdminConsoleLayout({ children }: Readonly<{ children: ReactNode }>) {
  const viewer = await loadViewer();
  return (
    <AdminShell viewer={viewer} signOut={<SignOutButton action={signOutAction} />}>
      {children}
    </AdminShell>
  );
}
