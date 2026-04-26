export type ScenarioName = "Bear" | "Base" | "Bull";

export type ReprintRiskTier =
  | "Severe"
  | "High"
  | "Moderate"
  | "Low"
  | "Minimal";

export interface Scenario {
  name: ScenarioName;
  projectedValue: number;
  roiPercent: number;
  description: string;
  reprintShockPercent?: number;
}

export interface BuildScenariosInput {
  currentPrice: number;
  projectedValue: number;
  spreadPercent: number;
  reprintRisk?: ReprintRiskTier;
}

const REPRINT_SHOCK: Record<ReprintRiskTier, number> = {
  Severe: 0.4,
  High: 0.25,
  Moderate: 0.15,
  Low: 0.07,
  Minimal: 0,
};

const BEAR_DESCRIPTION: Record<ReprintRiskTier, string> = {
  Severe:
    "Pokémon Company aggressively reprints this set. Sealed supply floods the market, demand softens, and prices drop materially.",
  High:
    "A targeted reprint or restock wave compresses supply pricing while demand cools.",
  Moderate:
    "Some reprint pressure plus a softer collector cycle pull prices below trend.",
  Low:
    "Reprint unlikely; downside is mostly a weaker collector cycle and slower demand.",
  Minimal:
    "Reprint is structurally off the table. Downside limited to broad market softness or liquidity stress.",
};

const BASE_DESCRIPTION =
  "Model central estimate — current trend extrapolated forward.";
const BULL_DESCRIPTION =
  "Strong collector demand, no reprints, and a supportive collectibles macro.";

function roi(currentPrice: number, value: number): number {
  if (currentPrice <= 0) return 0;
  return ((value - currentPrice) / currentPrice) * 100;
}

export function buildScenarios(input: BuildScenariosInput): Scenario[] {
  const { currentPrice, projectedValue, spreadPercent } = input;
  const tier: ReprintRiskTier = input.reprintRisk ?? "Moderate";
  const spread = Math.max(0, spreadPercent) / 100;
  const reprintShock = REPRINT_SHOCK[tier];

  const bullValue = projectedValue * (1 + spread);
  const bearValueRaw = projectedValue * (1 - spread) * (1 - reprintShock);
  const bearValue = Math.max(0, bearValueRaw);

  return [
    {
      name: "Bear",
      projectedValue: bearValue,
      roiPercent: roi(currentPrice, bearValue),
      description: BEAR_DESCRIPTION[tier],
      reprintShockPercent: reprintShock * 100,
    },
    {
      name: "Base",
      projectedValue,
      roiPercent: roi(currentPrice, projectedValue),
      description: BASE_DESCRIPTION,
    },
    {
      name: "Bull",
      projectedValue: bullValue,
      roiPercent: roi(currentPrice, bullValue),
      description: BULL_DESCRIPTION,
    },
  ];
}
