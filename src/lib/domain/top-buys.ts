import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { computeForecast } from "@/lib/domain/sealed-forecast";
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
 * Returns products projected to outperform the S&P 500,
 * ranked from strongest to weakest composite score.
 */
export function getTopBuyOpportunities(
  limit = 50,
  filters?: TopBuysFilters,
  extraSets?: SealedSetData[]
): BuyOpportunity[] {
  const allSets = extraSets ? [...SEALED_SETS, ...extraSets] : SEALED_SETS;

  let results: BuyOpportunity[] = allSets
    .map((set) => ({ set, forecast: computeForecast(set) }))
    .filter(({ forecast }) => forecast.roiPercent > forecast.spRoi);

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
