"use client";

import { useActionState, useId } from "react";
import { FormResult, SubmitButton, submitWithoutReset } from "@/components/admin/form-controls";
import { roleLabels } from "@/components/admin/labels";
import { buttonClass, inputClass } from "@/components/admin/styles";
import {
  idleResult,
  type ActionResult,
  type AdminIdentityView,
  type AdminRole,
} from "@/components/admin/types";

export type AccessServerAction = (
  previous: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

type IdentityActionsProps = {
  identity: AdminIdentityView;
  runAction: AccessServerAction;
};

const allRoles = Object.keys(roleLabels) as AdminRole[];

/**
 * Access changes for one identity: disable or re-enable, grant or revoke a role. Each
 * needs a reason, which is kept in the role and audit history. Nothing is offered on the
 * viewer's own row; the database refuses self-changes as well.
 */
export function IdentityActions({ identity, runAction }: IdentityActionsProps) {
  const [result, dispatch, pending] = useActionState(runAction, idleResult);
  const id = useId();

  if (identity.isSelf) {
    return <p className="text-xs text-muted">Another administrator must change your access.</p>;
  }

  const grantable = allRoles.filter((role) => !identity.activeRoles.includes(role));
  const disabled = identity.status === "disabled";

  return (
    <div className="space-y-2">
      <FormResult result={result} idPrefix={`${id}-access`} />
      <div className="flex flex-wrap gap-2">
        <ChangeForm
          id={`${id}-status`}
          summary={disabled ? "Re-enable…" : "Disable…"}
          tone={disabled ? "secondary" : "danger"}
          dispatch={dispatch}
          pending={pending}
          hidden={{
            op: "set_status",
            adminId: identity.id,
            status: disabled ? "active" : "disabled",
          }}
          confirm={
            disabled ? `Re-enable ${identity.displayName}` : `Disable ${identity.displayName}`
          }
        />
        {grantable.length > 0 ? (
          <ChangeForm
            id={`${id}-grant`}
            summary="Grant role…"
            dispatch={dispatch}
            pending={pending}
            hidden={{ op: "grant_role", adminId: identity.id }}
            roles={grantable}
            confirm="Grant role"
          />
        ) : null}
        {identity.activeRoles.length > 0 ? (
          <ChangeForm
            id={`${id}-revoke`}
            summary="Revoke role…"
            tone="danger"
            dispatch={dispatch}
            pending={pending}
            hidden={{ op: "revoke_role", adminId: identity.id }}
            roles={identity.activeRoles}
            confirm="Revoke role"
          />
        ) : null}
        <ChangeForm
          id={`${id}-rename`}
          summary="Rename…"
          dispatch={dispatch}
          pending={pending}
          hidden={{ op: "rename", adminId: identity.id }}
          currentName={identity.displayName}
          confirm="Save name"
        />
      </div>
    </div>
  );
}

type ChangeFormProps = {
  id: string;
  summary: string;
  confirm: string;
  tone?: "secondary" | "danger";
  hidden: Readonly<Record<string, string>>;
  roles?: readonly AdminRole[];
  /** Current display name, when the form renames the identity. */
  currentName?: string;
  dispatch: (formData: FormData) => void;
  pending: boolean;
};

function ChangeForm({
  id,
  summary,
  confirm,
  tone = "secondary",
  hidden,
  roles,
  currentName,
  dispatch,
  pending,
}: ChangeFormProps) {
  return (
    <details className="rounded-md border border-line bg-surface">
      <summary className={`${buttonClass(tone)} cursor-pointer list-none`}>{summary}</summary>
      <form onSubmit={submitWithoutReset(dispatch)} className="w-72 max-w-full space-y-3 p-3">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {currentName !== undefined ? (
          <div>
            <label htmlFor={`${id}-name`} className="block text-sm font-medium">
              Display name
            </label>
            <input
              id={`${id}-name`}
              name="displayName"
              required
              maxLength={120}
              defaultValue={currentName}
              className={`${inputClass} mt-1`}
            />
          </div>
        ) : null}
        {roles ? (
          <div>
            <label htmlFor={`${id}-role`} className="block text-sm font-medium">
              Role
            </label>
            <select id={`${id}-role`} name="role" required className={`${inputClass} mt-1`}>
              <option value="">Choose a role</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor={`${id}-reason`} className="block text-sm font-medium">
            Reason
          </label>
          <textarea
            id={`${id}-reason`}
            name="reason"
            required
            rows={2}
            maxLength={2000}
            className={`${inputClass} mt-1`}
          />
        </div>
        <SubmitButton
          tone={tone === "danger" ? "danger" : "primary"}
          pending={pending}
          pendingLabel="Working…"
        >
          {confirm}
        </SubmitButton>
      </form>
    </details>
  );
}
