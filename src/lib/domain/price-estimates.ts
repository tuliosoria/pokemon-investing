/**
 * Heuristic grade multipliers for estimating PSA graded values from raw prices.
 * These are rough estimates — real graded values depend on population, demand, era, etc.
 */

interface GradeEstimates {
  psa10: number;
  psa9: number;
  psa8: number;
}

const MULTIPLIER_TIERS = [
  { maxRaw: 5, psa10: 3, psa9: 1.5, psa8: 1.1 },
  { maxRaw: 25, psa10: 3.5, psa9: 1.8, psa8: 1.15 },
  { maxRaw: 50, psa10: 4, psa9: 2, psa8: 1.2 },
  { maxRaw: 200, psa10: 5, psa9: 2.5, psa8: 1.3 },
  { maxRaw: Infinity, psa10: 6, psa9: 3, psa8: 1.5 },
];

export function estimateGradedValues(rawPrice: number): GradeEstimates {
  const tier =
    MULTIPLIER_TIERS.find((t) => rawPrice <= t.maxRaw) ??
    MULTIPLIER_TIERS[MULTIPLIER_TIERS.length - 1];

  return {
    psa10: Math.round(rawPrice * tier.psa10 * 100) / 100,
    psa9: Math.round(rawPrice * tier.psa9 * 100) / 100,
    psa8: Math.round(rawPrice * tier.psa8 * 100) / 100,
  };
}
