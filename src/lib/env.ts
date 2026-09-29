/**
 * Environment-variable conventions (see README.md and .env.example).
 *
 * - Only variables prefixed with NEXT_PUBLIC_ are exposed to the browser.
 *   Never put secrets in a NEXT_PUBLIC_ variable.
 * - Readers take an explicit env object so they can be unit tested without
 *   mutating process.env.
 */

type Env = Readonly<Record<string, string | undefined>>;

const LOCAL_SITE_URL = "http://localhost:3000";

function parseHttpUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Absolute base URL used for metadata, canonical URLs, robots and sitemap.
 * Order: NEXT_PUBLIC_SITE_URL, then Vercel's production URL, then localhost.
 */
export function getSiteUrl(env: Env = process.env): URL {
  const explicit = parseHttpUrl(env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit;

  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercel = vercelHost ? parseHttpUrl(`https://${vercelHost}`) : null;
  if (vercel) return vercel;

  return new URL(LOCAL_SITE_URL);
}

/**
 * Search-engine indexing is opt-in. While the product areas are placeholders,
 * deployments default to noindex so unfinished pages are not indexed.
 */
export function isIndexingAllowed(env: Env = process.env): boolean {
  return env.NFAI_ALLOW_INDEXING === "true";
}
