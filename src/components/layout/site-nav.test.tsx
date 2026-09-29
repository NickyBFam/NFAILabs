import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isActivePath, SiteNav } from "@/components/layout/site-nav";
import { primaryNavAreas, productAreas } from "@/lib/product-areas";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

beforeEach(() => {
  pathname.current = "/";
});

function getMenuToggle() {
  return screen.getByRole("button", { name: /menu/i });
}

describe("isActivePath", () => {
  it("matches the route itself and its descendants only", () => {
    expect(isActivePath("/models", "/models")).toBe(true);
    expect(isActivePath("/models/some-version", "/models")).toBe(true);
    expect(isActivePath("/modelsx", "/models")).toBe(false);
    expect(isActivePath("/models", "/")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
  });
});

describe("SiteNav", () => {
  it("renders the primary navigation links", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const area of primaryNavAreas) {
      expect(within(nav).getByRole("link", { name: area.navLabel })).toHaveAttribute(
        "href",
        area.href,
      );
    }
  });

  it("marks the current section with aria-current", () => {
    pathname.current = "/rankings";
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Rankings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Models" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the mobile menu collapsed until the toggle is pressed", async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    const toggle = getMenuToggle();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("navigation")).toHaveLength(1);

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(menu).not.toBeNull();
    expect(menu).toBeVisible();
    for (const area of productAreas) {
      expect(within(menu as HTMLElement).getByRole("link", { name: area.navLabel })).toBeVisible();
    }
  });

  it("closes the mobile menu with Escape and returns focus to the toggle", async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    const toggle = getMenuToggle();

    await user.click(toggle);
    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("closes the mobile menu after a link is chosen", async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    const toggle = getMenuToggle();
    await user.click(toggle);

    const menu = document.getElementById(toggle.getAttribute("aria-controls") ?? "") as HTMLElement;
    // jsdom cannot perform real document navigation; stop the browser default after the app handlers run.
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("click", preventNavigation);
    await user.click(within(menu).getByRole("link", { name: "News" }));

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    document.removeEventListener("click", preventNavigation);
  });
});
