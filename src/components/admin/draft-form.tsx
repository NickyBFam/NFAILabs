"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { FormResult, SubmitButton } from "@/components/admin/form-controls";
import { inputClass } from "@/components/admin/styles";
import {
  validateFields,
  type FieldErrors,
  type FormFieldDef,
} from "@/components/admin/draft-fields";
import { idleResult, type ActionResult } from "@/components/admin/types";

export type FormServerAction = (
  previous: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export type FieldGroup = {
  legend: string;
  description?: string;
  fields: readonly FormFieldDef[];
};

type DraftFormProps = {
  groups: readonly FieldGroup[];
  action: FormServerAction;
  submitLabel: string;
  /** Hidden identifiers sent with the form (for example the target table). */
  hidden?: Readonly<Record<string, string>>;
};

/**
 * A structured entry form. It checks required fields and formats before sending, shows
 * an error summary linked to each field, and keeps what was typed when the server
 * refuses the submission.
 */
export function DraftForm({ groups, action, submitLabel, hidden = {} }: DraftFormProps) {
  const [serverResult, dispatch, pending] = useActionState(action, idleResult);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const fields = groups.flatMap((group) => group.fields);
  const labels = Object.fromEntries(fields.map((field) => [field.name, field.label]));

  const result: ActionResult = clientErrors
    ? { status: "error", message: "Some fields need attention.", fieldErrors: clientErrors }
    : serverResult;
  const fieldErrors = result.status === "error" ? (result.fieldErrors ?? {}) : {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const errors = validateFields(fields, formData);
    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }
    setClientErrors(null);
    startTransition(() => dispatch(formData));
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-6">
      <FormResult result={result} fieldLabels={labels} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {groups.map((group) => (
        <fieldset key={group.legend} className="rounded-lg border border-line bg-surface p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">{group.legend}</legend>
          {group.description ? (
            <p className="mb-3 text-sm text-muted">{group.description}</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <Field key={field.name} field={field} error={fieldErrors[field.name]} />
            ))}
          </div>
        </fieldset>
      ))}
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}

function Field({ field, error }: { field: FormFieldDef; error: string | undefined }) {
  const id = `field-${field.name}`;
  const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  const common = {
    id,
    name: field.name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
    "aria-required": field.required ? true : undefined,
  } as const;
  const wide = ["textarea", "json", "multi", "lines"].includes(field.kind);

  const label = (
    <>
      {field.label}
      {field.required ? (
        <span className="text-red-700 dark:text-red-300" aria-hidden="true">
          {" "}
          *
        </span>
      ) : (
        <span className="font-normal text-muted"> (optional)</span>
      )}
    </>
  );

  if (field.kind === "multi") {
    return (
      <fieldset
        className="sm:col-span-2"
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
      >
        <legend id={id} tabIndex={-1} className="text-sm font-medium text-foreground">
          {label}
        </legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {(field.options ?? []).map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={field.name}
                value={option.value}
                defaultChecked={field.defaultValues?.includes(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldMessages id={id} help={field.help} error={error} />
      </fieldset>
    );
  }

  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="mt-1">
        <Control field={field} common={common} />
      </div>
      <FieldMessages id={id} help={field.help} error={error} />
    </div>
  );
}

type CommonProps = {
  id: string;
  name: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
};

function Control({ field, common }: { field: FormFieldDef; common: CommonProps }) {
  switch (field.kind) {
    case "textarea":
    case "lines":
    case "json":
      return (
        <textarea
          {...common}
          rows={field.kind === "json" ? 4 : 3}
          defaultValue={field.defaultValue}
          className={`${inputClass} ${field.kind === "json" ? "font-mono" : ""}`}
        />
      );
    case "select":
    case "reference":
    case "boolean":
      return (
        <select {...common} defaultValue={field.defaultValue ?? ""} className={inputClass}>
          <option value="">{field.required ? "Choose…" : "Not recorded"}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          {...common}
          type={inputType(field)}
          inputMode={field.kind === "decimal" || field.kind === "integer" ? "decimal" : undefined}
          defaultValue={field.defaultValue}
          className={inputClass}
        />
      );
  }
}

function inputType(field: FormFieldDef): string {
  switch (field.kind) {
    case "url":
      return "url";
    case "date":
      return "date";
    case "datetime":
      return "datetime-local";
    default:
      return "text";
  }
}

function FieldMessages({ id, help, error }: { id: string; help?: string; error?: string }) {
  return (
    <>
      {help ? (
        <p id={`${id}-help`} className="mt-1 text-xs text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
    </>
  );
}
