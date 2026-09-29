import type { Metadata } from "next";
import type { ProductArea } from "@/lib/product-areas";
import { siteConfig } from "@/lib/site";

type PageMetadataInput = {
  title: string;
  description: string;
  /**
   * Use the title as-is instead of applying the root title template. Needed for
   * the root page, which the layout template does not apply to.
   */
  absoluteTitle?: boolean;
  /** Site-relative path, resolved against metadataBase for the canonical URL. */
  path: `/${string}`;
};

/**
 * Per-page metadata with a self-referencing canonical URL.
 * Canonicals are relative paths; the root layout's metadataBase makes them absolute.
 */
export function createPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: PageMetadataInput): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} · ${siteConfig.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: fullTitle,
      description,
      url: path,
    },
  };
}

export function createAreaMetadata(area: ProductArea): Metadata {
  return createPageMetadata({ title: area.title, description: area.summary, path: area.href });
}
