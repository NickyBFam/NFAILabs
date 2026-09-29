import { invalidData } from "@/lib/data/errors";
import { isPublicState } from "@/lib/data/queries/history";
import type { PublicFactState } from "@/lib/data/domain";
import type { NumericValue } from "@/types/database";

/** A PostgREST numeric as a finite number (scores, bounds, sampling settings). */
export function toNumber(value: NumericValue, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || (typeof value === "string" && value.trim() === "")) {
    throw invalidData("mapper", `${field} is not a finite number`);
  }
  return number;
}

export function toNumberOrNull(value: NumericValue | null, field: string): number | null {
  return value === null ? null : toNumber(value, field);
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Rewrites JavaScript's shortest round-trip form (e.g. "1e-7") as plain decimal digits. */
function expandExponent(text: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, whole = "", fraction = "", exponentText = "0"] = match;
  const digits = whole + fraction;
  const point = whole.length + Number(exponentText);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * A PostgREST numeric as an exact decimal string (money, quantities). Strings
 * pass through unchanged; numbers are written without exponent notation.
 */
export function toDecimalString(value: NumericValue, field: string): string {
  let text: string;
  if (typeof value === "string") {
    text = value.trim();
  } else if (Number.isFinite(value)) {
    text = expandExponent(String(value));
  } else {
    throw invalidData("mapper", `${field} is not a finite number`);
  }
  if (!DECIMAL.test(text)) {
    throw invalidData("mapper", `${field} is not a decimal`);
  }
  return text;
}

/** Narrows a row's state to a publicly visible one, or throws: internal states never map. */
export function toPublicFactState(state: string, operation: string): PublicFactState {
  if (!isPublicState(state)) {
    throw invalidData(operation, "row is not in a public publication state");
  }
  return state as PublicFactState;
}
