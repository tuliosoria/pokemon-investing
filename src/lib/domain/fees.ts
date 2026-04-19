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

export type Verdict = "grade" | "maybe" | "dont_grade";

export function bandToVerdict(band: RecommendationBand): Verdict {
  if (band === "strong_yes" || band === "yes") return "grade";
  if (band === "marginal") return "maybe";
  return "dont_grade";
}

export const VERDICT_CONFIG: Record<
  Verdict,
  { label: string; color: string; bgColor: string; description: string }
> = {
  grade: {
    label: "Grade it",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "Positive expected value. This card is worth grading.",
  },
  maybe: {
    label: "Maybe",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    description: "Thin margins. Could go either way.",
  },
  dont_grade: {
    label: "Don't grade",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    description: "Negative expected value. Not worth it.",
  },
};
