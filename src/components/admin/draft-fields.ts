/**
 * Form field definitions for structured record entry, and the pure helpers that turn a
 * submitted form into values. The server validates again against its own allowlist
 * (`src/lib/admin/mutations`); these checks only give faster, clearer feedback.
 */

export type FieldOption = { value: string; label: string };

export type FormFieldKind =
  | "text"
  | "textarea"
  | "slug"
  | "url"
  | "date"
  | "datetime"
  | "decimal"
  | "integer"
  | "select"
  | "boolean"
  | "multi"
  | "lines"
  | "reference"
  | "json";

export type FormFieldDef = {
  name: string;
  label: string;
  kind: FormFieldKind;
  required?: boolean;
  help?: string;
  max?: number;
  min?: number;
  /** Choices for select, multi and reference fields. */
  options?: readonly FieldOption[];
  defaultValue?: string;
  /** Initially checked options of a multi field. */
  defaultValues?: readonly string[];
};

export type FieldErrors = Record<string, string>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const INTEGER = /^-?\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Checks one field; returns a message, or null when the value is acceptable. */
export function checkField(field: FormFieldDef, formData: FormData): string | null {
  if (field.kind === "multi") {
    const chosen = formData.getAll(field.name).filter((value) => typeof value === "string");
    return field.required && chosen.length === 0 ? "Choose at least one option." : null;
  }

  const value = text(formData, field.name);
  if (value === "") return field.required ? "This field is required." : null;
  if (field.max !== undefined && value.length > field.max) {
    return `Use at most ${field.max} characters.`;
  }

  switch (field.kind) {
    case "slug":
      return value.length <= 100 && SLUG.test(value)
        ? null
        : "Use lowercase letters, digits and single hyphens.";
    case "url":
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:"
          ? null
          : "Enter an http or https address.";
      } catch {
        return "Enter a full address starting with https://.";
      }
    case "date":
      return DATE.test(value) ? null : "Enter a date as YYYY-MM-DD.";
    case "datetime":
      return DATETIME_LOCAL.test(value) ? null : "Enter a date and time.";
    case "decimal":
      return DECIMAL.test(value) ? null : "Enter a number.";
    case "integer": {
      if (!INTEGER.test(value)) return "Enter a whole number.";
      if (field.min !== undefined && Number(value) < field.min) {
        return `Enter ${field.min} or more.`;
      }
      return null;
    }
    case "select":
    case "reference":
    case "boolean":
      return field.options && !field.options.some((option) => option.value === value)
        ? "Choose one of the listed options."
        : null;
    case "json":
      try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? null
          : "Enter a JSON object.";
      } catch {
        return "Enter valid JSON.";
      }
    default:
      return null;
  }
}

export function validateFields(fields: readonly FormFieldDef[], formData: FormData): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of fields) {
    const message = checkField(field, formData);
    if (message) errors[field.name] = message;
  }
  return errors;
}

/**
 * Converts submitted form data into values for the mutation layer. Only declared fields
 * are read, empty optional fields are omitted, and a date-time without a zone is taken
 * as UTC (the convention for effective dates, `DATABASE.md` §3). With `clearEmpty`
 * (editing a draft), an emptied optional field is sent as null so it is cleared.
 */
export function formValues(
  fields: readonly FormFieldDef[],
  formData: FormData,
  { clearEmpty = false }: { clearEmpty?: boolean } = {},
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const empty = (field: FormFieldDef) => {
    if (clearEmpty && !field.required) values[field.name] = null;
  };
  for (const field of fields) {
    if (field.kind === "multi") {
      const chosen = formData.getAll(field.name).filter((value) => typeof value === "string");
      if (chosen.length > 0) values[field.name] = chosen;
      else empty(field);
      continue;
    }
    const value = text(formData, field.name);
    if (value === "") {
      empty(field);
      continue;
    }
    switch (field.kind) {
      case "lines":
        values[field.name] = value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        break;
      case "boolean":
        values[field.name] = value === "true";
        break;
      case "datetime":
        values[field.name] = `${value.length === 16 ? `${value}:00` : value}Z`;
        break;
      case "json":
        try {
          values[field.name] = JSON.parse(value) as unknown;
        } catch {
          values[field.name] = value;
        }
        break;
      default:
        values[field.name] = value;
    }
  }
  return values;
}

/** Turns a column name into a readable label (`benchmark_version_id` → "Benchmark version"). */
export function humanizeColumn(column: string): string {
  const words = column.replace(/_id$/, "").split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const yesNoOptions: readonly FieldOption[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

/** Options from a list of machine values, labelled readably. */
export function optionsFrom(values: readonly string[]): FieldOption[] {
  return values.map((value) => ({ value, label: humanizeColumn(value) }));
}
