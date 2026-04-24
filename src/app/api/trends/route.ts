import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  getStoredTrendSnapshot,
  isStoredTrendFresh,
  putStoredTrendSnapshot,
} from "@/lib/db/trend-snapshots";

// google-trends-api is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api");

const CACHE_TTL = 60 * 60; // 1 hour route cache over owned trend snapshots

export interface TrendResult {
  keyword: string;
  current: number;
  average: number;
  trendDirection: "rising" | "stable" | "declining";
  popularityScore: number;
}

interface TrendApiResponse {
  trend: TrendResult;
  posture: {
    source: "owned-snapshot" | "live-refresh" | "neutral-fallback" | "cached";
    capturedAt: string | null;
    stale: boolean;
    liveLookupAllowed: boolean;
  };
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

function buildNeutralTrend(keyword: string): TrendResult {
  return {
    keyword,
    current: 0,
    average: 0,
    trendDirection: "stable",
    popularityScore: 50,
  };
}

function buildStoredResponse(
  stored: NonNullable<Awaited<ReturnType<typeof getStoredTrendSnapshot>>>,
  allowLive: boolean
): TrendApiResponse {
  return {
    trend: {
      keyword: stored.keyword,
      current: stored.current,
      average: stored.average,
      trendDirection: stored.trendDirection,
      popularityScore: stored.popularityScore,
    },
    posture: {
      source: "owned-snapshot",
      capturedAt: stored.capturedAt,
      stale: !isStoredTrendFresh(stored.capturedAt),
      liveLookupAllowed: allowLive,
    },
  };
}

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  const allowLive = request.nextUrl.searchParams.get("allowLive") === "1";
  const forceRefresh = request.nextUrl.searchParams.get("forceRefresh") === "1";
  if (!keyword || keyword.length < 2) {
    return NextResponse.json(
      { error: "Keyword required (min 2 chars)" },
      { status: 400 }
    );
  }

  const cacheKey = keyword.toLowerCase().replace(/\s+/g, " ");
  const cached = await cacheGet<TrendApiResponse | TrendResult>("trends", cacheKey);
  if (cached) {
    if ("trend" in cached && "posture" in cached) {
      return NextResponse.json(cached);
    }

    return NextResponse.json({
      trend: cached,
      posture: {
        source: "cached",
        capturedAt: null,
        stale: false,
        liveLookupAllowed: allowLive,
      },
    } satisfies TrendApiResponse);
  }

  const stored = await getStoredTrendSnapshot(keyword);
  if (stored && !forceRefresh) {
    const response = buildStoredResponse(stored, allowLive);
    await cachePut(
      "trends",
      cacheKey,
      response,
      isStoredTrendFresh(stored.capturedAt) ? CACHE_TTL : Math.floor(CACHE_TTL / 2)
    );
    return NextResponse.json(response);
  }

  if (!allowLive) {
    if (stored) {
      return NextResponse.json(buildStoredResponse(stored, allowLive));
    }

    const response = {
      trend: buildNeutralTrend(keyword),
      posture: {
        source: "neutral-fallback",
        capturedAt: null,
        stale: true,
        liveLookupAllowed: false,
      },
    } satisfies TrendApiResponse;
    await cachePut("trends", cacheKey, response, Math.floor(CACHE_TTL / 2));
    return NextResponse.json(response);
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
      const capturedAt = new Date().toISOString();
      const neutral = buildNeutralTrend(keyword);
      await putStoredTrendSnapshot({
        ...neutral,
        capturedAt,
        source: "neutral-fallback",
      });
      const response = {
        trend: neutral,
        posture: {
          source: "neutral-fallback",
          capturedAt,
          stale: false,
          liveLookupAllowed: true,
        },
      } satisfies TrendApiResponse;
      await cachePut("trends", cacheKey, response, CACHE_TTL);
      return NextResponse.json(response);
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
    const capturedAt = new Date().toISOString();

    await putStoredTrendSnapshot({
      ...trendResult,
      capturedAt,
      source: "google-trends-api",
    });

    const response = {
      trend: trendResult,
      posture: {
        source: "live-refresh",
        capturedAt,
        stale: false,
        liveLookupAllowed: true,
      },
    } satisfies TrendApiResponse;
    await cachePut("trends", cacheKey, response, CACHE_TTL);
    return NextResponse.json(response);
  } catch (err) {
    console.error("Google Trends error:", err);

    if (stored) {
      return NextResponse.json(buildStoredResponse(stored, true));
    }

    return NextResponse.json({
      trend: buildNeutralTrend(keyword),
      posture: {
        source: "neutral-fallback",
        capturedAt: null,
        stale: true,
        liveLookupAllowed: true,
      },
    } satisfies TrendApiResponse);
  }
}
