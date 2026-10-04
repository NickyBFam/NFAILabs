import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader, AdminSection } from "@/components/admin/admin-page-header";
import {
  adminSections,
  hasPermission,
  permissionLabels,
  stateLabels,
} from "@/components/admin/labels";
import type { PublicationState } from "@/components/admin/types";
import { loadReviewQueue } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

export const metadata: Metadata = { title: "Overview" };

const queueStates: readonly PublicationState[] = ["draft", "extracted", "validated"];

export default async function AdminOverviewPage() {
  const viewer = await loadViewer();
  if (!hasPermission(viewer.permissions, "view_admin")) {
    return <AccessDenied title="Overview" permission="view_admin" />;
  }
  const queue = await loadReviewQueue();
  const counts = queueStates.map((state) => ({
    state,
    count: queue.filter((item) => item.state === state).length,
  }));
  const actionable = queue.filter((item) => item.actions.some((action) => action.enabled)).length;
  const sections = adminSections.filter(
    (section) => section.href !== "/admin" && hasPermission(viewer.permissions, section.permission),
  );

  return (
    <>
      <AdminPageHeader
        title={`Welcome, ${viewer.displayName}`}
        description="Create sourced drafts, review them, and publish only what has passed review. Every change is attributed and kept in history."
      />

      <AdminSection title="Review queue">
        <dl className="grid gap-3 sm:grid-cols-4">
          {counts.map(({ state, count }) => (
            <div key={state} className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-sm text-muted">
                {state === "draft" ? "Submitted drafts" : stateLabels[state]}
              </dt>
              <dd className="mt-1 text-2xl font-semibold">{count}</dd>
            </div>
          ))}
          <div className="rounded-lg border border-line bg-surface p-4">
            <dt className="text-sm text-muted">Waiting on you</dt>
            <dd className="mt-1 text-2xl font-semibold">{actionable}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">
          <Link href="/admin/review" className="text-accent underline">
            Open the review queue
          </Link>
        </p>
      </AdminSection>

      <AdminSection title="Areas">
        <ul className="grid gap-3 sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.href} className="rounded-lg border border-line bg-surface p-4">
              <Link href={section.href} className="font-semibold text-accent underline">
                {section.label}
              </Link>
              <p className="mt-1 text-sm text-muted">{section.description}</p>
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title="Your access">
        <p className="text-sm">
          Roles: {viewer.roles.length > 0 ? viewer.roles.join(", ") : "none assigned"}.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {viewer.permissions.map((permission) => (
            <li
              key={permission}
              className="rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-xs"
            >
              {permissionLabels[permission]}
            </li>
          ))}
        </ul>
      </AdminSection>
    </>
  );
}
