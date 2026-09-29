"use client";

import { useEffect } from "react";
import { Container } from "@/components/ui/container";

type ErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/** Route-level error boundary rendered inside the root layout. */
export default function RouteError({ error, retry }: ErrorProps) {
  useEffect(() => {
    // Error reporting is not configured yet (Phase 22); log for local diagnosis.
    console.error(error);
  }, [error]);

  return (
    <Container className="max-w-2xl py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="mt-3 text-muted">
        An unexpected error occurred while loading this page.
        {error.digest ? ` Reference: ${error.digest}.` : null}
      </p>
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </Container>
  );
}
