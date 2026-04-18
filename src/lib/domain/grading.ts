/**
 * Grading Expected Value Calculator
 *
 * Determines whether grading a raw card is worth it by computing the
 * probability-weighted expected outcome across all grade possibilities.
 */

export interface GradeEvInput {
  rawCardValue: number;
  gradingCost: number;
  psa10Value: number;
  psa9Value: number;
  psa8Value: number;
  probabilityPsa10: number; // 0-100
  probabilityPsa9: number; // 0-100
  probabilityPsa8: number; // 0-100
  marketplaceFeePct: number; // 0-100
  shippingCost: number;
  insuranceCost: number;
  taxAdjustment: number;
}

export interface GradeEvResult {
  expectedValue: number;
  expectedProfit: number;
  breakEvenProbability: number;
  totalCost: number;
  recommendation: "strong_yes" | "yes" | "marginal" | "no" | "strong_no";
  scenarioBreakdown: {
    grade: string;
    probability: number;
    grossValue: number;
    netValue: number;
    weightedValue: number;
  }[];
}

export function calculateGradeExpectedValue(
  input: GradeEvInput
): GradeEvResult {
  const feeMultiplier = 1 - input.marketplaceFeePct / 100;
  const totalCost =
    input.rawCardValue +
    input.gradingCost +
    input.shippingCost +
    input.insuranceCost +
    input.taxAdjustment;

  // Probability of getting below PSA 8 (damaged/returned)
  const probabilityBelow =
    100 -
    input.probabilityPsa10 -
    input.probabilityPsa9 -
    input.probabilityPsa8;

  const scenarios = [
    {
      grade: "PSA 10",
      probability: input.probabilityPsa10 / 100,
      grossValue: input.psa10Value,
    },
    {
      grade: "PSA 9",
      probability: input.probabilityPsa9 / 100,
      grossValue: input.psa9Value,
    },
    {
      grade: "PSA 8",
      probability: input.probabilityPsa8 / 100,
      grossValue: input.psa8Value,
    },
    {
      grade: "Below 8",
      probability: Math.max(0, probabilityBelow) / 100,
      grossValue: input.rawCardValue * 0.7, // typically loses ~30% value
    },
  ];

  const breakdown = scenarios.map((s) => {
    const netValue = s.grossValue * feeMultiplier - totalCost;
    return {
      grade: s.grade,
      probability: s.probability * 100,
      grossValue: s.grossValue,
      netValue,
      weightedValue: netValue * s.probability,
    };
  });

  const expectedProfit = breakdown.reduce(
    (sum, b) => sum + b.weightedValue,
    0
  );
  const expectedValue = expectedProfit + totalCost;

  // Break-even: what PSA 10 probability would make EV = 0?
  const psa10NetIfGotten = input.psa10Value * feeMultiplier - totalCost;
  const breakEvenProbability =
    psa10NetIfGotten > 0 ? (totalCost / (input.psa10Value * feeMultiplier)) * 100 : 100;

  let recommendation: GradeEvResult["recommendation"];
  const roiPct = (expectedProfit / totalCost) * 100;
  if (roiPct > 50) recommendation = "strong_yes";
  else if (roiPct > 15) recommendation = "yes";
  else if (roiPct > 0) recommendation = "marginal";
  else if (roiPct > -20) recommendation = "no";
  else recommendation = "strong_no";

  return {
    expectedValue,
    expectedProfit,
    breakEvenProbability: Math.min(100, Math.max(0, breakEvenProbability)),
    totalCost,
    recommendation,
    scenarioBreakdown: breakdown,
  };
}
