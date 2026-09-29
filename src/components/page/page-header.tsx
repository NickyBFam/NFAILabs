import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: ReactNode;
};

export function PageHeader({ title, description, eyebrow }: PageHeaderProps) {
  return (
    <div className="border-b border-line bg-surface">
      <Container className="py-10 sm:py-14">
        {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-lg text-muted">{description}</p>
      </Container>
    </div>
  );
}
