import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader, AdminSection } from "@/components/admin/admin-page-header";
import { areaTables, tableLabels, type AdminArea } from "@/components/admin/labels";
import { newRecordHref } from "@/components/admin/record-links";
import { RecordTable } from "@/components/admin/record-table";
import { ButtonLink } from "@/components/ui/button-link";
import { loadRecordList } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

type AreaPageProps = {
  area: AdminArea;
  title: string;
  description: string;
  /** Secondary column shown in each table, per table. */
  contextLabels?: Partial<Record<string, string>>;
};

/** Lists every record type in an admin area, with a create link for people who can draft. */
export async function AreaPage({ area, title, description, contextLabels = {} }: AreaPageProps) {
  const viewer = await loadViewer();
  if (!viewer.permissions.includes("view_admin")) {
    return <AccessDenied title={title} permission="view_admin" />;
  }
  const canDraft = viewer.permissions.includes("edit_draft");
  const tables = areaTables[area];
  const lists = await Promise.all(tables.map((table) => loadRecordList(table)));

  return (
    <>
      <AdminPageHeader title={title} description={description} />
      {tables.map((table, index) => {
        const labels = tableLabels[table];
        return (
          <AdminSection
            key={table}
            title={labels.plural}
            actions={
              canDraft ? (
                <ButtonLink href={newRecordHref(table)} variant="secondary">
                  New {labels.singular.toLowerCase()}
                </ButtonLink>
              ) : null
            }
          >
            <RecordTable
              caption={labels.plural}
              records={lists[index] ?? []}
              contextLabel={contextLabels[table]}
              emptyTitle={`No ${labels.plural.toLowerCase()} yet`}
              emptyHint={canDraft ? "Create a draft to start." : undefined}
            />
          </AdminSection>
        );
      })}
    </>
  );
}
