import type { Confidence, Forecast, SealedSetData } from "@/lib/types/sealed";

export interface DisplayConfidenceInput {
  rawConfidence: Confidence;
  historyPoints: number;
  comparables: SealedSetData[];
  forecast: Forecast;
}

export interface DisplayConfidenceResult {
  confidence: Confidence;
  explanation: string;
}

const ORDER: Record<Confidence, number> = { Low: 0, Medium: 1, High: 2 };

function cap(raw: Confidence, ceiling: Confidence): Confidence {
  return ORDER[raw] <= ORDER[ceiling] ? raw : ceiling;
}

/**
 * Down-rank the model's stated confidence when the supporting evidence
 * is too thin for the report to honestly defend it.
 */
export function deriveDisplayConfidence(
  input: DisplayConfidenceInput,
): DisplayConfidenceResult {
  const { rawConfidence, historyPoints, comparables, forecast } = input;
  const strongComparables = comparables.length;

  if (historyPoints === 0) {
    return {
      confidence: "Low",
      explanation:
        "No measured price history is available for this product, so the projection relies entirely on heuristics and catalog-level signals.",
    };
  }

  if (historyPoints < 3) {
    if (strongComparables >= 3) {
      return {
        confidence: cap(rawConfidence, "Medium"),
        explanation: `Only ${historyPoints} measured price point${historyPoints === 1 ? "" : "s"} for this product, but ${strongComparables} comparable sealed products in the catalog support a directional read.`,
      };
    }
    return {
      confidence: "Low",
      explanation: `Only ${historyPoints} measured price point${historyPoints === 1 ? "" : "s"} and few close comparables — confidence is capped at Low until more history accumulates.`,
    };
  }

  if (historyPoints < 12) {
    const capped = cap(rawConfidence, "Medium");
    return {
      confidence: capped,
      explanation: `${historyPoints} months of price history is enough for a directional read, but the model needs ~12 points to defend High confidence. Spread is ±${forecast.predictionSpreadPercent.toFixed(1)}%.`,
    };
  }

  return {
    confidence: rawConfidence,
    explanation: `${historyPoints} months of price history plus ${strongComparables} catalog comparable${strongComparables === 1 ? "" : "s"} support the model's ${rawConfidence} confidence read.`,
  };
}
