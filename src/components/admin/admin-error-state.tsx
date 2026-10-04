"use client";

import { buttonClass } from "@/components/admin/styles";

type AdminErrorStateProps = {
  /** Server error reference, safe to show (no details). */
  digest?: string;
  retry: () => void;
};

/**
 * Shown when an admin page cannot load. It never displays the error message itself:
 * details stay in server logs, and only a reference is shown.
 */
export function AdminErrorState({ digest, retry }: AdminErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
    >
      <h1 className="text-xl font-semibold">This page could not be loaded</h1>
      <p className="mt-2 text-sm">
        Nothing was changed. Try again, and if it keeps failing, report the problem
        {digest ? ` with reference ${digest}` : ""}.
      </p>
      <button type="button" onClick={retry} className={`${buttonClass("primary")} mt-4`}>
        Try again
      </button>
    </div>
  );
}
