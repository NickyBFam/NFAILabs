import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <Container className="max-w-2xl py-20 text-center">
      <p className="font-mono text-sm font-semibold text-accent">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="mt-3 text-muted">The page you are looking for does not exist or has moved.</p>
      <div className="mt-8 flex justify-center">
        <ButtonLink href="/">Go to the homepage</ButtonLink>
      </div>
    </Container>
  );
}
