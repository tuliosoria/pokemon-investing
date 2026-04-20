import { NextRequest, NextResponse } from "next/server";
import { getTopBuyOpportunities } from "@/lib/domain/top-buys";
import type { ProductType } from "@/lib/types/sealed";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const limit = Math.min(
    Math.max(parseInt(params.get("limit") ?? "50") || 50, 1),
    50
  );

  const filters: {
    productType?: ProductType;
    minScore?: number;
    maxPrice?: number;
    setName?: string;
  } = {};

  const productType = params.get("productType");
  if (productType) filters.productType = productType as ProductType;

  const minScore = params.get("minScore");
  if (minScore) filters.minScore = parseInt(minScore) || undefined;

  const maxPrice = params.get("maxPrice");
  if (maxPrice) filters.maxPrice = parseFloat(maxPrice) || undefined;

  const setName = params.get("setName");
  if (setName) filters.setName = setName;

  const results = getTopBuyOpportunities(limit, filters);

  return NextResponse.json({
    count: results.length,
    opportunities: results.map(({ set, forecast }) => ({
      id: set.id,
      name: set.name,
      productType: set.productType,
      releaseYear: set.releaseYear,
      currentPrice: set.currentPrice,
      imageUrl: set.imageUrl ?? null,
      compositeScore: forecast.compositeScore,
      signal: forecast.signal,
      confidence: forecast.confidence,
      roiPercent: forecast.roiPercent,
      projectedValue: forecast.projectedValue,
      dollarGain: forecast.dollarGain,
      annualRate: forecast.annualRate,
      chaseCards: set.chaseCards,
      printRunLabel: set.printRunLabel,
      notes: set.notes,
    })),
  });
}
