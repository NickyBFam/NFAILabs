import type { Metadata } from "next";
import { AdminPageHeader, AdminSection } from "@/components/admin/admin-page-header";
import { AccessDenied } from "@/components/admin/access-denied";
import { DraftForm } from "@/components/admin/draft-form";
import { areaOf, isFactTable, tableLabels } from "@/components/admin/labels";
import { Notice } from "@/components/admin/notice";
import { ApprovalText, ProvenanceSummaryText } from "@/components/admin/provenance-summary";
import { ProvenanceList } from "@/components/admin/provenance-list";
import { PublicationHistory } from "@/components/admin/publication-history";
import { SourceStatusForm } from "@/components/admin/source-status-form";
import { StateBadge } from "@/components/admin/state-badge";
import { WorkflowActions } from "@/components/admin/workflow-actions";
import { ButtonLink } from "@/components/ui/button-link";
import {
  attachSourceAction,
  setSourceStatusAction,
  workflowAction,
} from "@/app/admin/_data/actions";
import { sourceFields, withOptions } from "@/app/admin/_data/forms";
import { loadRecordDetail, loadReferenceOptions } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

type Params = Promise<{ table: string; id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: "Record" };

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { table, id } = await params;
  const viewer = await loadViewer();
  if (!viewer.permissions.includes("view_admin")) {
    return <AccessDenied title="Record" permission="view_admin" />;
  }

  const record = await loadRecordDetail(table, id);
  const labels = tableLabels[record.table];
  const fact = isFactTable(record.table);
  const canCite = fact && viewer.permissions.includes("edit_draft");
  const sourceNotAttached = (await searchParams).notice === "source-not-attached";

  return (
    <>
      <AdminPageHeader
        title={record.label}
        description={`${labels.singular} · ${record.id}`}
        actions={
          <>
            {record.editable ? (
              <ButtonLink
                href={`/admin/records/${record.table}/${record.id}/edit`}
                variant="secondary"
              >
                Edit draft
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/admin/${areaOf(record.table)}`} variant="secondary">
              Back to {labels.plural.toLowerCase()}
            </ButtonLink>
          </>
        }
      />

      {sourceNotAttached ? (
        <Notice
          tone="error"
          title="The draft was saved, but its source was not attached"
          className="mt-6"
        >
          Attach the source below before submitting it for review.
        </Notice>
      ) : null}

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <dt className="text-sm text-muted">State</dt>
          <dd className="mt-1">
            {fact ? <StateBadge state={record.state} /> : (record.sourceStatus ?? "—")}
          </dd>
        </div>
        {record.provenanceSummary ? (
          <div className="rounded-lg border border-line bg-surface p-4">
            <dt className="text-sm text-muted">Provenance</dt>
            <dd className="mt-1 text-sm">
              <ProvenanceSummaryText summary={record.provenanceSummary} />
            </dd>
          </div>
        ) : null}
        {record.approval ? (
          <div className="rounded-lg border border-line bg-surface p-4">
            <dt className="text-sm text-muted">Approval</dt>
            <dd className="mt-1 text-sm">
              <ApprovalText approval={record.approval} />
            </dd>
          </div>
        ) : null}
      </dl>

      {isFactTable(record.table) ? (
        <AdminSection
          title="Workflow"
          description="Only the steps your permissions allow are shown. Each step is checked again on the server."
        >
          <WorkflowActions
            table={record.table}
            recordId={record.id}
            actions={record.actions}
            runAction={workflowAction}
          />
        </AdminSection>
      ) : null}

      {record.table === "sources" &&
      record.sourceStatus &&
      viewer.permissions.includes("publish_fact") ? (
        <AdminSection title="Source review">
          <SourceStatusForm
            sourceId={record.id}
            status={record.sourceStatus}
            action={setSourceStatusAction}
          />
        </AdminSection>
      ) : null}

      <AdminSection title="Content">
        <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
          {record.fields.map((field) => (
            <div key={field.label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-3">
              <dt className="font-medium text-muted">{field.label}</dt>
              <dd className="break-words sm:col-span-2">
                {field.value ?? <span className="text-muted">Not recorded</span>}
              </dd>
            </div>
          ))}
        </dl>
      </AdminSection>

      {fact ? (
        <AdminSection title="Sources">
          <ProvenanceList links={record.provenance} />
          {canCite ? (
            <div className="mt-4">
              <DraftForm
                groups={[
                  {
                    legend: "Cite another source",
                    fields: await withOptions(sourceFields(true), loadReferenceOptions),
                  },
                ]}
                action={attachSourceAction}
                submitLabel="Attach source"
                hidden={{ table: record.table, recordId: record.id }}
              />
            </div>
          ) : null}
        </AdminSection>
      ) : null}

      {fact ? (
        <AdminSection title="History">
          <PublicationHistory events={record.history} />
        </AdminSection>
      ) : null}
    </>
  );
}
