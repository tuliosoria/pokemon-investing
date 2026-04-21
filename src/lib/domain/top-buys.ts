import { SEALED_SETS } from "@/lib/data/sealed-sets";
import {
  computeForecastWithModels,
  type ForecastModelBundle,
} from "@/lib/domain/sealed-forecast-ml";
import type { SealedSetData, Forecast, ProductType } from "@/lib/types/sealed";

export interface BuyOpportunity {
  set: SealedSetData;
  forecast: Forecast;
}

export interface TopBuysFilters {
  productType?: ProductType;
  minScore?: number;
  maxPrice?: number;
  setName?: string;
}

/**
 * Returns products rated Buy,
 * ranked from strongest to weakest composite score.
 */
export function getTopBuyOpportunities(
  models: ForecastModelBundle,
  limit = 100,
  filters?: TopBuysFilters,
  sourceSets: SealedSetData[] = SEALED_SETS
): BuyOpportunity[] {
  let results: BuyOpportunity[] = sourceSets
    .map((set) => ({ set, forecast: computeForecastWithModels(set, models) }))
    .filter(({ forecast }) => forecast.status === "ready" && forecast.signal === "Buy");

  // Apply filters
  if (filters) {
    if (filters.productType) {
      results = results.filter((r) => r.set.productType === filters.productType);
    }
    if (filters.minScore != null) {
      results = results.filter((r) => r.forecast.compositeScore >= filters.minScore!);
    }
    if (filters.maxPrice != null) {
      results = results.filter((r) => r.set.currentPrice <= filters.maxPrice!);
    }
    if (filters.setName) {
      const q = filters.setName.toLowerCase();
      results = results.filter((r) => r.set.name.toLowerCase().includes(q));
    }
  }

  // Sort by composite score descending (strongest Buy first)
  results.sort((a, b) => b.forecast.compositeScore - a.forecast.compositeScore);

  return results.slice(0, limit);
}
