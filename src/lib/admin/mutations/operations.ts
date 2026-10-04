import type { AdminContext } from "@/lib/admin/mutations/context";
import {
  ATTACH_SOURCE_FIELDS,
  type AdminEntity,
  REASON_CODES,
  resolveEntity,
  SOURCE_DOCUMENT_FIELDS,
  SOURCE_FIELDS,
  SUPERSESSION_KINDS,
} from "@/lib/admin/mutations/entities";
import { AdminActionError } from "@/lib/admin/mutations/errors";
import {
  callRpc,
  type MutationDefinition,
  returnedId,
  runAdminMutation,
} from "@/lib/admin/mutations/pipeline";
import type { AdminResult } from "@/lib/admin/mutations/result";
import { parseInput, type Schema, type Values } from "@/lib/admin/mutations/validation";

/**
 * Trusted server-side admin operations. Each validates its input against an
 * allowlist and makes exactly one call to the matching `nfai_admin_*` SQL
 * function (docs/ADMIN.md §5), which re-checks identity, permission, workflow
 * state, provenance and separation of duties before anything is written.
 *
 * These are plain server functions; `"use server"` wrappers that decode
 * FormData live with the admin routes. They never throw for expected failures.
 */

// ---------------------------------------------------------------------------
// Input envelopes
// ---------------------------------------------------------------------------

type Target = { entity: AdminEntity; id: string };

const REASON = { kind: "text", required: true, multiline: true, max: 2000 } as const;
const NOTE = { kind: "text", multiline: true, max: 2000 } as const;

function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AdminActionError("invalid_input", "input is not an object");
  }
  return raw as Record<string, unknown>;
}

function entityOf(raw: Record<string, unknown>): AdminEntity {
  const entity = resolveEntity(raw.table);
  if (!entity) {
    throw new AdminActionError("invalid_input", "unknown table", {
      fieldErrors: { table: "Unknown record type." },
    });
  }
  return entity;
}

/** Splits `{ table, ...rest }`, validating `rest` (plus `id` when required) against `schema`. */
function parseTargeted(raw: unknown, schema: Schema): Target & { values: Values } {
  const { table: _table, ...rest } = asObject(raw);
  void _table;
  const entity = entityOf(asObject(raw));
  const values = parseInput({ id: { kind: "uuid", required: true }, ...schema }, rest);
  const { id, ...remaining } = values;
  return { entity, id: id as string, values: remaining };
}

