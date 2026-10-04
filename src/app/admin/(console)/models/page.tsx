import type { Metadata } from "next";
import { AreaPage } from "@/app/admin/_ui/area-page";

export const metadata: Metadata = { title: "Models" };

export default function AdminModelsPage() {
  return (
    <AreaPage
      area="models"
      title="Models"
      description="Providers, deployment channels, model families and exact model versions. Capabilities, identifiers and lifecycle events always attach to an exact version."
      contextLabels={{
        deployment_channels: "Provider",
        model_families: "Provider",
        model_versions: "Family",
        model_version_aliases: "Model version",
        model_releases: "Model version",
        model_capabilities: "Model version",
      }}
    />
  );
}
