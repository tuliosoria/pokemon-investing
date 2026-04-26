export type ScenarioName = "Bear" | "Base" | "Bull";

export interface Scenario {
  name: ScenarioName;
  projectedValue: number;
  roiPercent: number;
  description: string;
}

export interface BuildScenariosInput {
  currentPrice: number;
  projectedValue: number;
  spreadPercent: number;
}

const DESCRIPTIONS: Record<ScenarioName, string> = {
  Bear: "Weak demand, modest reprint pressure, soft market cycle.",
  Base: "Model central estimate — current trend extrapolated.",
  Bull: "Strong collector demand, no reprints, supportive macro.",
};

function roi(currentPrice: number, value: number): number {
  if (currentPrice <= 0) return 0;
  return ((value - currentPrice) / currentPrice) * 100;
}

export function buildScenarios(input: BuildScenariosInput): Scenario[] {
  const { currentPrice, projectedValue, spreadPercent } = input;
  const spread = Math.max(0, spreadPercent) / 100;
  const bearValue = projectedValue * (1 - spread);
  const bullValue = projectedValue * (1 + spread);
  return [
    {
      name: "Bear",
      projectedValue: bearValue,
      roiPercent: roi(currentPrice, bearValue),
      description: DESCRIPTIONS.Bear,
    },
    {
      name: "Base",
      projectedValue,
      roiPercent: roi(currentPrice, projectedValue),
      description: DESCRIPTIONS.Base,
    },
    {
      name: "Bull",
      projectedValue: bullValue,
      roiPercent: roi(currentPrice, bullValue),
      description: DESCRIPTIONS.Bull,
    },
  ];
}
