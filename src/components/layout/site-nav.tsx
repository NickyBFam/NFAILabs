"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { navGroups, primaryNavAreas } from "@/lib/product-areas";

/** True when `pathname` is `href` or a descendant route of it. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Main navigation: a compact primary list on wide screens and a
 * disclosure-pattern menu with every product area on small screens.
 */
export function SiteNav() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  function closeMenu({ restoreFocus }: { restoreFocus: boolean }) {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      closeMenu({ restoreFocus: true });
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <nav aria-label="Main" className="hidden lg:block">
        <ul className="flex items-center gap-1">
          {primaryNavAreas.map((area) => {
            const active = isActivePath(pathname, area.href);
            return (
              <li key={area.slug}>
                <Link
                  href={area.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-surface-muted text-foreground"
                      : "text-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  {area.navLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="lg:hidden">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="currentColor">
            {open ? (
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z" />
            ) : (
              <path d="M2.75 5a.75.75 0 0 1 .75-.75h13a.75.75 0 0 1 0 1.5h-13A.75.75 0 0 1 2.75 5Zm0 5a.75.75 0 0 1 .75-.75h13a.75.75 0 0 1 0 1.5h-13a.75.75 0 0 1-.75-.75Zm.75 4.25a.75.75 0 0 0 0 1.5h13a.75.75 0 0 0 0-1.5h-13Z" />
            )}
          </svg>
          {open ? "Close menu" : "Menu"}
        </button>

        <nav
          id={menuId}
          aria-label="Main"
          hidden={!open}
          className="absolute inset-x-0 top-full border-b border-line bg-surface shadow-lg"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 sm:px-6">
            {navGroups.map(({ group, label, areas }) => (
              <div key={group}>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
                <ul className="mt-2 space-y-1">
                  {areas.map((area) => {
                    const active = isActivePath(pathname, area.href);
                    return (
                      <li key={area.slug}>
                        <Link
                          href={area.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => closeMenu({ restoreFocus: false })}
                          className={cn(
                            "block rounded-md px-3 py-2 text-base font-medium",
                            active
                              ? "bg-surface-muted text-foreground"
                              : "text-foreground hover:bg-surface-muted",
                          )}
                        >
                          {area.navLabel}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
