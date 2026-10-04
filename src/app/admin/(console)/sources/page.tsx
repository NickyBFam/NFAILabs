import type { Metadata } from "next";
import { AreaPage } from "@/app/admin/_ui/area-page";

export const metadata: Metadata = { title: "Sources" };

export default function AdminSourcesPage() {
  return (
    <AreaPage
      area="sources"
      title="Sources"
      description="The source registry and the documents cited as provenance. NFAI stores references and short notes, never copied content. A source supports published facts only once it is approved and in tier T1 to T3."
      contextLabels={{ sources: "Tier and status", source_documents: "Source" }}
    />
  );
}
