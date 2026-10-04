import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DraftForm, type FieldGroup } from "@/components/admin/draft-form";
import { isAdminRecordTable, isFactTable, tableLabels } from "@/components/admin/labels";
import { createRecordAction } from "@/app/admin/_data/actions";
import {
  recordFields,
  requiresSourceOnCreate,
  sourceFields,
  withOptions,
} from "@/app/admin/_data/forms";
import { loadReferenceOptions } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

type Params = Promise<{ table: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { table } = await params;
  return {
    title: isAdminRecordTable(table)
      ? `New ${tableLabels[table].singular.toLowerCase()}`
      : "New record",
  };
}

export default async function NewRecordPage({ params }: { params: Params }) {
  const { table } = await params;
  if (!isAdminRecordTable(table)) notFound();
  const labels = tableLabels[table];
  const title = `New ${labels.singular.toLowerCase()}`;

  const viewer = await loadViewer();
  if (!viewer.permissions.includes("edit_draft")) {
    return <AccessDenied title={title} permission="edit_draft" />;
  }

  const needsSource = requiresSourceOnCreate(table);
  const groups: FieldGroup[] = [
    {
      legend: labels.singular,
      description: isFactTable(table)
        ? "Saved as a draft. Nothing is public until it has been reviewed and published."
        : "Saved as proposed. A publisher approves sources before they can support published facts.",
      fields: await withOptions(recordFields(table), loadReferenceOptions),
    },
  ];
  if (needsSource) {
    groups.push({
      legend: "Source",
      description:
        "Every fact is created with the document that supports it. Register the source and document under Sources first if they are not listed.",
      fields: await withOptions(sourceFields(true), loadReferenceOptions),
    });
  }

  return (
    <>
      <AdminPageHeader
        title={title}
        description="Required fields are marked with an asterisk. Unknown values stay empty; never estimate them."
      />
      <div className="mt-6">
        <DraftForm
          groups={groups}
          action={createRecordAction}
          submitLabel={isFactTable(table) ? "Save draft" : `Save ${labels.singular.toLowerCase()}`}
          hidden={{ table }}
        />
      </div>
    </>
  );
}
