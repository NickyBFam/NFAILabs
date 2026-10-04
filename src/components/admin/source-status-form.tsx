"use client";

import { useActionState } from "react";
import { FormResult, SubmitButton, submitWithoutReset } from "@/components/admin/form-controls";
import { inputClass } from "@/components/admin/styles";
import { idleResult, type ActionResult } from "@/components/admin/types";

type SourceStatusFormProps = {
  sourceId: string;
  status: "proposed" | "approved" | "retired";
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
};

/**
 * Review decision for a source registry entry. Approving a source lets it count toward
 * the publication gate (when its tier is T1 to T3); retiring keeps it for history only.
 */
export function SourceStatusForm({ sourceId, status, action }: SourceStatusFormProps) {
  const [result, dispatch, pending] = useActionState(action, idleResult);
  const choices =
    status === "proposed"
      ? (["approved", "retired"] as const)
      : status === "approved"
        ? (["retired"] as const)
        : ([] as const);

  if (choices.length === 0) {
    return <p className="text-sm text-muted">Retired sources cannot be changed.</p>;
  }

  return (
    <form onSubmit={submitWithoutReset(dispatch)} className="max-w-md space-y-3">
      <FormResult result={result} idPrefix="source-status" />
      <input type="hidden" name="recordId" value={sourceId} />
      <fieldset>
        <legend className="text-sm font-medium">New status</legend>
        <div className="mt-2 flex gap-4">
          {choices.map((choice, index) => (
            <label key={choice} className="flex items-center gap-2 text-sm">
              <input type="radio" name="status" value={choice} defaultChecked={index === 0} />
              {choice === "approved" ? "Approved" : "Retired"}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="source-status-reason" className="block text-sm font-medium">
          Reason
        </label>
        <textarea
          id="source-status-reason"
          name="reason"
          required
          rows={2}
          maxLength={2000}
          className={`${inputClass} mt-1`}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel="Working…">
        Save status
      </SubmitButton>
    </form>
  );
}
