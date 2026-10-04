import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Neutral wrapper for everything under /admin, including the sign-in screens. It adds no
 * chrome and performs no auth check (the sign-in pages must render for signed-out
 * people); the signed-in shell and its checks live in `(console)/layout.tsx`.
 */
export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · NFAI Labs admin",
  },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
