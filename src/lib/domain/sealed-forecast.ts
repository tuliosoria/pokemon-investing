import type {
  SealedSetData,
  Forecast,
  FactorContribution,
  Signal,
  Confidence,
  ProjectionPoint,
} from "@/lib/types/sealed";

const FACTOR_CONFIG: Record<
  keyof SealedSetData["factors"],
  { label: string; weight: number; weightLabel: string }
> = {
  marketValue: { label: "Current Market Value", weight: 3.0, weightLabel: "High" },
  chaseCardIndex: { label: "Chase Card Index", weight: 3.0, weightLabel: "High" },
  printRun: { label: "Print Run / Supply", weight: 3.0, weightLabel: "High" },
  setAge: { label: "Set Age", weight: 2.0, weightLabel: "Medium" },
  priceTrajectory: { label: "Historical Price Trajectory", weight: 3.0, weightLabel: "High" },
  popularity: { label: "Set Popularity / Nostalgia", weight: 2.0, weightLabel: "Medium" },
  marketCycle: { label: "Market Cycle Position", weight: 2.0, weightLabel: "Medium" },
  demandRatio: { label: "Collector Demand Ratio", weight: 1.5, weightLabel: "Low–Med" },
};

const SP500_ANNUAL_RETURN = 0.105;

export function computeForecast(set: SealedSetData): Forecast {
  const totalWeight = Object.values(FACTOR_CONFIG).reduce((s, f) => s + f.weight, 0);

  const factorContributions: FactorContribution[] = Object.entries(FACTOR_CONFIG).map(
    ([key, config]) => {
      const score = set.factors[key as keyof SealedSetData["factors"]];
      const contribution =
        Math.round(((score * config.weight) / (totalWeight * 100)) * 1000) / 10;
      return {
        key,
        name: config.label,
        score,
        weight: config.weight,
        weightLabel: config.weightLabel,
        contribution,
      };
    }
  );

  const weightedSum = Object.entries(FACTOR_CONFIG).reduce((sum, [key, config]) => {
    return sum + set.factors[key as keyof SealedSetData["factors"]] * config.weight;
  }, 0);

  const compositeScore = Math.round(weightedSum / totalWeight);

  const signal: Signal =
    compositeScore >= 68 ? "Buy" : compositeScore >= 45 ? "Hold" : "Sell";

  // Map composite to annual appreciation rate
  // Score 100 → ~25%/yr, Score 50 → ~8%/yr, Score 0 → -5%/yr
  const annualRate = -0.05 + (compositeScore / 100) * 0.3;

  const projectedValue = Math.round(
    set.currentPrice * Math.pow(1 + annualRate, 5)
  );
  const dollarGain = projectedValue - set.currentPrice;
  const roiPercent = Math.round(((projectedValue / set.currentPrice) - 1) * 100);
  const spRoi = Math.round((Math.pow(1 + SP500_ANNUAL_RETURN, 5) - 1) * 100);

  // Estimated factor count (5 of 8 for dynamic products)
  const estimatedFactors = set.curated === false ? 5 : 0;

  // Confidence: curated uses data quality; dynamic is always Low
  let confidence: Confidence;
  if (estimatedFactors > 3) {
    confidence = "Low";
  } else {
    const dataQuality = (set.factors.setAge + set.factors.priceTrajectory) / 2;
    confidence = dataQuality >= 55 ? "High" : dataQuality >= 30 ? "Medium" : "Low";
  }

  return {
    compositeScore,
    signal,
    confidence,
    annualRate: Math.round(annualRate * 1000) / 1000,
    projectedValue,
    dollarGain,
    roiPercent,
    spRoi,
    factorContributions,
    estimatedFactors,
  };
}

export function getProjectionData(
  set: SealedSetData,
  forecast: Forecast
): ProjectionPoint[] {
  const months = 60;
  const monthlyRate = Math.pow(1 + forecast.annualRate, 1 / 12) - 1;
  const spMonthlyRate = Math.pow(1 + SP500_ANNUAL_RETURN, 1 / 12) - 1;

  const data: ProjectionPoint[] = [];
  for (let i = 0; i <= months; i += 6) {
    const year = i / 12;
    const label =
      i === 0
        ? "Now"
        : Number.isInteger(year)
          ? `Y${year}`
          : `Y${Math.floor(year)}½`;
    data.push({
      label,
      month: i,
      setValue: Math.round(1000 * Math.pow(1 + monthlyRate, i)),
      sp500: Math.round(1000 * Math.pow(1 + spMonthlyRate, i)),
    });
  }
  return data;
}

export function getSignalColor(signal: Signal): string {
  switch (signal) {
    case "Buy":
      return "text-green-400";
    case "Hold":
      return "text-yellow-400";
    case "Sell":
      return "text-red-400";
  }
}

export function getSignalBg(signal: Signal): string {
  switch (signal) {
    case "Buy":
      return "bg-green-500/20 border-green-500/40 text-green-400";
    case "Hold":
      return "bg-yellow-500/20 border-yellow-500/40 text-yellow-400";
    case "Sell":
      return "bg-red-500/20 border-red-500/40 text-red-400";
  }
}

export function getConfidenceBg(confidence: Confidence): string {
  switch (confidence) {
    case "High":
      return "bg-blue-500/20 text-blue-400";
    case "Medium":
      return "bg-orange-500/20 text-orange-400";
    case "Low":
      return "bg-gray-500/20 text-gray-400";
  }
}

export { FACTOR_CONFIG, SP500_ANNUAL_RETURN };
