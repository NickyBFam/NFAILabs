import {
  asDeploymentChannelId,
  asModelVersionId,
  type PriceRecord,
  type PriceSeries,
} from "@/lib/data/domain";
import { toDecimalString, toPublicFactState } from "@/lib/data/mappers/values";
import type { PricingRecordRow } from "@/types/database";

export function mapPriceRecord(row: PricingRecordRow): PriceRecord {
  const series: PriceSeries = {
    modelVersionId: asModelVersionId(row.model_version_id),
    deploymentChannelId: asDeploymentChannelId(row.deployment_channel_id),
    billingDimension: row.billing_dimension,
    dimensionDetail: row.dimension_detail,
    serviceTier: row.service_tier,
    contextThresholdTokens: row.context_threshold_tokens,
    region: row.region,
    currency: row.currency,
    unit: row.unit,
    unitQuantity: toDecimalString(row.unit_quantity, "unit_quantity"),
  };
  return {
    id: row.id,
    series,
    amount: toDecimalString(row.price_amount, "price_amount"),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    announcedOn: row.announced_on,
    state: toPublicFactState(row.publication_state, "mapPriceRecord"),
  };
}

/**
 * Stable key for a price series (the identity documented on
 * public.pricing_records). Records with equal keys are successive prices.
 */
export function priceSeriesKey(series: PriceSeries): string {
  return JSON.stringify([
    series.modelVersionId,
    series.deploymentChannelId,
    series.billingDimension,
    series.dimensionDetail,
    series.serviceTier,
    series.contextThresholdTokens,
    series.region,
    series.currency,
    series.unit,
    series.unitQuantity,
  ]);
}
