/**
 * Grading Opportunities — computes whether grading a card is financially worthwhile
 * by analyzing the spread between raw and graded prices.
 */

import {
  calculateGradeExpectedValue,
  type GradeEvResult,
} from "@/lib/domain/grading";
import { normalizeMarketplaceFees } from "@/lib/domain/fees";
import type { GradeData } from "@/lib/types/card";

export interface GradingOpportunity {
  pokedataId: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
  tcgplayerUrl: string | null;

  // Prices
  rawPrice: number;
  psa10Price: number;
  psa9Price: number;
  psa8Price: number;

  // Computed
  psa10Spread: number; // PSA 10 price - raw - costs (best-case upside)
  expectedProfit: number; // Probability-weighted EV
  roi: number; // ROI %
  totalCost: number;
  recommendation: GradeEvResult["recommendation"];

  // Population & confidence
  psa10Probability: number; // 0-100
  populationTotal: number;
  confidence: "high" | "medium" | "low";

  // Full breakdown for detail view
  scenarioBreakdown: GradeEvResult["scenarioBreakdown"];
}

/** Tiered grading costs based on card value */
function getGradingCost(rawPrice: number): number {
  if (rawPrice < 100) return 20; // Economy tier
  if (rawPrice < 500) return 35; // Regular tier
  return 65; // Express/premium for high-value cards
}

/** Determine confidence level from population data */
function getConfidence(
  populationTotal: number,
  psa10Probability: number | null
): "high" | "medium" | "low" {
  if (psa10Probability === null || populationTotal < 10) return "low";
  if (populationTotal < 50) return "medium";
  return "high";
}

/** Compute the grading opportunity for a single card */
export function computeGradingOpportunity(
  gradeData: GradeData,
  rawPrice: number,
  meta: { number: string; rarity: string; tcgplayerUrl: string | null }
): GradingOpportunity | null {
  const psa10 = gradeData.gradedPrices["PSA 10.0"] ?? 0;
  const psa9 = gradeData.gradedPrices["PSA 9.0"] ?? 0;
  const psa8 = gradeData.gradedPrices["PSA 8.0"] ?? 0;

  // Need at least a PSA 10 price to compute anything meaningful
  if (psa10 <= 0 && psa9 <= 0) return null;

  // Raw price: prefer PokeData raw → TCGPlayer → passed-in price
  const bestRaw =
    gradeData.rawPrice && gradeData.rawPrice > 0
      ? gradeData.rawPrice
      : gradeData.tcgplayerPrice && gradeData.tcgplayerPrice > 0
        ? gradeData.tcgplayerPrice
        : rawPrice;

  if (bestRaw <= 0) return null;

  const gradingCost = getGradingCost(bestRaw);
  const ebayFeePct = normalizeMarketplaceFees("ebay").marketplaceFeePct ?? 13.25;
  const probabilityDefaults =
    gradeData.psa10Probability === null
      ? { psa10: 20, psa9: 50, psa8: 25 }
      : (() => {
          const remaining = 100 - gradeData.psa10Probability;
          return {
            psa10: gradeData.psa10Probability,
            psa9: Math.round(remaining * 0.5),
            psa8: Math.round(remaining * 0.3),
          };
        })();

  // Use the existing grading calculator for full EV computation
  const evResult = calculateGradeExpectedValue({
    rawCardValue: bestRaw,
    gradingCost,
    psa10Value: psa10 > 0 ? psa10 : bestRaw * 3, // fallback multiplier
    psa9Value: psa9 > 0 ? psa9 : bestRaw * 1.5,
    psa8Value: psa8 > 0 ? psa8 : bestRaw * 1.1,
    probabilityPsa10: probabilityDefaults.psa10,
    probabilityPsa9: probabilityDefaults.psa9,
    probabilityPsa8: probabilityDefaults.psa8,
    marketplaceFeePct: ebayFeePct,
    shippingCost: 5,
    insuranceCost: bestRaw > 200 ? 10 : 0, // insurance for high-value
    taxAdjustment: 0,
  });

  // PSA 10 spread (best-case upside, not probability-weighted)
  const feeMultiplier = 1 - ebayFeePct / 100;
  const totalCostForSpread = bestRaw + gradingCost + 5 + (bestRaw > 200 ? 10 : 0);
  const psa10Spread =
    (psa10 > 0 ? psa10 : bestRaw * 3) * feeMultiplier - totalCostForSpread;

  // Population total
  const populationTotal = Object.values(gradeData.population).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    pokedataId: gradeData.pokedataId,
    name: gradeData.name,
    set: gradeData.set,
    number: meta.number,
    rarity: meta.rarity,
    tcgplayerUrl: meta.tcgplayerUrl,
    rawPrice: bestRaw,
    psa10Price: psa10,
    psa9Price: psa9,
    psa8Price: psa8,
    psa10Spread: Math.round(psa10Spread * 100) / 100,
    expectedProfit: Math.round(evResult.expectedProfit * 100) / 100,
    roi: Math.round(evResult.roiPct * 10) / 10,
    totalCost: Math.round(evResult.totalCost * 100) / 100,
    recommendation: evResult.recommendation,
    psa10Probability: probabilityDefaults.psa10,
    populationTotal,
    confidence: getConfidence(populationTotal, gradeData.psa10Probability),
    scenarioBreakdown: evResult.scenarioBreakdown,
  };
}
