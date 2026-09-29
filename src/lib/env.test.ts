import { describe, expect, it } from "vitest";
import { getSiteUrl, isIndexingAllowed } from "@/lib/env";

describe("getSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL when it is a valid http(s) URL", () => {
    const url = getSiteUrl({
      NEXT_PUBLIC_SITE_URL: "https://example.test",
      VERCEL_PROJECT_PRODUCTION_URL: "ignored.vercel.app",
    });
    expect(url.origin).toBe("https://example.test");
  });

  it("falls back to the Vercel production host", () => {
    expect(getSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "nfai.vercel.app" }).origin).toBe(
      "https://nfai.vercel.app",
    );
  });

  it("ignores invalid or non-http values and defaults to localhost", () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "not a url" }).origin).toBe("http://localhost:3000");
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" }).origin).toBe(
      "http://localhost:3000",
    );
    expect(getSiteUrl({}).origin).toBe("http://localhost:3000");
  });
});

describe("isIndexingAllowed", () => {
  it("is off unless explicitly enabled", () => {
    expect(isIndexingAllowed({})).toBe(false);
    expect(isIndexingAllowed({ NFAI_ALLOW_INDEXING: "1" })).toBe(false);
    expect(isIndexingAllowed({ NFAI_ALLOW_INDEXING: "true" })).toBe(true);
  });
});
