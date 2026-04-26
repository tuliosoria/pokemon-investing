import type { Confidence, Forecast, SealedSetData } from "@/lib/types/sealed";

export interface DisplayConfidenceInput {
  forecast: Forecast;
  set: SealedSetData;
  comparables?: SealedSetData[];
}

export interface DisplayConfidenceResult {
  confidence: Confidence;
  explanation: string;
}

const ORDER: Record<Confidence, number> = { Low: 0, Medium: 1, High: 2 };
const FROM_RANK: Confidence[] = ["Low", "Medium", "High"];

function clampRank(rank: number): Confidence {
  if (rank < 0) return "Low";
  if (rank > 2) return "High";
  return FROM_RANK[rank];
}

/**
 * Adjust the model's stated confidence based on signals that are stable
 * across listing surfaces (no dependence on per-page history loading).
 *
 * Inputs considered:
 *   - rawConfidence: forecast.confidence
 *   - forecast.estimatedFactors (heuristic count → downgrade)
 *   - forecast.predictionSpreadPercent (wide spread → downgrade)
 *   - comparables.length (more comparables → support raw confidence)
 *   - set.factors.communityScore (very low → mild downgrade)
 */
export function deriveDisplayConfidence(
  input: DisplayConfidenceInput,
): DisplayConfidenceResult {
  const { forecast, set, comparables = [] } = input;
  const rawConfidence = forecast.confidence;

  let rank = ORDER[rawConfidence];
  const reasons: string[] = [];

  if (forecast.estimatedFactors >= 4) {
    rank -= 1;
    reasons.push(
      `${forecast.estimatedFactors} model inputs were heuristic estimates`,
    );
  } else if (forecast.estimatedFactors >= 2) {
    reasons.push(
      `${forecast.estimatedFactors} model inputs were heuristic estimates`,
    );
  }

  if (forecast.predictionSpreadPercent > 35) {
    rank -= 1;
    reasons.push(
      `wide ±${forecast.predictionSpreadPercent.toFixed(1)}% prediction spread`,
    );
  } else if (forecast.predictionSpreadPercent > 25) {
    reasons.push(
      `elevated ±${forecast.predictionSpreadPercent.toFixed(1)}% prediction spread`,
    );
  }

  const community = set.factors.communityScore;
  if (typeof community === "number" && community < 30) {
    rank -= 1;
    reasons.push(`very low community score (${community.toFixed(0)}/100)`);
  }

  if (comparables.length >= 3) {
    rank += 1;
    reasons.push(
      `${comparables.length} catalog comparables support a directional read`,
    );
  }

  // Never push above the model's own raw confidence — comparables can only
  // restore lost ground, not invent confidence the model didn't claim.
  if (rank > ORDER[rawConfidence]) rank = ORDER[rawConfidence];

  const confidence = clampRank(rank);
  const explanation =
    reasons.length === 0
      ? `Model reports ${rawConfidence} confidence and the supporting signals (heuristic factors, prediction spread, comparables) are consistent.`
      : `Adjusted from model's ${rawConfidence} read based on: ${reasons.join("; ")}.`;

  return { confidence, explanation };
}
