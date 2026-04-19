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
  roiPct: number;
  breakEvenPsa10Pct: number;
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
  const roiPct = totalCost > 0 ? (expectedProfit / totalCost) * 100 : 0;

  // Break-even: what PSA 10 probability makes EV = 0?
  // EV = p10*net10 + p9*net9 + p8*net8 + pBelow*netBelow = 0
  // Holding p9/p8 fixed, solve for p10:
  const net10 = input.psa10Value * feeMultiplier - totalCost;
  const netBelow = input.rawCardValue * 0.7 * feeMultiplier - totalCost;
  const p9 = input.probabilityPsa9 / 100;
  const p8 = input.probabilityPsa8 / 100;
  const net9 = input.psa9Value * feeMultiplier - totalCost;
  const net8 = input.psa8Value * feeMultiplier - totalCost;
  // Fixed contributions from PSA 9 and PSA 8
  const fixedEV = p9 * net9 + p8 * net8;
  // p10 * net10 + (1 - p10 - p9 - p8) * netBelow + fixedEV = 0
  // p10 * (net10 - netBelow) + (1 - p9 - p8) * netBelow + fixedEV = 0
  const denom = net10 - netBelow;
  let breakEvenPsa10Pct: number;
  if (denom > 0) {
    const pBelowBase = 1 - p9 - p8;
    breakEvenPsa10Pct =
      (-(pBelowBase * netBelow + fixedEV) / denom) * 100;
    breakEvenPsa10Pct = Math.min(100, Math.max(0, breakEvenPsa10Pct));
  } else {
    breakEvenPsa10Pct = 100;
  }

  let recommendation: GradeEvResult["recommendation"];
  if (roiPct > 50) recommendation = "strong_yes";
  else if (roiPct > 15) recommendation = "yes";
  else if (roiPct > 0) recommendation = "marginal";
  else if (roiPct > -20) recommendation = "no";
  else recommendation = "strong_no";

  return {
    expectedValue,
    expectedProfit,
    roiPct,
    breakEvenPsa10Pct,
    totalCost,
    recommendation,
    scenarioBreakdown: breakdown,
  };
}
