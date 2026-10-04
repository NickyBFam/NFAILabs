import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { signOutAction } from "@/lib/auth/actions";
import { ADMIN_ROOT_PATH } from "@/lib/auth/routes";

export const metadata: Metadata = {
  title: "Sign out",
  robots: { index: false, follow: false, nocache: true },
};

/** Sign-out confirmation. Signing out is a POST (server action), never a GET link. */
export default function AdminSignOutPage() {
  return (
    <Card className="space-y-5">
      <h1 className="text-xl font-semibold text-foreground">Sign out</h1>
      <p className="text-sm text-muted">This ends your admin session on this device.</p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          Sign out
        </button>
      </form>
      <p className="text-center text-sm">
        <Link href={ADMIN_ROOT_PATH} className="text-accent underline-offset-2 hover:underline">
          Back to admin
        </Link>
      </p>
    </Card>
  );
}
