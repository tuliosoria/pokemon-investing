/**
 * Fee normalization and recommendation band utilities
 */

export interface FeeProfile {
  marketplaceFeePct: number;
  paymentFeePct: number;
  shippingCost: number;
  packingCost: number;
  insuranceCost: number;
  taxAdjustment: number;
}

export const DEFAULT_FEE_PROFILES: Record<string, Partial<FeeProfile>> = {
  ebay: { marketplaceFeePct: 13.25, paymentFeePct: 0 },
  tcgplayer: { marketplaceFeePct: 10.25, paymentFeePct: 2.5 },
  mercari: { marketplaceFeePct: 10, paymentFeePct: 0 },
  private: { marketplaceFeePct: 0, paymentFeePct: 2.9 },
};

export function normalizeMarketplaceFees(
  marketplace: string
): Partial<FeeProfile> {
  return DEFAULT_FEE_PROFILES[marketplace.toLowerCase()] ?? {};
}

export type RecommendationBand =
  | "strong_yes"
  | "yes"
  | "marginal"
  | "no"
  | "strong_no";

export const RECOMMENDATION_CONFIG: Record<
  RecommendationBand,
  { label: string; color: string; emoji: string; description: string }
> = {
  strong_yes: {
    label: "Strong Yes",
    color: "text-green-400",
    emoji: "🟢",
    description: "This looks like a great opportunity.",
  },
  yes: {
    label: "Yes",
    color: "text-green-300",
    emoji: "🟢",
    description: "Solid expected return with acceptable risk.",
  },
  marginal: {
    label: "Marginal",
    color: "text-yellow-400",
    emoji: "🟡",
    description: "Slightly positive, but thin margins. Proceed with caution.",
  },
  no: {
    label: "No",
    color: "text-orange-400",
    emoji: "🟠",
    description: "Expected return is negative or too thin.",
  },
  strong_no: {
    label: "Strong No",
    color: "text-red-400",
    emoji: "🔴",
    description: "Significant expected loss. Avoid.",
  },
};
