import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProductArea, navGroups, primaryNavAreas, productAreas } from "@/lib/product-areas";

const requiredRoutes = [
  "/models",
  "/providers",
  "/rankings",
  "/compare",
  "/benchmarks",
  "/finder",
  "/stacks",
  "/news",
  "/guides",
  "/labs",
  "/methodology",
  "/about",
];

describe("product areas configuration", () => {
  it("covers exactly the product routes required by the Phase 1 scope", () => {
    expect(productAreas.map((area) => area.href).sort()).toEqual([...requiredRoutes].sort());
  });

  it("uses unique slugs and hrefs that match each other", () => {
    const slugs = productAreas.map((area) => area.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const area of productAreas) {
      expect(area.href).toBe(`/${area.slug}`);
    }
  });

  it("has a page file for every configured route", () => {
    for (const area of productAreas) {
      const pageFile = path.join(process.cwd(), "src", "app", "(site)", area.slug, "page.tsx");
      expect(existsSync(pageFile), `missing ${pageFile}`).toBe(true);
    }
  });

  it("places every area in exactly one navigation group", () => {
    const grouped = navGroups.flatMap(({ areas }) => areas.map((area) => area.slug));
    expect(grouped.sort()).toEqual(productAreas.map((area) => area.slug).sort());
    for (const { areas } of navGroups) {
      expect(areas.length).toBeGreaterThan(0);
    }
  });

  it("keeps the desktop navigation compact", () => {
    expect(primaryNavAreas.length).toBeGreaterThanOrEqual(4);
    expect(primaryNavAreas.length).toBeLessThanOrEqual(7);
  });

  it("describes planned contents and a delivery phase for every area", () => {
    for (const area of productAreas) {
      expect(area.plannedContents.length).toBeGreaterThan(0);
      expect(area.plannedPhases.length).toBeGreaterThan(0);
    }
  });

  it("throws for unknown areas instead of rendering an empty page", () => {
    expect(() => getProductArea("does-not-exist")).toThrow(/Unknown product area/);
  });
});
