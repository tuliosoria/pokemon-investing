import type {
  Confidence,
  Forecast,
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
