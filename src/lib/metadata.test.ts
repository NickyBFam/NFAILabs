import { describe, expect, it } from "vitest";
import { createAreaMetadata, createPageMetadata } from "@/lib/metadata";
import { getProductArea } from "@/lib/product-areas";

describe("page metadata", () => {
  it("sets a self-referencing canonical path and matching Open Graph URL", () => {
    const metadata = createPageMetadata({ title: "Test", description: "Desc", path: "/test" });
    expect(metadata.alternates?.canonical).toBe("/test");
    expect(metadata.openGraph?.url).toBe("/test");
    expect(metadata.title).toBe("Test");
  });

  it("supports an absolute title that bypasses the root template", () => {
    const metadata = createPageMetadata({
      title: "Home",
      description: "Desc",
      path: "/",
      absoluteTitle: true,
    });
    expect(metadata.title).toEqual({ absolute: "Home" });
    expect(metadata.openGraph?.title).toBe("Home");
  });

  it("derives area metadata from the product area configuration", () => {
    const area = getProductArea("rankings");
    const metadata = createAreaMetadata(area);
    expect(metadata.title).toBe(area.title);
    expect(metadata.description).toBe(area.summary);
    expect(metadata.alternates?.canonical).toBe("/rankings");
  });
});
