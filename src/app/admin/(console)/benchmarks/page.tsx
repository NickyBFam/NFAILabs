import type { Metadata } from "next";
import { AreaPage } from "@/app/admin/_ui/area-page";

export const metadata: Metadata = { title: "Benchmarks" };

export default function AdminBenchmarksPage() {
  return (
    <AreaPage
      area="benchmarks"
      title="Benchmarks"
      description="Benchmarks and their pinned versions and metrics, evaluation harnesses and configurations, and results. A result belongs to one exact model version, benchmark version, metric and evaluation configuration."
      contextLabels={{
        benchmark_versions: "Benchmark",
        benchmark_metrics: "Benchmark version",
        evaluation_harness_versions: "Harness",
        benchmark_results: "Model version",
      }}
    />
  );
}
