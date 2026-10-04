import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type NoticeProps = {
  tone?: "info" | "warning" | "error" | "success";
  title?: string;
  children: ReactNode;
  className?: string;
};

const tones = {
  info: "border-line bg-surface-muted text-foreground",
  warning: "border-notice-line bg-notice text-notice-foreground",
  error:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  success: "border-transparent bg-accent-soft text-foreground",
} as const;

/** An inline message. Errors are announced to assistive technology as alerts. */
export function Notice({ tone = "info", title, children, className }: NoticeProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border p-4 text-sm", tones[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
      <p className="font-semibold text-foreground">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
