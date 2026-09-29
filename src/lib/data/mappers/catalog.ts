import {
  asDeploymentChannelId,
  asModelFamilyId,
  asModelVersionId,
  asProviderId,
  type DeploymentChannel,
  type ModelFamily,
  type ModelVersion,
  type ModelVersionIdentity,
  type Provider,
} from "@/lib/data/domain";
import { invalidData } from "@/lib/data/errors";
import { CURRENT_STATE } from "@/lib/data/queries/history";
import type {
  DeploymentChannelRow,
  ModelFamilyRow,
  ModelVersionRow,
  ProviderRow,
} from "@/types/database";

/**
 * Catalog mappers. Catalog entities are public only while `published`; every
 * other state (draft, withdrawn, ...) is internal, so mapping one is an error.
 */

function requirePublished(row: { publication_state: string }, operation: string): void {
  if (row.publication_state !== CURRENT_STATE) {
    throw invalidData(operation, "row is not published");
  }
}

export function mapProvider(row: ProviderRow): Provider {
  requirePublished(row, "mapProvider");
  return {
    id: asProviderId(row.id),
    slug: row.slug,
    name: row.name,
    organizationType: row.organization_type,
    websiteUrl: row.website_url,
    description: row.description,
  };
}

export function mapDeploymentChannel(row: DeploymentChannelRow): DeploymentChannel {
  requirePublished(row, "mapDeploymentChannel");
  return {
    id: asDeploymentChannelId(row.id),
    providerId: asProviderId(row.provider_id),
    slug: row.slug,
    name: row.name,
    channelType: row.channel_type,
  };
}

export function mapModelFamily(row: ModelFamilyRow): ModelFamily {
  requirePublished(row, "mapModelFamily");
  return {
    id: asModelFamilyId(row.id),
    providerId: asProviderId(row.provider_id),
    slug: row.slug,
    name: row.name,
    description: row.description,
  };
}

export function mapModelVersion(row: ModelVersionRow): ModelVersion {
  requirePublished(row, "mapModelVersion");
  return {
    id: asModelVersionId(row.id),
    familyId: asModelFamilyId(row.model_family_id),
    slug: row.slug,
    displayName: row.display_name,
    versionLabel: row.version_label,
    snapshotDate: row.snapshot_date,
    baseModelVersionId:
      row.base_model_version_id === null ? null : asModelVersionId(row.base_model_version_id),
    description: row.description,
  };
}

/**
 * Builds the provider → family → exact version chain, checking that the rows
 * actually belong together so an identity can never be assembled from
 * mismatched records.
 */
export function mapModelVersionIdentity(
  providerRow: ProviderRow,
  familyRow: ModelFamilyRow,
  versionRow: ModelVersionRow,
): ModelVersionIdentity {
  if (versionRow.model_family_id !== familyRow.id) {
    throw invalidData("mapModelVersionIdentity", "version does not belong to family");
  }
  if (familyRow.provider_id !== providerRow.id) {
    throw invalidData("mapModelVersionIdentity", "family does not belong to provider");
  }
  return {
    provider: mapProvider(providerRow),
    family: mapModelFamily(familyRow),
    version: mapModelVersion(versionRow),
  };
}
