import type { Confidence, Recommendation, Signal } from "@/lib/types/sealed";

export interface RecommendationInput {
  signal: Signal;
  confidence: Confidence;
  roiPercent: number;
  releaseYear: number;
}

/**
 * Map raw model output to user-facing Buy / Hold / Watch / Avoid.
 *
 *   Sell  OR  roiPercent < 0           -> Avoid
 *   Buy   AND confidence === Low       -> Watch (uncertainty)
 *   Buy                                -> Buy
 *   Hold  AND age < 2 years            -> Watch (too new to commit)
 *   Hold                               -> Hold
 */
export function deriveRecommendation(input: RecommendationInput): Recommendation {
  const { signal, confidence, roiPercent, releaseYear } = input;
  if (roiPercent < 0) return "Avoid";
  if (signal === "Sell") return "Avoid";

  if (signal === "Buy") {
    return confidence === "Low" ? "Watch" : "Buy";
  }

  const ageYears = new Date().getFullYear() - releaseYear;
  return ageYears < 2 ? "Watch" : "Hold";
}
