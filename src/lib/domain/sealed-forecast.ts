import type {
  Confidence,
  Forecast,
  ForecastScenario,
  ProjectionPoint,
  SealedSetData,
  Signal,
} from "@/lib/types/sealed";

export const SP500_ANNUAL_RETURN = 0.105;

export function getProjectionData(
  _set: SealedSetData,
  forecast: Forecast
): ProjectionPoint[] {
  const months = 60;
  const monthlyRate = Math.pow(1 + forecast.annualRate, 1 / 12) - 1;
  const spMonthlyRate = Math.pow(1 + SP500_ANNUAL_RETURN, 1 / 12) - 1;

  const data: ProjectionPoint[] = [];
  for (let month = 0; month <= months; month += 6) {
    const year = month / 12;
    const label =
      month === 0
        ? "Now"
        : Number.isInteger(year)
          ? `Y${year}`
          : `Y${Math.floor(year)}½`;

    data.push({
      label,
      month,
      setValue: Math.round(1000 * Math.pow(1 + monthlyRate, month)),
      sp500: Math.round(1000 * Math.pow(1 + spMonthlyRate, month)),
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

/**
 * Human-readable copy for each forecast scenario. Used by the UI selector
 * and the breakdown modal so users understand what assumptions a given
 * scenario is making.
 */
export const SCENARIO_DESCRIPTIONS: Record<
  ForecastScenario,
  { label: string; short: string; description: string }
> = {
  pessimist: {
    label: "Pessimist",
    short: "Bear case",
    description:
      "Bakes in 3% annual reprint / saturation drag, shrinks model gains by 55%, and allows projections to fall up to 35% below current price. Use this when you expect more reprints, declining demand, or a broader Pokémon market correction.",
  },
  moderate: {
    label: "Moderate",
    short: "Base case",
    description:
      "Default model output with no scenario adjustments. Reflects historical patterns in the training data.",
  },
  optimist: {
    label: "Optimist",
    short: "Bull case",
    description:
      "Adds a 2% annual nostalgia tailwind and amplifies model gains by 35%. Use this when you expect minimal reprints and continued collector demand growth.",
  },
};

/**
 * Apply a forecast scenario to a baseline {@link Forecast} by swapping the
 * scenario's outlook into the top-level fields the UI reads. Returns the
 * forecast unchanged for `moderate` (the model's default), or for forecasts
 * that don't carry a `scenarios` payload (e.g. blocked / too-new).
 */
export function applyForecastScenario(
  forecast: Forecast,
  scenario: ForecastScenario
): Forecast {
  if (scenario === "moderate") return forecast;
  const outlook = forecast.scenarios?.[scenario];
  if (!outlook || forecast.status !== "ready") return forecast;
  return {
    ...forecast,
    signal: outlook.signal,
    annualRate: outlook.annualRate,
    projectedValue: outlook.projectedValue,
    dollarGain: outlook.dollarGain,
    roiPercent: outlook.roiPercent,
    horizonPredictions: outlook.horizonPredictions,
  };
}
