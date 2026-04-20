import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { buildDynamicSetData } from "@/lib/domain/sealed-estimate";
import { getTopBuyOpportunities } from "@/lib/domain/top-buys";
import type { ProductType, SealedSetData, SealedPricing } from "@/lib/types/sealed";

const POKEDATA_PRODUCTS_URL = "https://www.pokedata.io/api/products";
const CACHE_TTL = 30 * 60;

interface PokeDataCatalogProduct {
  id: number | string;
  img_url?: string | null;
  language?: string | null;
  market_value?: number | null;
  name?: string | null;
  release_date?: string | null;
  tcg?: string | null;
}

function normalizeTopBuyKey({ name, productType }: Pick<SealedSetData, "name" | "productType">): string {
  return `${name}|${productType}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mergeTopBuySets(dynamicSets: SealedSetData[]): SealedSetData[] {
  const merged = new Map<string, SealedSetData>();

  for (const set of dynamicSets) {
    merged.set(normalizeTopBuyKey(set), set);
  }

  for (const set of SEALED_SETS) {
    merged.set(normalizeTopBuyKey(set), set);
  }

  return [...merged.values()];
}

function toDynamicPricing(product: PokeDataCatalogProduct): SealedPricing {
  const marketValue = product.market_value ?? null;

  return {
    pokedataId: String(product.id),
    name: product.name ?? "",
    releaseDate: product.release_date ?? null,
    imageUrl: product.img_url ?? null,
    tcgplayerPrice: marketValue,
    ebayPrice: null,
    pokedataPrice: marketValue,
    bestPrice: marketValue,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const limit = Math.min(
    Math.max(parseInt(params.get("limit") ?? "100") || 100, 1),
    100
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

  const cacheKey = JSON.stringify({ limit, filters });
  const cached = await cacheGet<{
    count: number;
    opportunities: Array<{
      id: string;
      name: string;
      productType: string;
      releaseYear: number;
      currentPrice: number;
      imageUrl: string | null;
      compositeScore: number;
      signal: string;
      confidence: string;
      roiPercent: number;
      projectedValue: number;
      dollarGain: number;
      annualRate: number;
      chaseCards: string[];
      printRunLabel: string;
      notes: string;
      set: SealedSetData;
      forecast: ReturnType<typeof getTopBuyOpportunities>[number]["forecast"];
    }>;
  }>("sealed-top-buys", cacheKey);

  if (cached) {
    return NextResponse.json(cached);
  }

  const res = await fetch(POKEDATA_PRODUCTS_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "PokeData products failed" },
      { status: 502 }
    );
  }

  const rawProducts = (await res.json()) as PokeDataCatalogProduct[];
  if (!Array.isArray(rawProducts)) {
    return NextResponse.json(
      { error: "Unexpected PokeData products response" },
      { status: 502 }
    );
  }

  const catalogSets = rawProducts
    .filter(
      (product) =>
        product.tcg === "Pokemon" &&
        product.language === "ENGLISH" &&
        typeof product.market_value === "number" &&
        product.market_value > 0 &&
        !String(product.name ?? "").toLowerCase().includes("code card")
    )
    .map(toDynamicPricing)
    .map(buildDynamicSetData);

  const results = getTopBuyOpportunities(
    limit,
    filters,
    mergeTopBuySets(catalogSets)
  );

  const payload = {
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
      set,
      forecast,
    })),
  };

  await cachePut("sealed-top-buys", cacheKey, payload, CACHE_TTL);

  return NextResponse.json(payload);
}
