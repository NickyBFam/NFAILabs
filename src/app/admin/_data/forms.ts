import "server-only";
import {
  humanizeColumn,
  optionsFrom,
  yesNoOptions,
  type FieldOption,
  type FormFieldDef,
} from "@/components/admin/draft-fields";
import type { AdminRecordTable } from "@/components/admin/types";
import {
  ADMIN_ENTITIES,
  ATTACH_SOURCE_FIELDS,
  PROVENANCE_ROLES,
  SOURCE_DOCUMENT_FIELDS,
  SOURCE_FIELDS,
} from "@/lib/admin/mutations/entities";
import type { FieldSpec, Schema } from "@/lib/admin/mutations/validation";

/**
 * Builds entry forms from the mutation layer's own allowlists, so a form can only ever
 * offer columns the server accepts. Presentation (labels, help, choice lists, which table
 * a reference points to) is layered on top here.
 */

/** Which table each reference column points to. */
const referenceTargets: Readonly<Record<string, AdminRecordTable>> = {
  provider_id: "providers",
  deployment_channel_id: "deployment_channels",
  model_family_id: "model_families",
  model_version_id: "model_versions",
  base_model_version_id: "model_versions",
  capability_id: "capabilities",
  benchmark_id: "benchmarks",
  benchmark_version_id: "benchmark_versions",
  benchmark_metric_id: "benchmark_metrics",
  evaluation_harness_id: "evaluation_harnesses",
  evaluation_harness_version_id: "evaluation_harness_versions",
  evaluation_configuration_id: "evaluation_configurations",
  source_id: "sources",
  sourceDocumentId: "source_documents",
};

const toolAccessOptions: FieldOption[] = optionsFrom([
  "none",
  "code_execution",
  "web_search",
  "web_browsing",
  "file_system",
  "custom_tools",
  "undisclosed",
]);

const billingDimensions = [
  "input_tokens",
  "output_tokens",
  "cached_input_read_tokens",
  "cached_input_write_tokens",
  "reasoning_tokens",
  "image_input",
  "image_output",
  "audio_input",
  "audio_output",
  "video_input",
  "video_output",
  "request",
  "tool_call",
  "other",
];

const labelOverrides: Readonly<Record<string, string>> = {
  slug: "Slug",
  website_url: "Website URL",
  homepage_url: "Homepage URL",
  original_url: "Original URL",
  source_code_url: "Source code URL",
  top_p: "Top-p",
  valid_from: "In effect from (UTC)",
  valid_to: "In effect until (UTC)",
  price_amount: "Price",
  score_ci_lower: "Confidence interval, lower",
  score_ci_upper: "Confidence interval, upper",
  sourceDocumentId: "Source document",
  sourceObservationId: "Source observation ID",
  evidenceNote: "Evidence note",
  locator: "Location in the document",
  role: "Role of this source",
};

const helpText: Readonly<Record<string, string>> = {
  slug: "Lowercase letters, digits and single hyphens. Used in URLs; not the record's identity.",
  description: "NFAI's own short summary. Never copy text from the source.",
  valid_from: "Date-only sources are entered at 00:00 UTC.",
  currency: "Three-letter ISO 4217 code.",
  price_amount:
    "Price per unit quantity, in the currency above. Leave unknown prices out entirely.",
  score: "Exactly as reported by the source. Never estimated or rounded.",
  evaluated_on: "When the model was actually run, not when the result was reported.",
  tool_access: "None and Undisclosed must be chosen on their own.",
  allowed_values: "One value per line.",
  extra_settings: "Only settings that have no field above, as a JSON object.",
  evidenceNote: "Your own short note on what the source supports. Not a quotation.",
  locator: "Section, table, anchor or page.",
  citation_text: "A bibliographic reference, not an excerpt.",
};

