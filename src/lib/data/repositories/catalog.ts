import type { PublicClient } from "@/lib/data/clients/types";
import type {
  ModelFamilyId,
  ModelVersion,
  ModelVersionId,
  ModelVersionIdentity,
  Provider,
} from "@/lib/data/domain";
import { mapModelVersion, mapModelVersionIdentity, mapProvider } from "@/lib/data/mappers/catalog";
import { CURRENT_STATE } from "@/lib/data/queries/history";
import { rowsOf, singleRowOf } from "@/lib/data/repositories/response";

/**
 * Public catalog reads. Every query filters to `published` in the database
 * (RLS enforces the same boundary), and the mappers refuse anything else.
 */

export async function listPublishedProviders(client: PublicClient): Promise<Provider[]> {
  const rows = await rowsOf(
    "listPublishedProviders",
    client
      .from("providers")
      .select("*")
      .eq("publication_state", CURRENT_STATE)
      .order("name", { ascending: true }),
  );
  return rows.map(mapProvider);
}

export async function getPublishedProviderBySlug(
  client: PublicClient,
  slug: string,
): Promise<Provider | null> {
  const row = await singleRowOf(
    "getPublishedProviderBySlug",
    client.from("providers").select("*").eq("slug", slug).eq("publication_state", CURRENT_STATE),
  );
  return row ? mapProvider(row) : null;
}

/** Published exact versions in one family, e.g. to show "v1" and "v2" side by side. */
export async function listPublishedModelVersionsInFamily(
  client: PublicClient,
  familyId: ModelFamilyId,
): Promise<ModelVersion[]> {
  const rows = await rowsOf(
    "listPublishedModelVersionsInFamily",
    client
      .from("model_versions")
      .select("*")
      .eq("model_family_id", familyId)
      .eq("publication_state", CURRENT_STATE)
      .order("display_name", { ascending: true }),
  );
  return rows.map(mapModelVersion);
}

/**
 * Provider → family → exact version for one version id, or null when any link
 * of the chain is not published (a public version never appears under an
 * unpublished family or provider).
 */
export async function getModelVersionIdentity(
  client: PublicClient,
  modelVersionId: ModelVersionId,
): Promise<ModelVersionIdentity | null> {
  const operation = "getModelVersionIdentity";
  const version = await singleRowOf(
    operation,
    client
      .from("model_versions")
      .select("*")
      .eq("id", modelVersionId)
      .eq("publication_state", CURRENT_STATE),
  );
  if (!version) return null;

  const family = await singleRowOf(
    operation,
    client
      .from("model_families")
      .select("*")
      .eq("id", version.model_family_id)
      .eq("publication_state", CURRENT_STATE),
  );
  if (!family) return null;

  const provider = await singleRowOf(
    operation,
    client
      .from("providers")
      .select("*")
      .eq("id", family.provider_id)
      .eq("publication_state", CURRENT_STATE),
  );
  if (!provider) return null;

  return mapModelVersionIdentity(provider, family, version);
}
