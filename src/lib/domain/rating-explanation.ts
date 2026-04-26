import type {
  Forecast,
  Recommendation,
  SealedSetData,
} from "@/lib/types/sealed";

export interface RatingExplanationInput {
  recommendation: Recommendation;
  forecast: Forecast;
  set: SealedSetData;
}

export interface RatingExplanation {
  headline: string;
  bullets: string[];
}

const RECOMMENDATION_HEADLINE: Record<Recommendation, string> = {
  Buy: "Model favors accumulation at current levels.",
  Hold: "Model sees a balanced risk/reward — hold existing exposure.",
  Watch: "Insufficient conviction for a position — keep on watchlist.",
  Avoid: "Model flags more downside than upside in the 5-year window.",
};

function liquidityBullet(tier: SealedSetData["factors"]["liquidityTier"]): string {
  switch (tier) {
    case "high":
      return "Liquidity tier is high — sealed copies trade frequently, tightening exit pricing.";
    case "low":
      return "Liquidity tier is low — sales are thin and exit pricing may slip versus the listed market value.";
    default:
      return "Liquidity tier is normal — execution risk is limited but not zero.";
  }
}

function communityBullet(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 70) {
    return `Community demand score is ${score.toFixed(0)}/100 — engagement is well above the catalog average.`;
  }
  if (score >= 45) {
    return `Community demand score is ${score.toFixed(0)}/100 — engagement is roughly in line with the catalog.`;
  }
  return `Community demand score is ${score.toFixed(0)}/100 — engagement is muted relative to comparable products.`;
}

function chaseBullet(ratio: number | null | undefined): string | null {
  if (ratio == null) return null;
  if (ratio >= 1) {
    return `Expected chase value covers ${(ratio * 100).toFixed(0)}% of the sealed price — the chase EV alone underwrites the buy.`;
  }
  if (ratio >= 0.5) {
    return `Expected chase value is ${(ratio * 100).toFixed(0)}% of the sealed price — a meaningful but partial floor.`;
  }
  return `Expected chase value is only ${(ratio * 100).toFixed(0)}% of the sealed price — limited downside support from singles.`;
}

function cycleBullet(score: number): string {
  if (score >= 70) return `Market-cycle indicator is ${score}/100 — broader sealed market is in an upcycle.`;
  if (score <= 35) return `Market-cycle indicator is ${score}/100 — broader sealed market is soft.`;
  return `Market-cycle indicator is ${score}/100 — broader sealed market is neutral.`;
}

export function buildRatingExplanation(
  input: RatingExplanationInput,
): RatingExplanation {
  const { recommendation, forecast, set } = input;
  const bullets: string[] = [];

  bullets.push(
    `Projected 5-year ROI is ${forecast.roiPercent >= 0 ? "+" : ""}${forecast.roiPercent.toFixed(1)}% at an annualized rate of ${(forecast.annualRate * 100).toFixed(1)}%.`,
  );

  bullets.push(liquidityBullet(set.factors.liquidityTier));

  const ageYears = new Date().getFullYear() - set.releaseYear;
  if (ageYears < 2) {
    bullets.push(
      `Set is only ${ageYears} year${ageYears === 1 ? "" : "s"} old — early-window prints are historically the most volatile.`,
    );
  } else if (ageYears >= 10) {
    bullets.push(
      `Set is ${ageYears} years old — sealed supply tends to compress past the 10-year mark.`,
    );
  }

  const chase = chaseBullet(set.factors.chaseEvRatio);
  if (chase) bullets.push(chase);

  const community = communityBullet(set.factors.communityScore);
  if (community) bullets.push(community);

  if (bullets.length < 5) {
    bullets.push(cycleBullet(set.factors.marketCycle));
  }

  return {
    headline: RECOMMENDATION_HEADLINE[recommendation],
    bullets: bullets.slice(0, 5),
  };
}
