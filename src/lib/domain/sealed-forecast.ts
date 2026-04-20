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
  popularity: { label: "Popularity / Google Trends", weight: 2.0, weightLabel: "Medium" },
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

  const rawCompositeScore = Math.round(weightedSum / totalWeight);

  // Map composite to annual appreciation rate
  // Score 100 → ~25%/yr, Score 50 → ~10%/yr, Score 0 → -5%/yr
  const annualRate = -0.05 + (rawCompositeScore / 100) * 0.3;

  const currentPrice = set.currentPrice > 0 ? set.currentPrice : 0;
  const projectedValue = currentPrice > 0
    ? Math.round(currentPrice * Math.pow(1 + annualRate, 5))
    : 0;
  const dollarGain = Math.round((projectedValue - currentPrice) * 100) / 100;
  const roiPercent = currentPrice > 0
    ? Math.round(((projectedValue / currentPrice) - 1) * 100)
    : 0;
  const spRoi = Math.round((Math.pow(1 + SP500_ANNUAL_RETURN, 5) - 1) * 100);
  const spOutperformance = roiPercent - spRoi;

  const signal: Signal =
    spOutperformance >= 10 ? "Buy" : spOutperformance >= 0 ? "Hold" : "Sell";

  const compositeScore =
    signal === "Buy"
      ? Math.max(rawCompositeScore, 60)
      : signal === "Hold"
        ? Math.min(59, Math.max(rawCompositeScore, 40))
        : Math.min(rawCompositeScore, 39);

  // Estimated factor count: dynamic products have 5 defaults, minus 1 if trend data present
  const hasTrends = !!set.trendData;
  const estimatedFactors = set.curated === false ? (hasTrends ? 4 : 5) : 0;

  // Confidence: curated sets are hand-tuned; dynamic sets depend on live-data coverage
  let confidence: Confidence;
  if (set.curated !== false) {
    confidence = "High";
  } else if (estimatedFactors > 3) {
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
      return "text-[#F59E0B]";
    case "Sell":
      return "text-red-400";
  }
}

export function getSignalBg(signal: Signal): string {
  switch (signal) {
    case "Buy":
      return "bg-emerald-500 border-emerald-300 text-white";
    case "Hold":
      return "bg-[#F59E0B] border-[#FCD34D] text-[#1F2937]";
    case "Sell":
      return "bg-[#EF4444] border-[#F87171] text-white";
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
