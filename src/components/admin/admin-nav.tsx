"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminSections, hasPermission } from "@/components/admin/labels";
import type { AdminPermission } from "@/components/admin/types";
import { cn } from "@/lib/cn";

/** Whether `pathname` is within `href`. The overview matches only itself. */
export function isActiveAdminPath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AdminNavProps = {
  permissions: readonly AdminPermission[];
};

/** Section navigation. Sections the viewer cannot use are not listed. */
export function AdminNav({ permissions }: AdminNavProps) {
  const pathname = usePathname() ?? "/admin";
  const sections = adminSections.filter((section) =>
    hasPermission(permissions, section.permission),
  );

  return (
    <nav aria-label="Admin">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {sections.map((section) => {
          const active = isActiveAdminPath(pathname, section.href);
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-accent-soft text-foreground"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