function tableContext(input: { entity?: AdminEntity } | undefined) {
  return input?.entity
    ? { table: input.entity.table, fields: Object.keys(input.entity.fields) }
    : {};
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

type DraftInput = { entity: AdminEntity; values: Values };
type DraftUpdateInput = DraftInput & { id: string };

const createDraftDefinition: MutationDefinition<DraftInput, never> = {
  name: "create_draft",
  permission: "edit_draft",
  parse(raw) {
    const input = asObject(raw);
    const entity = entityOf(input);
    return { entity, values: parseInput(entity.fields, input.values) };
  },
  async execute(db, { entity, values }) {
    const data = await callRpc(db, "nfai_admin_create_draft", {
      p_table: entity.table,
      p_values: values,
    });
    return { id: returnedId(data) };
  },
  errorContext: tableContext,
};

const updateDraftDefinition: MutationDefinition<DraftUpdateInput, never> = {
  name: "update_draft",
  permission: "edit_draft",
  parse(raw) {
    const input = asObject(raw);
    const entity = entityOf(input);
    const { id } = parseInput({ id: { kind: "uuid", required: true } }, { id: input.id });
    return {
      entity,
      id: id as string,
      values: parseInput(entity.fields, input.values, { partial: true }),
    };
  },
  async execute(db, { entity, id, values }) {
    await callRpc(db, "nfai_admin_update_draft", {
      p_table: entity.table,
      p_id: id,
      p_values: values,
    });
    return { id };
  },
  errorContext: tableContext,
};

function createRowDefinition(
  name: string,
  fn: string,
  schema: Schema,
  table: string,
): MutationDefinition<Values, never> {
  return {
    name,
    permission: "edit_draft",
    parse: (raw) => parseInput(schema, raw),
    async execute(db, values) {
      return { id: returnedId(await callRpc(db, fn, { p_values: values })) };
    },
    errorContext: () => ({ table, fields: Object.keys(schema) }),
  };
}

const createSourceDefinition = createRowDefinition(
  "create_source",
  "nfai_admin_create_source",
  SOURCE_FIELDS,
  "public.sources",
);
const createSourceDocumentDefinition = createRowDefinition(
  "create_source_document",
  "nfai_admin_create_source_document",
  SOURCE_DOCUMENT_FIELDS,
  "public.source_documents",
);

type AttachInput = Target & { values: Values };

const attachSourceDefinition: MutationDefinition<AttachInput, never> = {
  name: "attach_source",
  permission: "edit_draft",
  parse: (raw) => parseTargeted(raw, ATTACH_SOURCE_FIELDS),
  async execute(db, { entity, id, values }) {
    // Manual entry only: extraction method and confidence keep their database
    // defaults (manual, high); automated extraction is Phase 12.
    const data = await callRpc(db, "nfai_admin_attach_provenance", {
      p_values: {
        subject_table: entity.table,
        subject_id: id,
        source_document_id: values.sourceDocumentId,
        source_observation_id: values.sourceObservationId ?? null,
        role: values.role,
        locator: values.locator ?? null,
        evidence_note: values.evidenceNote ?? null,
      },
    });
    return { id: returnedId(data) };
  },
  errorContext: () => ({ table: "public.provenance_links", fields: [] }),
};

const revokeSourceDefinition: MutationDefinition<Values, never> = {
  name: "revoke_source",
  permission: "edit_draft",
  parse: (raw) => parseInput({ linkId: { kind: "uuid", required: true }, reason: REASON }, raw),
  async execute(db, values) {
    await callRpc(db, "nfai_admin_revoke_provenance", {
      p_link_id: values.linkId,
      p_reason: values.reason,
    });
    return { id: values.linkId as string };
  },
};

type StepInput = Target & { values: Values };

/** A workflow step on one record: `{ table, id, ...extra }` -> one rpc. */
function stepDefinition(
  name: string,
  permission: MutationDefinition<StepInput, never>["permission"],
  fn: string,
  extra: Schema,
  args: (values: Values) => Record<string, unknown>,
): MutationDefinition<StepInput, never> {
  return {
    name,
    permission,
    parse: (raw) => parseTargeted(raw, extra),
    async execute(db, { entity, id, values }) {
      await callRpc(db, fn, { p_table: entity.table, p_id: id, ...args(values) });
      return { id };
    },
    errorContext: tableContext,
  };
}

const withNote = (values: Values) => ({ p_note: values.note ?? null });
const withReason = (values: Values) => ({ p_reason: values.reason });
const withReasonCode = (values: Values) => ({
  p_reason: values.reason,
  p_reason_code: values.reasonCode ?? "other",
});
const REASON_WITH_CODE: Schema = {
  reason: REASON,
  reasonCode: { kind: "enum", values: REASON_CODES },
};

const submitDefinition = stepDefinition(
  "submit_review",
  "submit_review",
  "nfai_admin_submit",
  { note: NOTE },
  withNote,
);
const retractDefinition = stepDefinition(
  "retract_submission",
  "submit_review",
  "nfai_admin_recall_submission",
  { reason: REASON },
  withReason,
);
const validateDefinition = stepDefinition(
  "validate",
  "validate_fact",
  "nfai_admin_validate",
  { note: NOTE },
  withNote,
);
const returnToDraftDefinition = stepDefinition(
  "return_to_draft",
  "validate_fact",
  "nfai_admin_return_to_draft",
  { reason: REASON },
  withReason,
);
const publishDefinition = stepDefinition(
  "publish",
  "publish_fact",
  "nfai_admin_publish",
  { note: NOTE },
  withNote,
);
const rejectDefinition = stepDefinition(
  "reject",
  "reject_fact",
  "nfai_admin_reject",
  REASON_WITH_CODE,
  withReasonCode,
);
const withdrawDefinition = stepDefinition(
  "withdraw",
  "withdraw_fact",
  "nfai_admin_withdraw",
  REASON_WITH_CODE,
  withReasonCode,
);

const closePeriodDefinition = stepDefinition(
  "close_period",
  "publish_fact",
  "nfai_admin_close_period",
  { validTo: { kind: "timestamp", required: true }, reason: REASON },
  (values) => ({ p_valid_to: values.validTo, p_reason: values.reason }),
);

const setSourceStatusDefinition: MutationDefinition<Values, never> = {
  name: "set_source_status",
  permission: "publish_fact",
  parse: (raw) =>
    parseInput(
      {
        sourceId: { kind: "uuid", required: true },
        status: { kind: "enum", required: true, values: ["approved", "retired"] },
        reason: REASON,
      },
      raw,
    ),
  async execute(db, values) {
    await callRpc(db, "nfai_admin_set_source_status", {
      p_source_id: values.sourceId,
      p_status: values.status,
      p_reason: values.reason,
    });
    return { id: values.sourceId as string };
  },
};

type SupersedeInput = { entity: AdminEntity; values: Values };

const supersedeDefinition: MutationDefinition<SupersedeInput, never> = {
  name: "supersede",
  permission: "supersede_fact",
  parse(raw) {
    const { table: _table, ...rest } = asObject(raw);
    void _table;
    const entity = entityOf(asObject(raw));
    const values = parseInput(
      {
        oldId: { kind: "uuid", required: true },
        newId: { kind: "uuid", required: true },
        kind: { kind: "enum", values: SUPERSESSION_KINDS },
        reason: REASON,
      },
      rest,
    );
    if (values.oldId === values.newId) {
      throw new AdminActionError("invalid_input", "record supersedes itself", {
        fieldErrors: { newId: "Choose a different replacement record." },
      });
    }
    return { entity, values };
  },
  async execute(db, { entity, values }) {
    const data = await callRpc(db, "nfai_admin_supersede", {
      p_table: entity.table,
      p_old_id: values.oldId,
      p_new_id: values.newId,
      p_kind: values.kind ?? "correction",
      p_reason: values.reason,
    });
    return { id: returnedId(data) };
  },
  errorContext: tableContext,
};

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/** `{ table, values }`: a new draft row. Returns its id. */
export const createDraft = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, createDraftDefinition, input);

