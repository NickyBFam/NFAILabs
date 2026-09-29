import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { staticRoutes } from "@/lib/routes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots", () => {
  it("disallows crawling by default", () => {
    vi.stubEnv("NFAI_ALLOW_INDEXING", "");
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });

  it("allows crawling and references the sitemap when indexing is enabled", () => {
    vi.stubEnv("NFAI_ALLOW_INDEXING", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("https://example.test/sitemap.xml");
  });
});

describe("sitemap", () => {
  it("lists every static route as an absolute URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toHaveLength(staticRoutes.length);
    expect(urls).toContain("https://example.test/");
    expect(urls).toContain("https://example.test/methodology");
  });
});
