import type { Metadata } from "next";
import { AreaPage } from "@/app/admin/_ui/area-page";

export const metadata: Metadata = { title: "Pricing" };

export default function AdminPricingPage() {
  return (
    <AreaPage
      area="pricing"
      title="Pricing"
      description="Effective-dated prices for an exact model version on a deployment channel. A price change is a new record; the old one keeps its history and has its effective period closed."
      contextLabels={{ pricing_records: "Model version" }}
    />
  );
}
