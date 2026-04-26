import type { Forecast, SealedSetData } from "@/lib/types/sealed";

export type DriverImpact = "positive" | "negative" | "neutral";

export interface KeyDriver {
  label: string;
  impact: DriverImpact;
  explanation: string;
}

export interface BuildKeyDriversInput {
  set: SealedSetData;
  forecast: Forecast;
  comparables: SealedSetData[];
}

export function buildKeyDrivers({
  set,
  forecast,
  comparables,
}: BuildKeyDriversInput): KeyDriver[] {
  const drivers: KeyDriver[] = [];
  const ageYears = new Date().getFullYear() - set.releaseYear;

  // Historical price trend
  {
    const annualPct = forecast.annualRate * 100;
    let impact: DriverImpact = "neutral";
    let explanation = `Modeled annual price change of ${annualPct >= 0 ? "+" : ""}${annualPct.toFixed(1)}% sits in a flat range.`;
    if (forecast.annualRate > 0.05) {
      impact = "positive";
      explanation = `Modeled annual price change of +${annualPct.toFixed(1)}% indicates a healthy upward trend.`;
    } else if (forecast.annualRate < -0.02) {
      impact = "negative";
      explanation = `Modeled annual price change of ${annualPct.toFixed(1)}% suggests a declining trajectory.`;
    }
    drivers.push({ label: "Historical price trend", impact, explanation });
  }

  // Volatility / prediction spread
  {
    const spread = forecast.predictionSpreadPercent;
    let impact: DriverImpact = "neutral";
    let explanation = `Prediction spread of ±${spread.toFixed(1)}% is within normal bounds for sealed product modeling.`;
    if (spread > 25) {
      impact = "negative";
      explanation = `Wide prediction spread of ±${spread.toFixed(1)}% reflects elevated outcome uncertainty.`;
    }
    drivers.push({ label: "Volatility / prediction spread", impact, explanation });
  }

  // Age since release
  {
    let impact: DriverImpact = "neutral";
    let explanation = `${ageYears} year${ageYears === 1 ? "" : "s"} since release — past initial release volatility but not yet vintage.`;
    if (ageYears >= 5) {
      impact = "positive";
      explanation = `${ageYears} years since release — established vintage premium with thinning sealed supply.`;
    } else if (ageYears < 1) {
      impact = "negative";
      explanation = `Released within the last year — newcomers tend to be volatile while supply still floods the market.`;
    }
    drivers.push({ label: "Age since release", impact, explanation });
  }

  // Print run / supply tier
  {
    let impact: DriverImpact = "neutral";
    let explanation = `Print run posture: ${set.printRunLabel}.`;
    if (set.printRunLabel === "Limited") {
      impact = "positive";
      explanation = `Limited print run constrains future supply, supporting price appreciation.`;
    } else if (set.printRunLabel === "Overprinted") {
      impact = "negative";
      explanation = `Overprinted supply suppresses scarcity and limits long-term upside.`;
    }
    drivers.push({ label: "Print run / supply", impact, explanation });
  }

  // Community demand
  {
    const score = set.factors.communityScore;
    if (typeof score === "number") {
      let impact: DriverImpact = "neutral";
      let explanation = `Community score of ${score.toFixed(0)}/100 reflects steady but unremarkable collector interest.`;
      if (score >= 65) {
        impact = "positive";
        explanation = `Strong community score of ${score.toFixed(0)}/100 indicates active collector demand.`;
      } else if (score <= 40) {
        impact = "negative";
        explanation = `Weak community score of ${score.toFixed(0)}/100 suggests soft collector interest.`;
      }
      drivers.push({ label: "Community demand", impact, explanation });
    }
  }

  // Chase-card expected value
  {
    const ratio = set.factors.chaseEvRatio;
    if (typeof ratio === "number") {
      const impact: DriverImpact = ratio >= 0.4 ? "positive" : "neutral";
      const explanation =
        impact === "positive"
          ? `Expected chase-card pull value covers ${(ratio * 100).toFixed(0)}% of sealed price — meaningful pull EV.`
          : `Expected chase-card pull value covers ${(ratio * 100).toFixed(0)}% of sealed price — modest pull EV.`;
      drivers.push({ label: "Chase-card expected value", impact, explanation });
    }
  }

  // Set singles secondary value
  {
    const ratio = set.factors.setSinglesValueRatio;
    if (typeof ratio === "number") {
      const impact: DriverImpact = ratio >= 1 ? "positive" : "neutral";
      const explanation =
        impact === "positive"
          ? `Singles pool value is ${ratio.toFixed(2)}× the sealed price — a deep secondary market underpins demand.`
          : `Singles pool value is ${ratio.toFixed(2)}× the sealed price — secondary demand is modest.`;
      drivers.push({ label: "Set singles secondary value", impact, explanation });
    }
  }

  // Comparable sealed products
  {
    const n = comparables.length;
    const impact: DriverImpact = n >= 3 ? "positive" : "neutral";
    const explanation =
      impact === "positive"
        ? `${n} catalog comparables provide a strong cross-reference for the projection.`
        : `${n} catalog comparable${n === 1 ? "" : "s"} — limited cross-reference data.`;
    drivers.push({ label: "Comparable sealed products", impact, explanation });
  }

  return drivers;
}
