import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";

// google-trends-api is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api");

const CACHE_TTL = 24 * 60 * 60; // 24 hours — trends don't change fast

export interface TrendResult {
  keyword: string;
  current: number;
  average: number;
  trendDirection: "rising" | "stable" | "declining";
  popularityScore: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Convert Google Trends data into a 5-95 factor score.
 * Blends absolute interest level (60%) with momentum (40%).
 */
function computePopularityScore(current: number, average: number): number {
  if (average <= 0) return 50;
  const momentum = current / average;
  const momentumScore = clamp(momentum * 50, 10, 90);
  const score = current * 0.6 + momentumScore * 0.4;
  return clamp(Math.round(score), 5, 95);
}

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  if (!keyword || keyword.length < 2) {
    return NextResponse.json(
      { error: "Keyword required (min 2 chars)" },
      { status: 400 }
    );
  }

  const cacheKey = keyword.toLowerCase().replace(/\s+/g, " ");

  // Check cache (24h TTL)
  const cached = await cacheGet<TrendResult>("trends", cacheKey);
  if (cached) {
    return NextResponse.json({ trend: cached });
  }

  try {
    const result = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      geo: "US",
    });

    const data = JSON.parse(result);
    const timeline = data?.default?.timelineData;

    if (!timeline || timeline.length === 0) {
      const neutral: TrendResult = {
        keyword,
        current: 0,
        average: 0,
        trendDirection: "stable",
        popularityScore: 50,
      };
      await cachePut("trends", cacheKey, neutral, CACHE_TTL);
      return NextResponse.json({ trend: neutral });
    }

    const values: number[] = timeline.map(
      (p: { value: number[] }) => p.value[0]
    );
    const current = values[values.length - 1];
    const average = Math.round(
      values.reduce((s: number, v: number) => s + v, 0) / values.length
    );

    const trendDirection: TrendResult["trendDirection"] =
      current > average * 1.2
        ? "rising"
        : current < average * 0.8
          ? "declining"
          : "stable";

    const popularityScore = computePopularityScore(current, average);

    const trendResult: TrendResult = {
      keyword,
      current,
      average,
      trendDirection,
      popularityScore,
    };

    await cachePut("trends", cacheKey, trendResult, CACHE_TTL);
    return NextResponse.json({ trend: trendResult });
  } catch (err) {
    console.error("Google Trends error:", err);
    return NextResponse.json(
      { error: "Failed to fetch trend data" },
      { status: 502 }
    );
  }
}
