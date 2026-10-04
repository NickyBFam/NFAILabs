import type { Metadata } from "next";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader, AdminSection } from "@/components/admin/admin-page-header";
import type { FormFieldDef } from "@/components/admin/draft-fields";
import { DraftForm } from "@/components/admin/draft-form";
import { IdentityActions } from "@/components/admin/identity-actions";
import { IdentityTable, RoleHistory } from "@/components/admin/identity-table";
import { accessAction } from "@/app/admin/_data/actions";
import { loadAdmins, loadRoleHistory } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

export const metadata: Metadata = { title: "Access" };

const createFields: FormFieldDef[] = [
  {
    name: "authUserId",
    label: "Auth user ID",
    kind: "text",
    required: true,
    help: "The Supabase Auth user id of someone already invited (dashboard → Authentication). Never an email.",
  },
  { name: "displayName", label: "Display name", kind: "text", required: true, max: 120 },
  {
    name: "reason",
    label: "Reason",
    kind: "textarea",
    required: true,
    max: 1000,
    help: "Kept in the audit history.",
  },
];

export default async function AdminAccessPage() {
  const viewer = await loadViewer();
  if (!viewer.permissions.includes("manage_admins")) {
    return <AccessDenied title="Access" permission="manage_admins" />;
  }
  const [identities, history] = await Promise.all([loadAdmins(), loadRoleHistory()]);

  return (
    <>
      <AdminPageHeader
        title="Access"
        description="Admin identities and their roles. People are invited through Supabase Auth; there is no public sign-up. Identities are disabled, never deleted, so their history stays attributed."
      />

      <AdminSection title="Identities">
        <IdentityTable
          identities={identities}
          renderActions={(identity) => (
            <IdentityActions identity={identity} runAction={accessAction} />
          )}
        />
      </AdminSection>

      <AdminSection
        title="Add an identity"
        description="Gives an invited Auth user an admin identity. Grant roles afterwards."
      >
        <DraftForm
          groups={[{ legend: "New identity", fields: createFields }]}
          action={accessAction}
          submitLabel="Create identity"
          hidden={{ op: "create_identity" }}
        />
      </AdminSection>

      <AdminSection title="Role history" description="Every grant and revocation, newest first.">
        <RoleHistory entries={history} />
      </AdminSection>
    </>
  );
}
