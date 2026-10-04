"use client";

import { startTransition, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/components/admin/types";
import { buttonClass, type ButtonTone } from "@/components/admin/styles";

type SubmitButtonProps = {
  children: ReactNode;
  tone?: ButtonTone;
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: string;
};

/** Submit button that is disabled while its form is submitting. */
export function SubmitButton({
  children,
  tone = "primary",
  disabled,
  pending = false,
  pendingLabel = "Saving…",
}: SubmitButtonProps) {
  return (
    <button type="submit" className={buttonClass(tone)} disabled={disabled || pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Submit handler that runs a `useActionState` action without React's automatic form
 * reset, so a rejected submission keeps what the person typed.
 */
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}

/**
 * Announces the outcome of a submission. Field errors are listed as links to their
 * inputs, and focus moves to the summary so keyboard and screen-reader users hear it.
 */
export function FormResult({
  result,
  fieldLabels = {},
  idPrefix = "field",
}: {
  result: ActionResult;
  fieldLabels?: Readonly<Record<string, string>>;
  idPrefix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result.status === "error") ref.current?.focus();
  }, [result]);

  if (result.status === "idle") return null;

  if (result.status === "success") {
    return (
      <div
        role="status"
        className="rounded-md border border-transparent bg-accent-soft p-3 text-sm"
      >
        {result.message}
      </div>
    );
  }

  const fieldErrors = Object.entries(result.fieldErrors ?? {});
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 focus:outline-none dark:border-red-800 dark:bg-red-950 dark:text-red-100"
    >
      <p className="font-semibold">{result.message}</p>
      {fieldErrors.length > 0 ? (
        <ul className="mt-2 list-disc pl-5">
          {fieldErrors.map(([name, message]) => (
            <li key={name}>
              <a href={`#${idPrefix}-${name}`} className="underline">
                {fieldLabels[name] ?? name}: {message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
