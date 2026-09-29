/**
 * Product areas of NFAI Labs, as defined in docs/MASTER_SPEC.md §2.
 *
 * This is structural configuration only: descriptions of what each area will
 * contain and which phase (docs/PHASES.md) delivers it. It must never contain
 * product data such as models, providers, prices, scores, or rankings.
 */

export type NavGroup = "explore" | "tools" | "updates" | "about";

export type ProductArea = {
  /** Route segment, also used as a stable identifier. */
  slug: string;
  href: `/${string}`;
  /** Page heading. */
  title: string;
  /** Shorter label for navigation. */
  navLabel: string;
  group: NavGroup;
  /** Shown in the desktop header. Everything is always in the mobile menu and footer. */
  primaryNav: boolean;
  /** One-sentence purpose, used in cards and meta descriptions. */
  summary: string;
  /** What will belong in this area (from MASTER_SPEC.md §2). */
  plannedContents: readonly string[];
  /** Roadmap phase(s) that deliver the area's functionality. */
  plannedPhases: string;
};

export const navGroupLabels: Record<NavGroup, string> = {
  explore: "Explore",
  tools: "Tools",
  updates: "Updates & learning",
  about: "About",
};

export const productAreas: readonly ProductArea[] = [
  {
    slug: "rankings",
    href: "/rankings",
    title: "Rankings",
    navLabel: "Rankings",
    group: "explore",
    primaryNav: true,
    summary:
      "Use-case-specific rankings such as coding, reasoning, agents, value, and speed, each with a published methodology.",
    plannedContents: [
      "Separate rankings per use case rather than a single universal score",
      "The inputs, methodology version, and as-of date behind every ranking",
      "Coverage and confidence indicators, including an explicit 'insufficient data' state",
      "Ranking history over time",
    ],
    plannedPhases: "Phase 6 (Ranking Engine)",
  },
  {
    slug: "models",
    href: "/models",
    title: "Models",
    navLabel: "Models",
    group: "explore",
    primaryNav: true,
    summary:
      "A catalog of exact model versions with sourced capabilities, limits, pricing history, and benchmark evidence.",
    plannedContents: [
      "One page per exact model version, not per brand or family",
      "Capabilities, modalities, and context limits, each linked to its source",
      "Pricing history and lifecycle status",
      "Benchmark results grouped by comparable evaluation conditions",
    ],
    plannedPhases: "Phase 4 (Provider & Model Catalog)",
  },
  {
    slug: "providers",
    href: "/providers",
    title: "Providers",
    navLabel: "Providers",
    group: "explore",
    primaryNav: false,
    summary:
      "Profiles of the organizations that build and serve AI models, with their model families and release timelines.",
    plannedContents: [
      "Provider profiles with links to official documentation",
      "Model families and the exact versions within them",
      "A timeline of releases and official announcements",
    ],
    plannedPhases: "Phase 4 (Provider & Model Catalog)",
  },
  {
    slug: "benchmarks",
    href: "/benchmarks",
    title: "Benchmarks",
    navLabel: "Benchmarks",
    group: "explore",
    primaryNav: true,
    summary:
      "The benchmarks NFAI Labs tracks: what each measures, its versions, known limitations, and recorded results.",
    plannedContents: [
      "What each benchmark measures and who maintains it",
      "Benchmark versions, scoring methods, and known limitations",
      "Inclusion status and the rationale behind it",
      "Results with their source, evaluation conditions, and date",
    ],
    plannedPhases: "Phase 5 (Benchmark System)",
  },
  {
    slug: "compare",
    href: "/compare",
    title: "Compare",
    navLabel: "Compare",
    group: "tools",
    primaryNav: true,
    summary:
      "Side-by-side comparison of exact model versions, with clear flags where results are not comparable.",
    plannedContents: [
      "Capabilities, pricing, limits, and benchmark results side by side",
      "Visible flags when results come from different benchmark versions, harnesses, or settings",
      "Shareable comparison links",
    ],
    plannedPhases: "Phase 8 (Model Comparison)",
  },
  {
    slug: "finder",
    href: "/finder",
    title: "AI Finder",
    navLabel: "AI Finder",
    group: "tools",
    primaryNav: true,
    summary:
      "A guided tool that recommends models for a specific task and set of constraints, and explains why.",
    plannedContents: [
      "Task and constraint intake (budget, latency, modality, context size)",
      "Recommendations explained from stored, sourced data",
      "Trade-offs and practical usage guidance",
    ],
    plannedPhases: "Phase 9 (AI Finder)",
  },
  {
    slug: "stacks",
    href: "/stacks",
    title: "AI Stack Builder",
    navLabel: "Stack Builder",
    group: "tools",
    primaryNav: false,
    summary:
      "Recommendations for combining AI tools into a workflow, with the role and cost assumptions of each part.",
    plannedContents: [
      "Workflow templates for larger projects",
      "The role and rationale of each recommended component",
      "Cost estimates from sourced pricing, with stated assumptions",
    ],
    plannedPhases: "Phase 10 (AI Stack Builder)",
  },
  {
    slug: "news",
    href: "/news",
    title: "News",
    navLabel: "News",
    group: "updates",
    primaryNav: false,
    summary:
      "Structured summaries of important official AI news and model updates, each linked to its original source.",
    plannedContents: [
      "Summaries of releases, deprecations, pricing and capability changes",
      "Links to the original official source for every item",
      "Links to the affected models and providers",
    ],
    plannedPhases: "Phase 11 (AI News & Update Aggregation)",
  },
  {
    slug: "guides",
    href: "/guides",
    title: "Guides",
    navLabel: "Guides",
    group: "updates",
    primaryNav: false,
    summary:
      "Original educational guides on choosing and using AI models and on reading benchmarks critically.",
    plannedContents: [
      "How to choose a model for a task",
      "How to read and question benchmark results",
      "Practical configuration and usage guidance",
    ],
    plannedPhases: "Phase 17 (Guides & Education)",
  },
  {
    slug: "labs",
    href: "/labs",
    title: "Labs",
    navLabel: "Labs",
    group: "updates",
    primaryNav: false,
    summary:
      "NFAI Labs' own future evaluations of software engineering, coding, agentic, and game development tasks.",
    plannedContents: [
      "Versioned, reproducible evaluation suites",
      "Published environments, harnesses, and methodology reports",
      "Results with cost, time, and variance reported alongside scores",
    ],
    plannedPhases: "Phase 14 (NFAI Labs Benchmark Suite) and Phase 15 (Game Development Benchmark)",
  },
  {
    slug: "methodology",
    href: "/methodology",
    title: "Methodology",
    navLabel: "Methodology",
    group: "about",
    primaryNav: true,
    summary:
      "How NFAI Labs sources data, includes benchmarks, judges comparability, and builds rankings.",
    plannedContents: [
      "Source tiers and provenance rules",
      "Benchmark inclusion and comparability rules",
      "Ranking and derived-score methodology, versioned with a public changelog",
    ],
    plannedPhases:
      "Principles approved in Phase 0; detailed methodology published with Phases 5 and 6",
  },
  {
    slug: "about",
    href: "/about",
    title: "About",
    navLabel: "About",
    group: "about",
    primaryNav: false,
    summary: "What NFAI Labs is, why it exists, and how it is being built.",
    plannedContents: [
      "Mission and product principles",
      "Independence and disclosure policy",
      "Development roadmap",
    ],
    plannedPhases: "Available now (foundation)",
  },
];

export function getProductArea(slug: string): ProductArea {
  const area = productAreas.find((candidate) => candidate.slug === slug);
  if (!area) {
    throw new Error(`Unknown product area: ${slug}`);
  }
  return area;
}

export const primaryNavAreas = productAreas.filter((area) => area.primaryNav);

export const navGroups: ReadonlyArray<{ group: NavGroup; label: string; areas: ProductArea[] }> = (
  Object.keys(navGroupLabels) as NavGroup[]
).map((group) => ({
  group,
  label: navGroupLabels[group],
  areas: productAreas.filter((area) => area.group === group),
}));
