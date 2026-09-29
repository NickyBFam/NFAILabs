import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "accent" | "notice";
  className?: string;
};

const tones = {
  neutral: "border-line bg-surface-muted text-muted",
  accent: "border-transparent bg-accent-soft text-foreground",
  notice: "border-notice-line bg-notice text-notice-foreground",
} as const;

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