function fieldFrom(name: string, spec: FieldSpec): FormFieldDef {
  const base = {
    name,
    label: labelOverrides[name] ?? humanizeColumn(name),
    required: spec.required ?? false,
    help: helpText[name],
  };
  if (name === "tool_access") return { ...base, kind: "multi", options: toolAccessOptions };
  if (name === "billing_dimension") {
    return { ...base, kind: "select", options: optionsFrom(billingDimensions) };
  }
  switch (spec.kind) {
    case "text":
      return { ...base, kind: spec.multiline ? "textarea" : "text", max: spec.max };
    case "slug":
      return { ...base, kind: "slug" };
    case "url":
      return { ...base, kind: "url" };
    case "uuid":
      return referenceTargets[name] ? { ...base, kind: "reference" } : { ...base, kind: "text" };
    case "date":
      return { ...base, kind: "date" };
    case "timestamp":
      return { ...base, kind: "datetime" };
    case "decimal":
      return { ...base, kind: "decimal" };
    case "integer":
      return { ...base, kind: "integer", min: spec.min };
    case "boolean":
      return { ...base, kind: "boolean", options: yesNoOptions };
    case "enum":
      return { ...base, kind: "select", options: optionsFrom(spec.values) };
    case "textArray":
      return { ...base, kind: "lines" };
    case "json":
      return { ...base, kind: "json" };
  }
}

function fieldsFromSchema(schema: Schema): FormFieldDef[] {
  return Object.entries(schema).map(([name, spec]) => fieldFrom(name, spec));
}

export function schemaFor(table: AdminRecordTable): Schema {
  if (table === "sources") return SOURCE_FIELDS;
  if (table === "source_documents") return SOURCE_DOCUMENT_FIELDS;
  return ADMIN_ENTITIES[table].fields;
}

/** Content fields for a record type (no options loaded). */
export function recordFields(table: AdminRecordTable): FormFieldDef[] {
  return fieldsFromSchema(schemaFor(table));
}

/** Whether new records of this type must be created with a supporting source (D-028). */
export function requiresSourceOnCreate(table: AdminRecordTable): boolean {
  if (table === "sources" || table === "source_documents") return false;
  // Capability definitions and evaluation configurations are registered without a
  // provenance requirement (0003); the source is cited on the facts that use them.
  return table !== "capabilities" && table !== "evaluation_configurations";
}

/**
 * Fields for citing a source. When `required`, every new fact carries its source from the
 * first save, so nothing reaches review without provenance.
 */
export function sourceFields(required: boolean): FormFieldDef[] {
  return fieldsFromSchema(ATTACH_SOURCE_FIELDS)
    .filter((field) => field.name !== "sourceObservationId")
    .map((field) => {
      if (field.name === "role") {
        return {
          ...field,
          required,
          options: optionsFrom(PROVENANCE_ROLES),
          defaultValue: "primary",
        };
      }
      return field.name === "sourceDocumentId" ? { ...field, required } : field;
    });
}

/** Fills reference choices with one loader call per referenced table. */
export async function withOptions(
  fields: readonly FormFieldDef[],
  load: (table: AdminRecordTable) => Promise<FieldOption[]>,
): Promise<FormFieldDef[]> {
  const cache = new Map<AdminRecordTable, Promise<FieldOption[]>>();
  return Promise.all(
    fields.map(async (field) => {
      const target = referenceTargets[field.name];
      if (field.kind !== "reference" || !target) return field;
      if (!cache.has(target)) cache.set(target, load(target));
      return { ...field, options: await (cache.get(target) as Promise<FieldOption[]>) };
    }),
  );
}

/** Prefills fields from a record's current values (edit form). */
export function withValues(
  fields: readonly FormFieldDef[],
  values: Readonly<Record<string, string | readonly string[] | null>>,
): FormFieldDef[] {
  return fields.map((field) => {
    const value = values[field.name];
    if (value === null || value === undefined) return field;
    if (Array.isArray(value)) {
      return field.kind === "multi"
        ? { ...field, defaultValues: value }
        : { ...field, defaultValue: value.join("\n") };
    }
    const text = value as string;
    if (field.kind === "datetime") return { ...field, defaultValue: text.slice(0, 16) };
    return { ...field, defaultValue: text };
  });
}
