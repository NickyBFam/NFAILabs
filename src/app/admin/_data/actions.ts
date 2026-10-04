"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { checkField, formValues } from "@/components/admin/draft-fields";
import { areaOf, isAdminRecordTable, isFactTable } from "@/components/admin/labels";
import { recordHref } from "@/components/admin/record-links";
import type { ActionResult, AdminRecordTable, WorkflowAction } from "@/components/admin/types";
import { recordFields, requiresSourceOnCreate, sourceFields } from "@/app/admin/_data/forms";
import type { AdminResult } from "@/lib/admin/mutations/result";
import * as admin from "@/lib/admin/mutations/server";
import { requireAdmin } from "@/lib/auth/server";

/**
 * FormData bindings for admin forms. Each action re-verifies the session here, and the
 * mutation layer then authenticates, checks the permission, validates against its
 * allowlist and makes one `nfai_admin_*` call with the admin's own token. Nothing the
 * browser sends can choose the actor, a role or a target state: only the table, record
 * id, workflow step and form fields are read, and the server decides the rest.
 */

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function toActionResult(result: AdminResult, success: string): ActionResult {
  if (result.ok) return { status: "success", message: success, recordId: result.id };
  return result.fieldErrors
    ? { status: "error", message: result.message, fieldErrors: result.fieldErrors }
    : { status: "error", message: result.message };
}

const unknownTable: ActionResult = { status: "error", message: "Unknown record type." };

function tableFrom(formData: FormData): AdminRecordTable | null {
  const table = text(formData, "table");
  return isAdminRecordTable(table) ? table : null;
}

function sourceInput(formData: FormData): Record<string, unknown> {
  return formValues(sourceFields(false), formData);
}

/** Creates a draft (or a source registry entry), citing its source in the same submission. */
export async function createRecordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const table = tableFrom(formData);
  if (!table) return unknownTable;

  const needsSource = requiresSourceOnCreate(table);
  if (needsSource) {
    // Check the citation before anything is written, so a fact is never created
    // without the source its form required.
    const errors: Record<string, string> = {};
    for (const field of sourceFields(true)) {
      const message = checkField(field, formData);
      if (message) errors[field.name] = message;
    }
    if (Object.keys(errors).length > 0) {
      return {
        status: "error",
        message: "Some fields are missing or invalid.",
        fieldErrors: errors,
      };
    }
  }

  const values = formValues(recordFields(table), formData);
  const created =
    table === "sources"
      ? await admin.createSource(values)
      : table === "source_documents"
        ? await admin.createSourceDocument(values)
        : await admin.createDraft({ table, values });
  if (!created.ok || !created.id) return toActionResult(created, "");

  let destination = recordHref(table, created.id);
  if (needsSource) {
    const attached = await admin.attachSource({ table, id: created.id, ...sourceInput(formData) });
    if (!attached.ok) destination += "?notice=source-not-attached";
  }
  redirect(destination);
}

/** Saves changes to an unsubmitted draft. Emptied optional fields are cleared. */
export async function updateRecordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const table = tableFrom(formData);
  if (!table || !isFactTable(table)) return unknownTable;
  const id = text(formData, "recordId");
  const values = formValues(recordFields(table), formData, { clearEmpty: true });
  const result = await admin.updateDraft({ table, id, values });
  if (!result.ok) return toActionResult(result, "");
  redirect(recordHref(table, id));
}

/** Cites a source document for an existing record. */
export async function attachSourceAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const table = tableFrom(formData);
  if (!table || !isFactTable(table)) return unknownTable;
  const result = await admin.attachSource({
    table,
    id: text(formData, "recordId"),
    ...sourceInput(formData),
  });
  if (result.ok) refresh();
  return toActionResult(result, "Source attached.");
}

const workflowSuccess: Record<WorkflowAction, string> = {
  submit_review: "Submitted for review.",
  recall: "Submission recalled.",
  validate: "Validated.",
  publish: "Published.",
  return_to_draft: "Returned to draft.",
  reject: "Rejected.",
  supersede: "Superseded by the replacement record.",
  withdraw: "Withdrawn.",
  close_period: "Effective period closed.",
  delete_draft: "Draft deleted.",
};

