import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">Record not found</h1>
      <p className="mt-2 text-sm text-muted">It may not exist, or the link may be mistyped.</p>
      <p className="mt-4 text-sm">
        <Link href="/admin" className="text-accent underline">
          Back to the admin overview
        </Link>
      </p>
    </div>
  );
}
