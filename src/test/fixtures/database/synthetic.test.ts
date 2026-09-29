import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { syntheticTables } from "@/test/fixtures/database/synthetic";

/**
 * Guards AGENTS.md rules 5–7 and 11: database fixtures are obviously synthetic
 * and never name real providers, models, benchmarks, prices or sources.
 */

// Case-insensitive whole-word names of real AI organizations, models and benchmarks.
const REAL_NAMES = [
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "gpt",
  "chatgpt",
  "google",
  "deepmind",
  "meta",
  "llama",
  "mistral",
  "mixtral",
  "deepseek",
  "qwen",
  "alibaba",
  "xai",
  "grok",
  "cohere",
  "microsoft",
  "copilot",
  "phi",
  "nvidia",
  "amazon",
  "bedrock",
  "azure",
  "vertex",
  "hugging ?face",
  "perplexity",
  "mmlu",
  "humaneval",
  "swe-?bench",
  "gpqa",
  "arc-agi",
  "hellaswag",
  "lmarena",
  "chatbot arena",
];
const REAL_NAME_PATTERN = new RegExp(`\\b(${REAL_NAMES.join("|")})\\b`, "i");

const FIXTURE_DIR = path.join(process.cwd(), "src", "test", "fixtures", "database");
const fixtureSources = readdirSync(FIXTURE_DIR)
  .filter((name) => /\.(ts|sql|json)$/.test(name) && !name.endsWith(".test.ts"))
  .map((name) => ({ name, text: readFileSync(path.join(FIXTURE_DIR, name), "utf8") }));

const allRows = Object.values(syntheticTables).flat() as Record<string, unknown>[];

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

describe("synthetic database fixtures", () => {
  it("contain no known real provider, model or benchmark names", () => {
    for (const { name, text } of fixtureSources) {
      expect(text.match(REAL_NAME_PATTERN)?.[0], name).toBeUndefined();
    }
    for (const value of allRows.flatMap(stringValues)) {
      expect(value).not.toMatch(REAL_NAME_PATTERN);
    }
  });

  it("use only reserved test domains for URLs", () => {
    const urls = allRows.flatMap(stringValues).filter((value) => /^https?:\/\//.test(value));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).hostname, url).toMatch(/\.test$/);
    }
  });

  it("price only in the ISO 4217 test currency", () => {
    for (const row of syntheticTables.pricing_records) {
      expect(row.currency).toBe("XTS");
    }
  });

  it("use the reserved synthetic id prefix for every id", () => {
    const idValues = allRows.flatMap((row) =>
      Object.entries(row)
        .filter(
          ([key, value]) => (key === "id" || key.endsWith("_id")) && typeof value === "string",
        )
        .map(([, value]) => value as string),
    );
    expect(idValues.length).toBeGreaterThan(0);
    for (const id of idValues) {
      expect(id).toMatch(/^00000000-0000-4000-8000-5e[0-9a-f]{10}$/);
    }
  });

  it("label the fixture module as synthetic", () => {
    const synthetic = fixtureSources.find(({ name }) => name === "synthetic.ts");
    expect(synthetic?.text).toMatch(/SYNTHETIC TEST FIXTURES — NOT REAL DATA/);
  });
});
