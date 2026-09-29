import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";
import { staticRoutes } from "@/lib/routes";

/** Static routes only. Dynamic catalog routes are added when their phases ship. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return staticRoutes.map((path) => ({ url: new URL(path, base).toString() }));
}