/** `{ table, id, values }`: changes editable fields of an unsubmitted draft. */
export const updateDraft = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, updateDraftDefinition, input);

/** Source registry entry (created `proposed`). Returns its id. */
export const createSource = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, createSourceDefinition, input);

/** Citable document of a source. Returns its id. */
export const createSourceDocument = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, createSourceDocumentDefinition, input);

/** `{ table, id, sourceDocumentId, role, locator?, evidenceNote?, sourceObservationId? }`. Returns the link id. */
export const attachSource = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, attachSourceDefinition, input);

/** `{ linkId, reason }`: revokes a provenance link (links are never deleted once reviewed). */
export const revokeSource = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, revokeSourceDefinition, input);

/** `{ table, id, note? }`: opens a review request on a draft. */
export const submitForReview = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, submitDefinition, input);

/** `{ table, id, reason }`: withdraws an open review request. */
export const retractSubmission = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, retractDefinition, input);

/** `{ table, id, note? }`: submitted draft or extracted -> validated. */
export const validateRecord = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, validateDefinition, input);

/** `{ table, id, reason }`: validated -> draft. */
export const returnToDraft = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, returnToDraftDefinition, input);

/** `{ table, id, note? }`: validated -> published (the approval step). */
export const publishRecord = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, publishDefinition, input);

/** `{ table, id, reason, reasonCode? }`: -> rejected. */
export const rejectRecord = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, rejectDefinition, input);

/** `{ table, oldId, newId, kind?, reason }`: publishes a validated replacement for a published row. */
export const supersedeRecord = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, supersedeDefinition, input);

/** `{ table, id, reason, reasonCode? }`: published -> withdrawn. */
export const withdrawRecord = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, withdrawDefinition, input);

/** `{ table, id, validTo, reason }`: ends the effective period of a published row (a change in the world). */
export const closePeriod = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, closePeriodDefinition, input);

/** `{ sourceId, status: "approved" | "retired", reason }`: reviews a source registry entry. */
export const setSourceStatus = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, setSourceStatusDefinition, input);

const deleteDraftDefinition = stepDefinition(
  "delete_draft",
  "edit_draft",
  "nfai_admin_delete_draft",
  { reason: REASON },
  withReason,
);

/** `{ table, id, reason }`: deletes a never-reviewed, unsubmitted draft (the deletion is audited). */
export const deleteDraft = (ctx: AdminContext, input: unknown): Promise<AdminResult> =>
  runAdminMutation(ctx, deleteDraftDefinition, input);