function isWorkflowAction(value: string): value is WorkflowAction {
  return Object.hasOwn(workflowSuccess, value);
}

/** One workflow step on one record. The database enforces every rule again. */
export async function workflowAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const table = tableFrom(formData);
  if (!table || !isFactTable(table)) return unknownTable;
  const action = text(formData, "action");
  if (!isWorkflowAction(action)) return { status: "error", message: "Unknown action." };

  const id = text(formData, "recordId");
  const reason = text(formData, "reason");
  const reasonCode = text(formData, "reasonCode") || undefined;
  const target = { table, id };

  let result: AdminResult;
  switch (action) {
    case "submit_review":
      result = await admin.submitForReview(target);
      break;
    case "recall":
      result = await admin.retractSubmission({ ...target, reason });
      break;
    case "validate":
      result = await admin.validateRecord(target);
      break;
    case "publish":
      result = await admin.publishRecord(target);
      break;
    case "return_to_draft":
      result = await admin.returnToDraft({ ...target, reason });
      break;
    case "reject":
      result = await admin.rejectRecord({ ...target, reason, reasonCode });
      break;
    case "withdraw":
      result = await admin.withdrawRecord({ ...target, reason, reasonCode });
      break;
    case "supersede":
      result = await admin.supersedeRecord({
        table,
        oldId: id,
        newId: text(formData, "newId"),
        kind: text(formData, "kind") || undefined,
        reason,
      });
      break;
    case "close_period": {
      const validTo = text(formData, "validTo");
      result = await admin.closePeriod({
        ...target,
        validTo: validTo ? `${validTo.length === 16 ? `${validTo}:00` : validTo}Z` : "",
        reason,
      });
      break;
    }
    case "delete_draft":
      result = await admin.deleteDraft({ ...target, reason });
      if (result.ok) redirect(`/admin/${areaOf(table)}`);
      break;
  }

  if (result.ok) refresh();
  return toActionResult(result, workflowSuccess[action]);
}

/** Approves or retires a source registry entry (a reviewed decision with a reason). */
export async function setSourceStatusAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const status = text(formData, "status");
  const result = await admin.setSourceStatus({
    sourceId: text(formData, "recordId"),
    status,
    reason: text(formData, "reason"),
  });
  if (result.ok) refresh();
  return toActionResult(result, status === "approved" ? "Source approved." : "Source retired.");
}

const accessSuccess = {
  create_identity: "Identity created.",
  set_status: "Status changed.",
  grant_role: "Role granted.",
  revoke_role: "Role revoked.",
  rename: "Name changed.",
} as const;

type AccessOperation = keyof typeof accessSuccess;

function isAccessOperation(value: string): value is AccessOperation {
  return Object.hasOwn(accessSuccess, value);
}

/**
 * Identity and role changes (manage_admins). Self-changes are refused by the database;
 * the page also hides them on the viewer's own row.
 */
export async function accessAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const op = text(formData, "op");
  if (!isAccessOperation(op)) return { status: "error", message: "Unknown change." };

  const adminId = text(formData, "adminId");
  const reason = text(formData, "reason");
  let result: AdminResult;
  switch (op) {
    case "create_identity":
      result = await admin.createIdentity({
        authUserId: text(formData, "authUserId"),
        displayName: text(formData, "displayName"),
        reason,
      });
      break;
    case "set_status":
      result = await admin.setIdentityStatus({ adminId, status: text(formData, "status"), reason });
      break;
    case "grant_role":
      result = await admin.grantRole({ adminId, role: text(formData, "role"), reason });
      break;
    case "revoke_role":
      result = await admin.revokeRole({ adminId, role: text(formData, "role"), reason });
      break;
    case "rename":
      result = await admin.setDisplayName({
        adminId,
        displayName: text(formData, "displayName"),
        reason,
      });
      break;
  }
  if (result.ok) refresh();
  return toActionResult(result, accessSuccess[op]);
}
