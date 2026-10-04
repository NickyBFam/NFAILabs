import type { Metadata } from "next";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DraftForm } from "@/components/admin/draft-form";
import { isFactTable, tableLabels } from "@/components/admin/labels";
import { Notice } from "@/components/admin/notice";
import { recordHref } from "@/components/admin/record-links";
import { ButtonLink } from "@/components/ui/button-link";
import { updateRecordAction } from "@/app/admin/_data/actions";
import { recordFields, withOptions, withValues } from "@/app/admin/_data/forms";
import { loadRecordDetail, loadReferenceOptions } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

type Params = Promise<{ table: string; id: string }>;

export const metadata: Metadata = { title: "Edit draft" };

export default async function EditRecordPage({ params }: { params: Params }) {
  const { table, id } = await params;
  const viewer = await loadViewer();
  if (!viewer.permissions.includes("edit_draft")) {
    return <AccessDenied title="Edit draft" permission="edit_draft" />;
  }

  const record = await loadRecordDetail(table, id);
  const title = `Edit ${record.label}`;

  if (!isFactTable(record.table) || !record.editable) {
    return (
      <>
        <AdminPageHeader title={title} />
        <Notice tone="warning" title="This record cannot be edited now" className="mt-6">
          Only drafts that are not under review can be edited. Reviewed content is never
          overwritten; correct a published record by superseding it.
        </Notice>
        <div className="mt-4">
          <ButtonLink href={recordHref(record.table, record.id)} variant="secondary">
            Back to the record
          </ButtonLink>
        </div>
      </>
    );
  }

  const fields = withValues(
    await withOptions(recordFields(record.table), loadReferenceOptions),
    record.values,
  );

  return (
    <>
      <AdminPageHeader
        title={title}
        description={`${tableLabels[record.table].singular} draft. Emptying an optional field clears it.`}
      />
      <div className="mt-6">
        <DraftForm
          groups={[{ legend: tableLabels[record.table].singular, fields }]}
          action={updateRecordAction}
          submitLabel="Save changes"
          hidden={{ table: record.table, recordId: record.id }}
        />
      </div>
    </>
  );
}
