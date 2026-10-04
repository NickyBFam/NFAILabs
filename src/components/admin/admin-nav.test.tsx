import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminNav, isActiveAdminPath } from "@/components/admin/admin-nav";
import { AdminShell } from "@/components/admin/admin-shell";
import { allPermissions, syntheticViewer } from "@/components/admin/test-fixtures";

const pathname = vi.hoisted(() => ({ current: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

beforeEach(() => {
  pathname.current = "/admin";
});

describe("isActiveAdminPath", () => {
  it("matches the overview only exactly and other sections with their children", () => {
    expect(isActiveAdminPath("/admin", "/admin")).toBe(true);
    expect(isActiveAdminPath("/admin/review", "/admin")).toBe(false);
    expect(isActiveAdminPath("/admin/models", "/admin/models")).toBe(true);
    expect(isActiveAdminPath("/admin/models/x", "/admin/models")).toBe(true);
    expect(isActiveAdminPath("/admin/modelsx", "/admin/models")).toBe(false);
  });
});

describe("AdminNav", () => {
  it("lists the required areas for a viewer with read access", () => {
    render(<AdminNav permissions={["view_admin"]} />);
    const nav = screen.getByRole("navigation", { name: "Admin" });
    const expected = {
      Overview: "/admin",
      "Review queue": "/admin/review",
      Models: "/admin/models",
      Benchmarks: "/admin/benchmarks",
      Pricing: "/admin/pricing",
      Sources: "/admin/sources",
    };
    for (const [name, href] of Object.entries(expected)) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("hides audit and access from people without those permissions", () => {
    render(<AdminNav permissions={["view_admin"]} />);
    expect(screen.queryByRole("link", { name: "Audit" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Access" })).toBeNull();
  });

  it("shows audit and access to people who hold the permissions", () => {
    render(<AdminNav permissions={allPermissions} />);
    expect(screen.getByRole("link", { name: "Audit" })).toHaveAttribute("href", "/admin/audit");
    expect(screen.getByRole("link", { name: "Access" })).toHaveAttribute("href", "/admin/access");
  });

  it("lists nothing without admin access", () => {
    render(<AdminNav permissions={[]} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("marks the current section", () => {
    pathname.current = "/admin/pricing";
    render(<AdminNav permissions={["view_admin"]} />);
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});

describe("AdminShell", () => {
  it("shows the current actor, their roles and the main landmark", () => {
    render(
      <AdminShell viewer={syntheticViewer()} signOut={<button type="button">Sign out</button>}>
        <p>Page body</p>
      </AdminShell>,
    );
    expect(screen.getByText("Test Reviewer One")).toBeInTheDocument();
    expect(screen.getByText("· viewer")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(within(main).getByText("Page body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
