import type { Metadata } from "next";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ReviewQueue } from "@/components/admin/review-queue";
import { loadReviewQueue } from "@/app/admin/_data/records";
import { loadViewer } from "@/app/admin/_data/viewer";

export const metadata: Metadata = { title: "Review queue" };

export default async function AdminReviewPage() {
  const viewer = await loadViewer();
  if (!viewer.permissions.includes("view_admin")) {
    return <AccessDenied title="Review queue" permission="view_admin" />;
  }
  const items = await loadReviewQueue();

  return (
    <>
      <AdminPageHeader
        title="Review queue"
        description="Drafts submitted for review, extracted proposals and validated records waiting for publication. Open a record to see its sources, history and the actions available to you."
      />
      <div className="mt-6">
        <ReviewQueue items={items} />
      </div>
    </>
  );
}
