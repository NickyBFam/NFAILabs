import { cn } from "@/lib/cn";

/** Shared admin control styles (plain strings, usable from Server and Client Components). */
export const inputClass =
  "block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-foreground shadow-sm aria-[invalid=true]:border-red-600";

const buttonTones = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-foreground hover:bg-surface-muted",
  danger: "bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500",
} as const;

export type ButtonTone = keyof typeof buttonTones;

export function buttonClass(tone: ButtonTone = "primary") {
  return cn(
    "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    buttonTones[tone],
  );
}
