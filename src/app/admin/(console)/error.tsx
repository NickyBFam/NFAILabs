"use client";

import { AdminErrorState } from "@/components/admin/admin-error-state";

type ErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/** Error boundary for signed-in admin pages; the shell and navigation stay usable. */
export default function AdminError({ error, retry }: ErrorProps) {
  return <AdminErrorState digest={error.digest} retry={retry} />;
}
