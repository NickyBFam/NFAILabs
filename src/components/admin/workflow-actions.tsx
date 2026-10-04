"use client";

import { useActionState, useId } from "react";
import { FormResult, SubmitButton, submitWithoutReset } from "@/components/admin/form-controls";
import { buttonClass, inputClass } from "@/components/admin/styles";
import {
  actionLabels,
  actionsRequiringReason,
  actionsWithForm,
  actionsWithReasonCode,
  destructiveActions,
  reasonCodeLabels,
} from "@/components/admin/labels";
import {
  idleResult,
  type ActionAvailability,
  type ActionResult,
  type FactTable,
  type ReasonCode,
  type WorkflowAction,
} from "@/components/admin/types";

export type WorkflowServerAction = (
  previous: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

type WorkflowActionsProps = {
  table: FactTable;
  recordId: string;
  /** Actions the server offers this viewer for this record. */
  actions: readonly ActionAvailability[];
  runAction: WorkflowServerAction;
};

/**
 * Workflow controls for one record. Only actions the server offered are rendered, and a
 * disabled action says why. The server re-checks identity, permission, state,
 * provenance and separation of duties when the action is submitted.
 */
export function WorkflowActions({ table, recordId, actions, runAction }: WorkflowActionsProps) {
  const [result, dispatch, pending] = useActionState(runAction, idleResult);

  if (actions.length === 0) {
    return <p className="text-sm text-muted">No workflow actions are available to you.</p>;
  }

  return (
    <div className="space-y-3">
      <FormResult result={result} idPrefix="workflow" />
      <ul className="flex flex-wrap items-start gap-2">
        {actions.map((availability) => (
          <li key={availability.action}>
            <ActionControl
              table={table}
              recordId={recordId}
              availability={availability}
              dispatch={dispatch}
              pending={pending}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

type ActionControlProps = {
  table: FactTable;
  recordId: string;
  availability: ActionAvailability;
  dispatch: (formData: FormData) => void;
  pending: boolean;
};

function ActionControl({ table, recordId, availability, dispatch, pending }: ActionControlProps) {
  const id = useId();
  const { action, enabled, disabledReason } = availability;
  const label = actionLabels[action];
  const danger = destructiveActions.has(action);
  const hidden = (
    <>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="action" value={action} />
    </>
  );

  if (!enabled) {
    return (
      <div className="max-w-xs">
        <button
          type="button"
          className={buttonClass("secondary")}
          disabled
          aria-describedby={`${id}-why`}
        >
          {label}
        </button>
        <p id={`${id}-why`} className="mt-1 text-xs text-muted">
          {disabledReason ?? "Not available in the current state."}
        </p>
      </div>
    );
  }

  if (!actionsWithForm.has(action)) {
    return (
      <form onSubmit={submitWithoutReset(dispatch)}>
        {hidden}
        <SubmitButton tone="secondary" pending={pending} pendingLabel="Working…">
          {label}
        </SubmitButton>
      </form>
    );
  }

  return (
    <details className="rounded-md border border-line bg-surface">
      <summary
        className={`${buttonClass(danger ? "danger" : "secondary")} cursor-pointer list-none`}
      >
        {label}…
      </summary>
      <form onSubmit={submitWithoutReset(dispatch)} className="w-80 max-w-full space-y-3 p-3">
        {hidden}
        {action === "supersede" ? <SupersedeFields id={id} /> : null}
        {action === "close_period" ? <ClosePeriodField id={id} /> : null}
        {actionsWithReasonCode.has(action) ? <ReasonCodeField id={id} /> : null}
        {actionsRequiringReason.has(action) ? <ReasonField id={id} action={action} /> : null}
        <SubmitButton
          tone={danger ? "danger" : "primary"}
          pending={pending}
          pendingLabel="Working…"
        >
          Confirm: {label.toLowerCase()}
        </SubmitButton>
      </form>
    </details>
  );
}

const reasonCodes = Object.entries(reasonCodeLabels) as [ReasonCode, string][];

function ReasonCodeField({ id }: { id: string }) {
  return (
    <div>
      <label htmlFor={`${id}-code`} className="block text-sm font-medium">
        Reason type
      </label>
      <select id={`${id}-code`} name="reasonCode" required className={`${inputClass} mt-1`}>
        <option value="">Choose a reason type</option>
        {reasonCodes.map(([code, text]) => (
          <option key={code} value={code}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReasonField({ id, action }: { id: string; action: WorkflowAction }) {
  return (
    <div>
      <label htmlFor={`${id}-reason`} className="block text-sm font-medium">
        Reason
      </label>
      <textarea
        id={`${id}-reason`}
        name="reason"
        required
        minLength={3}
        maxLength={2000}
        rows={3}
        aria-describedby={`${id}-reason-help`}
        className={`${inputClass} mt-1`}
      />
      <p id={`${id}-reason-help`} className="mt-1 text-xs text-muted">
        Kept permanently in this record&apos;s history ({actionLabels[action].toLowerCase()}).
      </p>
    </div>
  );
}

function SupersedeFields({ id }: { id: string }) {
  return (
    <>
      <div>
        <label htmlFor={`${id}-replacement`} className="block text-sm font-medium">
          Replacement record ID
        </label>
        <input
          id={`${id}-replacement`}
          name="newId"
          required
          pattern="[0-9a-fA-F\-]{36}"
          aria-describedby={`${id}-replacement-help`}
          className={`${inputClass} mt-1 font-mono`}
        />
        <p id={`${id}-replacement-help`} className="mt-1 text-xs text-muted">
          A validated record of the same type that corrects this one. It is published in the same
          step.
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-kind`} className="block text-sm font-medium">
          Kind of replacement
        </label>
        <select
          id={`${id}-kind`}
          name="kind"
          className={`${inputClass} mt-1`}
          defaultValue="correction"
        >
          <option value="correction">Correction</option>
          <option value="restatement">Restatement</option>
          <option value="duplicate_merge">Duplicate merge</option>
        </select>
      </div>
    </>
  );
}

function ClosePeriodField({ id }: { id: string }) {
  return (
    <div>
      <label htmlFor={`${id}-valid-to`} className="block text-sm font-medium">
        No longer in effect from (UTC)
      </label>
      <input
        id={`${id}-valid-to`}
        name="validTo"
        type="datetime-local"
        required
        aria-describedby={`${id}-valid-to-help`}
        className={`${inputClass} mt-1`}
      />
      <p id={`${id}-valid-to-help`} className="mt-1 text-xs text-muted">
        Ends this record&apos;s effective period, for example when a new price takes over. It can be
        set only once.
      </p>
    </div>
  );
}
