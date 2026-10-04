import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { signOutAction } from "@/lib/auth/actions";
import { ADMIN_ROOT_PATH, signInPathFor } from "@/lib/auth/routes";
import { getAdminAccess } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "No admin access",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Shown to signed-in people without an active admin identity. It does not say whether
 * the identity is missing or disabled, and it offers only signing out.
 */
export default async function AdminUnauthorizedPage() {
  const access = await getAdminAccess();
  if (access.status === "allowed") redirect(ADMIN_ROOT_PATH);
  if (access.status === "unauthenticated") redirect(signInPathFor());

  return (
    <Card className="space-y-5">
      <h1 className="text-xl font-semibold text-foreground">No admin access</h1>
      <p className="text-sm text-muted">
        {access.status === "unavailable"
          ? "Your access could not be checked right now. Try again later."
          : "You are signed in, but this account does not have access to the NFAI Labs admin. If you think this is a mistake, contact an administrator."}
      </p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="w-full rounded-md border border-line bg-surface px-4 py-2 font-semibold text-foreground hover:bg-surface-muted"
        >
          Sign out
        </button>
      </form>
    </Card>
  );
}
