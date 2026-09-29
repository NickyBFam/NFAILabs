"use client";

/**
 * Last-resort boundary for errors in the root layout. It replaces the whole
 * document, so it cannot rely on global styles and uses minimal inline styling.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "4rem 1rem",
          textAlign: "center",
        }}
      >
        <title>Something went wrong · NFAI Labs</title>
        <h1>Something went wrong</h1>
        <p>NFAI Labs could not load. Please try again.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ minHeight: "44px", padding: "0.5rem 1rem" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
