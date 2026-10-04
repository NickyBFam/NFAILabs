import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  NEXT_PARAM,
  SIGN_IN_NOTICE_PARAM,
  safeAdminRedirect,
  type SignInNotice,
} from "@/lib/auth/routes";
import { signInAction } from "@/lib/auth/actions";
import { getAdminAccess } from "@/lib/auth/server";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

const NOTICES: Record<SignInNotice, string> = {
  signed_out: "You have been signed out.",
  expired: "Your session has ended. Sign in again to continue.",
  unavailable: "Sign-in is unavailable right now. Try again later.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeAdminRedirect(single(params[NEXT_PARAM]));
  const noticeKey = single(params[SIGN_IN_NOTICE_PARAM]);
  const notice = noticeKey && noticeKey in NOTICES ? NOTICES[noticeKey as SignInNotice] : null;

  // Already signed in as an active admin: go straight to the requested page.
  if ((await getAdminAccess()).status === "allowed") redirect(next);

  return (
    <Card className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
        <p className="mt-1 text-sm text-muted">
          For NFAI Labs editors and reviewers. Accounts are created by an administrator.
        </p>
      </div>
      {notice ? (
        <p role="status" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-foreground">
          {notice}
        </p>
      ) : null}
      <SignInForm action={signInAction} next={next} />
    </Card>
  );
}
