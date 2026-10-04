import { AdminActionError } from "@/lib/admin/mutations/errors";

/**
 * A small, dependency-free input validator for admin mutations.
 *
 * Validation is allowlist-based and fails closed: any key that is not declared
 * is an error, so browser-supplied fields such as `id`, `publication_state`,
 * `created_by`, `actor_id` or `role` can never reach the database. Values are
 * normalised (trimmed strings, empty optional strings to null) and returned as
 * a new object; the caller's object is never passed through.
 */

export type FieldSpec =
  | { kind: "text"; required?: boolean; max?: number; multiline?: boolean }
  | { kind: "slug"; required?: boolean }
  | { kind: "url"; required?: boolean }
  | { kind: "uuid"; required?: boolean }
  | { kind: "date"; required?: boolean }
  | { kind: "timestamp"; required?: boolean }
  | { kind: "decimal"; required?: boolean }
  | { kind: "integer"; required?: boolean; min?: number; max?: number }
  | { kind: "boolean"; required?: boolean }
  | { kind: "enum"; required?: boolean; values: readonly string[] }
  | { kind: "textArray"; required?: boolean; max?: number }
  | { kind: "json"; required?: boolean };

export type Schema = Readonly<Record<string, FieldSpec>>;
export type Values = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const DECIMAL = /^-?\d{1,30}(\.\d{1,30})?$/;
const DEFAULT_TEXT_MAX = 500;
const MULTILINE_TEXT_MAX = 5000;

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

function isRealDate(value: string): boolean {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}

type Parsed = { ok: true; value: unknown } | { ok: false; message: string };

function parseField(spec: FieldSpec, raw: unknown): Parsed {
  const invalid = (message: string): Parsed => ({ ok: false, message });
  switch (spec.kind) {
    case "text": {
      if (typeof raw !== "string") return invalid("Must be text.");
      const value = raw.trim();
      const max = spec.max ?? (spec.multiline ? MULTILINE_TEXT_MAX : DEFAULT_TEXT_MAX);
      if (value.length > max) return invalid(`Must be at most ${max} characters.`);
      const control = spec.multiline ? value.replace(/[\n\r\t]/g, "") : value;
      if (CONTROL_CHARS.test(control)) return invalid("Contains unsupported characters.");
      if (!spec.multiline && /[\n\r]/.test(value)) return invalid("Must be a single line.");
      return { ok: true, value };
    }
    case "slug": {
      if (typeof raw !== "string") return invalid("Must be text.");
      const value = raw.trim();
      if (value.length > 100 || !SLUG.test(value)) {
        return invalid("Use lowercase letters, digits and single hyphens.");
      }
      return { ok: true, value };
    }
    case "url": {
      if (typeof raw !== "string") return invalid("Must be a URL.");
      const value = raw.trim();
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return invalid("Must be a valid URL.");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:")
        return invalid("Must be an http(s) URL.");
      if (url.username || url.password) return invalid("URLs may not contain credentials.");
      if (value.length > 2000) return invalid("URL is too long.");
      return { ok: true, value };
    }
    case "uuid":
      return typeof raw === "string" && UUID.test(raw.trim())
        ? { ok: true, value: raw.trim().toLowerCase() }
        : invalid("Must be a valid identifier.");
    case "date":
      return typeof raw === "string" && DATE.test(raw.trim()) && isRealDate(raw.trim())
        ? { ok: true, value: raw.trim() }
        : invalid("Must be a date (YYYY-MM-DD).");
    case "timestamp": {
      if (typeof raw !== "string" || !TIMESTAMP.test(raw.trim()) || !isRealDate(raw.trim())) {
        return invalid("Must be a date and time with a time zone (ISO 8601).");
      }
      return Number.isNaN(Date.parse(raw.trim()))
        ? invalid("Must be a valid date and time.")
        : { ok: true, value: raw.trim() };
    }
    case "decimal": {
      // Decimals stay strings so no value passes through binary floating point.
      const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
      return typeof text === "string" && DECIMAL.test(text.trim())
        ? { ok: true, value: text.trim() }
        : invalid("Must be a decimal number.");
    }
    case "integer": {
      const value =
        typeof raw === "string" && /^-?\d{1,15}$/.test(raw.trim()) ? Number(raw.trim()) : raw;
      if (typeof value !== "number" || !Number.isSafeInteger(value))
        return invalid("Must be a whole number.");
      if (spec.min !== undefined && value < spec.min)
        return invalid(`Must be at least ${spec.min}.`);
      if (spec.max !== undefined && value > spec.max)
        return invalid(`Must be at most ${spec.max}.`);
      return { ok: true, value };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true" || raw === "false") return { ok: true, value: raw === "true" };
      return invalid("Must be true or false.");
    }
    case "enum":
      return typeof raw === "string" && spec.values.includes(raw.trim())
        ? { ok: true, value: raw.trim() }
        : invalid("Choose one of the allowed values.");
    case "textArray": {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
        return invalid("Must be a list of text values.");
      }
      const value = (raw as string[]).map((item) => item.trim()).filter((item) => item.length > 0);
      if (value.length > (spec.max ?? 50)) return invalid("Too many values.");
      if (value.some((item) => item.length > DEFAULT_TEXT_MAX || CONTROL_CHARS.test(item))) {
        return invalid("Contains an invalid value.");
      }
      return { ok: true, value };
    }
    case "json": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        return invalid("Must be an object.");
      let encoded: string;
      try {
        encoded = JSON.stringify(raw);
      } catch {
        return invalid("Must be plain JSON.");
      }
      if (encoded.length > 10_000) return invalid("Too large.");
      return { ok: true, value: JSON.parse(encoded) as unknown };
    }
  }
}

export type ParseMode = {
  /** Create: required fields must be present. Update: only sent fields are checked. */
  partial?: boolean;
};

/** Validates `input` against `schema`, throwing an `invalid_input` AdminActionError on failure. */
export function parseInput(schema: Schema, input: unknown, mode: ParseMode = {}): Values {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new AdminActionError("invalid_input", "input is not an object");
  }
  const errors: Record<string, string> = {};
  const values: Values = {};

  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) {
      errors[key] = "This field cannot be set.";
    }
  }

  for (const [key, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(input, key);
    const raw = present ? (input as Record<string, unknown>)[key] : undefined;
    if (!present && mode.partial) continue;
    if (isEmpty(raw)) {
      if (spec.required) errors[key] = "This field is required.";
      else if (present) values[key] = null;
      continue;
    }
    const parsed = parseField(spec, raw);
    if (parsed.ok) values[key] = parsed.value;
    else errors[key] = parsed.message;
  }

  if (mode.partial && Object.keys(values).length === 0 && Object.keys(errors).length === 0) {
    throw new AdminActionError("invalid_input", "no fields to update", {
      fieldErrors: { _form: "Change at least one field." },
    });
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminActionError("invalid_input", "input failed validation", { fieldErrors: errors });
  }
  return values;
}
