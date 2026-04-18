/**
 * Flip ROI Calculator
 *
 * Calculates net profit and ROI for buying and reselling a card.
 */

export interface FlipInput {
  buyPrice: number;
  sellPrice: number;
  marketplaceFeePct: number; // 0-100
  paymentFeePct: number; // 0-100
  shippingCost: number;
  packingCost: number;
  taxAdjustment: number;
}

export interface FlipResult {
  grossProfit: number;
  totalFees: number;
  totalCosts: number;
  netProfit: number;
  netMarginPct: number;
  roiPct: number;
  recommendation: "strong_yes" | "yes" | "marginal" | "no" | "strong_no";
}

export function calculateFlipNetProfit(input: FlipInput): FlipResult {
  const grossProfit = input.sellPrice - input.buyPrice;

  const marketplaceFee = input.sellPrice * (input.marketplaceFeePct / 100);
  const paymentFee = input.sellPrice * (input.paymentFeePct / 100);
  const totalFees = marketplaceFee + paymentFee;

  const totalCosts =
    totalFees +
    input.shippingCost +
    input.packingCost +
    input.taxAdjustment;

  const netProfit = grossProfit - totalCosts;
  const netMarginPct = input.sellPrice > 0 ? (netProfit / input.sellPrice) * 100 : 0;
  const roiPct = input.buyPrice > 0 ? (netProfit / input.buyPrice) * 100 : 0;

  let recommendation: FlipResult["recommendation"];
  if (roiPct > 40) recommendation = "strong_yes";
  else if (roiPct > 15) recommendation = "yes";
  else if (roiPct > 0) recommendation = "marginal";
  else if (roiPct > -15) recommendation = "no";
  else recommendation = "strong_no";

  return {
    grossProfit,
    totalFees,
    totalCosts,
    netProfit,
    netMarginPct,
    roiPct,
    recommendation,
  };
}
