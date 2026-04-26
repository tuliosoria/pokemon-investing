import type { Forecast, SealedSetData } from "@/lib/types/sealed";

export type QualityGrade = "Low" | "Medium" | "High";

export interface QualityRow {
  label: string;
  grade: QualityGrade;
  detail: string;
}

export interface ForecastQuality {
  rows: QualityRow[];
  overall: QualityGrade;
}

export interface BuildForecastQualityInput {
  history: { date: string }[];
  set: SealedSetData;
  forecast: Forecast;
  comparables: SealedSetData[];
  reprintRisk: "Low" | "Moderate" | "High";
}

function gradeFromScore(score: number): QualityGrade {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function dataCompletenessRow(input: BuildForecastQualityInput): QualityRow {
  const { history, set, forecast } = input;
  let score = 0;
  if (history.length > 0) score += 35;
  if (history.length >= 12) score += 15;
  if (set.factors.communityScore != null) score += 20;
  if (set.factors.chaseEvRatio != null) score += 15;
  if (forecast.estimatedFactors <= 2) score += 15;
  return {
    label: "Data completeness",
    grade: gradeFromScore(score),
    detail: `${history.length} history points · ${forecast.estimatedFactors} heuristic feature${forecast.estimatedFactors === 1 ? "" : "s"} · sentiment ${set.factors.communityScore != null ? "available" : "missing"}`,
  };
}

function historyCoverageRow(history: BuildForecastQualityInput["history"]): QualityRow {
  const n = history.length;
  let grade: QualityGrade;
  if (n >= 12) grade = "High";
  else if (n >= 3) grade = "Medium";
  else grade = "Low";
  return {
    label: "Historical price coverage",
    grade,
    detail: `${n} measured monthly price point${n === 1 ? "" : "s"}`,
  };
}

function comparablesRow(comparables: SealedSetData[]): QualityRow {
  const n = comparables.length;
  let grade: QualityGrade;
  if (n >= 3) grade = "High";
  else if (n >= 1) grade = "Medium";
  else grade = "Low";
  return {
    label: "Comparable-product strength",
    grade,
    detail: `${n} similar curated set${n === 1 ? "" : "s"} in catalog`,
  };
}

function sentimentRow(set: SealedSetData): QualityRow {
  const score = set.factors.communityScore ?? null;
  if (score == null) {
    return {
      label: "Sentiment strength",
      grade: "Low",
      detail: "No community-score data available",
    };
  }
  const grade = gradeFromScore(score);
  return {
    label: "Sentiment strength",
    grade,
    detail: `Community score ${score.toFixed(0)}/100 (${set.factors.communityScoreSource ?? "unknown source"})`,
  };
}

function reprintRow(reprintRisk: "Low" | "Moderate" | "High"): QualityRow {
  const grade: QualityGrade =
    reprintRisk === "Moderate" ? "Medium" : reprintRisk;
  return {
    label: "Reprint risk",
    grade,
    detail: `Print-run posture: ${reprintRisk}`,
  };
}

function rollUpOverall(rows: QualityRow[]): QualityGrade {
  const total = rows.reduce(
    (acc, r) => acc + (r.grade === "High" ? 2 : r.grade === "Medium" ? 1 : 0),
    0,
  );
  const max = rows.length * 2;
  const ratio = total / max;
  if (ratio >= 0.7) return "High";
  if (ratio >= 0.4) return "Medium";
  return "Low";
}

export function buildForecastQuality(
  input: BuildForecastQualityInput,
): ForecastQuality {
  const rows: QualityRow[] = [
    dataCompletenessRow(input),
    historyCoverageRow(input.history),
    comparablesRow(input.comparables),
    sentimentRow(input.set),
    reprintRow(input.reprintRisk),
  ];
  return { rows, overall: rollUpOverall(rows) };
}
