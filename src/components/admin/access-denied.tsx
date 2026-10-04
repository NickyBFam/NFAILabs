import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { permissionLabels } from "@/components/admin/labels";
import { Notice } from "@/components/admin/notice";
import type { AdminPermission } from "@/components/admin/types";

/** Shown in place of a page the viewer is not permitted to use. Nothing else is loaded. */
export function AccessDenied({
  title,
  permission,
}: {
  title: string;
  permission: AdminPermission;
}) {
  return (
    <>
      <AdminPageHeader title={title} />
      <Notice tone="warning" title="You do not have access to this page" className="mt-6">
        It needs the “{permissionLabels[permission]}” permission. An administrator can change your
        roles.
      </Notice>
    </>
  );
}
