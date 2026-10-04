import type { MetadataRoute } from "next";
import { getSiteUrl, isIndexingAllowed } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexingAllowed()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    // The admin area is never crawled (D-009); every admin page also sends noindex.
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: new URL("/sitemap.xml", getSiteUrl()).toString(),
  };
}
