import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AreaPlaceholder } from "@/components/page/area-placeholder";
import { productAreas } from "@/lib/product-areas";

describe("AreaPlaceholder", () => {
  it.each(productAreas.map((area) => [area.slug, area] as const))(
    "renders %s with one heading and a not-yet-available notice",
    (_slug, area) => {
      render(<AreaPlaceholder area={area} />);

      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(area.title);

      const notice = screen.getByRole("note", { name: "Not yet available" });
      expect(notice).toHaveTextContent(area.plannedPhases);

      for (const item of area.plannedContents) {
        expect(screen.getByText(item)).toBeInTheDocument();
      }
    },
  );

  it("links to the methodology", () => {
    const [area] = productAreas;
    if (!area) throw new Error("expected at least one product area");
    render(<AreaPlaceholder area={area} />);
    expect(screen.getByRole("link", { name: "Read the methodology" })).toHaveAttribute(
      "href",
      "/methodology",
    );
  });
});
