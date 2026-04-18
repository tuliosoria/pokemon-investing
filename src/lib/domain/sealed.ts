/**
 * Sealed Product ROI Calculator
 *
 * Estimates returns from buying and holding sealed Pokémon products
 * over a defined period, accounting for growth assumptions and exit costs.
 */

export interface SealedInput {
  acquisitionPrice: number;
  currentMarketPrice: number;
  annualGrowthPct: number; // e.g. 15 for 15%
  holdPeriodMonths: number;
  marketplaceFeePct: number; // 0-100
  storageCost: number;
  shippingCost: number;
  taxAdjustment: number;
}

export interface SealedResult {
  projectedValue: number;
  grossExitValue: number;
  netExitValue: number;
  totalHoldingCost: number;
  roiPct: number;
  annualizedReturnPct: number;
  recommendation: "strong_yes" | "yes" | "marginal" | "no" | "strong_no";
}

export function calculateSealedRoi(input: SealedInput): SealedResult {
  const years = input.holdPeriodMonths / 12;
  const growthMultiplier = Math.pow(1 + input.annualGrowthPct / 100, years);

  const projectedValue = input.currentMarketPrice * growthMultiplier;
  const marketplaceFee = projectedValue * (input.marketplaceFeePct / 100);
  const grossExitValue = projectedValue;
  const totalHoldingCost =
    input.storageCost * (input.holdPeriodMonths / 12) +
    input.shippingCost +
    input.taxAdjustment;

  const netExitValue = projectedValue - marketplaceFee - totalHoldingCost;
  const netProfit = netExitValue - input.acquisitionPrice;
  const roiPct =
    input.acquisitionPrice > 0
      ? (netProfit / input.acquisitionPrice) * 100
      : 0;

  // Annualized return via CAGR
  const annualizedReturnPct =
    years > 0 && input.acquisitionPrice > 0
      ? (Math.pow(netExitValue / input.acquisitionPrice, 1 / years) - 1) * 100
      : 0;

  let recommendation: SealedResult["recommendation"];
  if (annualizedReturnPct > 20) recommendation = "strong_yes";
  else if (annualizedReturnPct > 8) recommendation = "yes";
  else if (annualizedReturnPct > 0) recommendation = "marginal";
  else if (annualizedReturnPct > -10) recommendation = "no";
  else recommendation = "strong_no";

  return {
    projectedValue,
    grossExitValue,
    netExitValue,
    totalHoldingCost,
    roiPct,
    annualizedReturnPct,
    recommendation,
  };
}
