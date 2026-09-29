import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "@/components/ui/button-link";

describe("ButtonLink", () => {
  it("renders an accessible internal link with the primary style by default", () => {
    render(<ButtonLink href="/methodology">Read the methodology</ButtonLink>);
    const link = screen.getByRole("link", { name: "Read the methodology" });
    expect(link).toHaveAttribute("href", "/methodology");
    expect(link.className).toContain("bg-accent");
  });

  it("applies the secondary variant and merges extra classes", () => {
    render(
      <ButtonLink href="/about" variant="secondary" className="mt-4">
        About
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "About" });
    expect(link.className).toContain("border-line");
    expect(link.className).not.toContain("bg-accent");
    expect(link.className).toContain("mt-4");
  });
});
