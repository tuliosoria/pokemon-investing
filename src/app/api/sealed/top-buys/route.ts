import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import { getSealedForecastModels } from "@/lib/db/sealed-forecast-models";
import {
  getLatestStoredSealedPriceSnapshot,
  getStoredSealedProductMeta,
} from "@/lib/db/sealed-pricing";
import { loadSealedSearchCatalog } from "@/lib/db/sealed-search";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import {
  buildDynamicSetData,
  buildPricingContext,
  inferProductType,
} from "@/lib/domain/sealed-estimate";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
  getSyncedPriceChartingEntryBySetId,
} from "@/lib/domain/pricecharting-catalog";
import { resolveSealedProductImageAsset } from "@/lib/domain/sealed-image";
import { getTopBuyOpportunities } from "@/lib/domain/top-buys";
import communityScoreData from "@/lib/data/sealed-ml/community-score.json";
import type { ProductType, SealedSetData, SealedPricing, CommunityScoreFile } from "@/lib/types/sealed";

const communityScoreMap = (communityScoreData as unknown as CommunityScoreFile).sets;

/** Merge community score sub-signals into factors for any SealedSetData. */
function mergeCommunityScoreFactors(set: SealedSetData): SealedSetData {
  if (
    set.factors.communityScore != null &&
    set.factors.redditScore != null
  ) {
    return set; // already populated by buildDynamicSetData
  }

  // Name-based lookup with variant-stripping and prefix matching
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/\b(shiny\s*vault|booster\s*box|booster\s*bundle|booster\s*pack|elite\s*trainer\s*box|etb|upc|ultra\s*premium|tin|case|collection\s*box|collection|special\s*collection)\b/g, "")
      .replace(/[^a-z0-9]+/g, "");
  const normalized = norm(set.name);
  let entry: CommunityScoreFile["sets"][string] | undefined;
  for (const e of Object.values(communityScoreMap)) {
    if (norm(e.setName) === normalized) { entry = e; break; }
  }
  if (!entry) {
    // Prefix match for variants (e.g. "Hidden Fates Shiny Vault" → "Hidden Fates")
    for (const e of Object.values(communityScoreMap)) {
      const entryNorm = norm(e.setName);
      if (entryNorm.length >= 4 && normalized.startsWith(entryNorm)) { entry = e; break; }
    }
  }
  if (!entry) return set;

  return {
    ...set,
    factors: {
      ...set.factors,
      communityScore: entry.communityScore,
      redditScore: entry.redditScore,
      googleTrendsScore: entry.googleTrendsScore,
      forumScore: entry.forumScore,
    },
  };
}

const CACHE_TTL = 30 * 60;
const VARIANT_WORDS = ["costco", "walmart", "target", "pokemon center", "display"];

interface SealedTopBuyPosture {
  source: "owned-catalog";
  liveCatalogAllowed: false;
  ownedProductsConsidered: number;
  storedSnapshotsUsed: number;
  syncedCatalogPricesUsed: number;
  bundledCatalogFallbacks: number;
}

interface SealedTopBuyResponse {
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
  posture: SealedTopBuyPosture;
}

function normalizeTopBuyKey({
  name,
  productType,
}: Pick<SealedSetData, "name" | "productType">): string {
  return `${name}|${productType}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeCatalogName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .trim();
}

function roundPrice(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function buildCatalogSet(pricing: SealedPricing): SealedSetData {
  const dynamicSet = buildDynamicSetData(pricing);
  const productType = inferProductType(pricing.name);
  const pricingNorm = normalizeCatalogName(pricing.name);
  const isVariant = VARIANT_WORDS.some((variant) => pricingNorm.includes(variant));

  if (isVariant) {
    return dynamicSet;
  }

  const curatedMatch = SEALED_SETS.find(
    (set) =>
      set.productType === productType &&
      pricingNorm.includes(normalizeCatalogName(set.name))
  );

  if (!curatedMatch) {
    return dynamicSet;
  }

  return mergeCommunityScoreFactors({
    ...curatedMatch,
    currentPrice: pricing.bestPrice ?? curatedMatch.currentPrice,
    pokedataId: pricing.pokedataId,
    priceChartingId: pricing.priceChartingId ?? curatedMatch.priceChartingId,
    imageUrl: pricing.imageUrl ?? curatedMatch.imageUrl,
    imageAsset: pricing.imageAsset ?? curatedMatch.imageAsset,
    pricingContext: buildPricingContext(pricing),
    // Merge dynamically-computed live signals (liquidity tier, chase EV)
    // onto the curated factors so the forecast model can use them.
    factors: {
      ...curatedMatch.factors,
      liquidityTier:
        dynamicSet.factors.liquidityTier ?? curatedMatch.factors.liquidityTier,
      expectedChaseValue:
        dynamicSet.factors.expectedChaseValue ??
        curatedMatch.factors.expectedChaseValue,
      chaseEvRatio:
        dynamicSet.factors.chaseEvRatio ?? curatedMatch.factors.chaseEvRatio,
      setSinglesValue:
        dynamicSet.factors.setSinglesValue ??
        curatedMatch.factors.setSinglesValue,
      setSinglesValueRatio:
        dynamicSet.factors.setSinglesValueRatio ??
        curatedMatch.factors.setSinglesValueRatio,
      communityScore:
        dynamicSet.factors.communityScore ?? curatedMatch.factors.communityScore,
      redditScore:
        dynamicSet.factors.redditScore ?? curatedMatch.factors.redditScore,
      googleTrendsScore:
        dynamicSet.factors.googleTrendsScore ?? curatedMatch.factors.googleTrendsScore,
      forumScore:
        dynamicSet.factors.forumScore ?? curatedMatch.factors.forumScore,
    },
  });
}

function withOwnedCatalogNote(set: SealedSetData): SealedSetData {
  if (set.curated) {
    return set;
  }

  return {
    ...set,
    notes:
      "Owned runtime pricing from sealed search metadata, synced PriceCharting snapshots, and stored sealed history.",
  };
}

function mergeTopBuySets(dynamicSets: SealedSetData[]): SealedSetData[] {
  const merged = new Map<string, SealedSetData>();

  for (const set of dynamicSets) {
    merged.set(normalizeTopBuyKey(set), set);
  }

  for (const set of SEALED_SETS) {
    const key = normalizeTopBuyKey(set);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, mergeCommunityScoreFactors(set));
      continue;
    }

    if (existing.curated) {
      continue;
    }

    merged.set(key, mergeCommunityScoreFactors({
      ...set,
      currentPrice: existing.currentPrice > 0 ? existing.currentPrice : set.currentPrice,
      imageUrl: existing.imageUrl ?? set.imageUrl,
      imageAsset: existing.imageAsset ?? set.imageAsset,
      pokedataId: existing.pokedataId ?? set.pokedataId,
      priceChartingId: existing.priceChartingId ?? set.priceChartingId,
      tcgplayerUrl: existing.tcgplayerUrl ?? set.tcgplayerUrl,
      trendData: existing.trendData ?? set.trendData,
      pricingContext: existing.pricingContext ?? set.pricingContext,
    }));
  }

  return [...merged.values()];
}

async function resolveOwnedPricing(
  entry: Awaited<ReturnType<typeof loadSealedSearchCatalog>>[number]
): Promise<{
  pricing: SealedPricing | null;
  usedStoredSnapshot: boolean;
  usedSyncedCatalogPrice: boolean;
  usedBundledCatalogFallback: boolean;
}> {
  const [meta, latestSnapshot] = await Promise.all([
    getStoredSealedProductMeta(entry.pokedataId),
    getLatestStoredSealedPriceSnapshot(entry.pokedataId),
  ]);
  const exactSyncedEntry =
    getSyncedPriceChartingEntryBySetId(entry.catalogId) ??
    getSyncedPriceChartingEntryById(entry.priceChartingId);
  const syncedPriceChartingEntry =
    exactSyncedEntry ??
    findSyncedPriceChartingEntry({
      name: meta?.catalogDisplayName ?? meta?.name ?? entry.name,
      productType: entry.productType,
      releaseDate: meta?.releaseDate ?? entry.releaseDate,
    });
  const snapshotBestPrice =
    roundPrice(latestSnapshot?.bestPrice) ??
    roundPrice(latestSnapshot?.priceChartingPrice) ??
    roundPrice(latestSnapshot?.pokedataPrice) ??
    roundPrice(latestSnapshot?.tcgplayerPrice) ??
    roundPrice(latestSnapshot?.ebayPrice);
  const priceChartingPrice =
    roundPrice(latestSnapshot?.priceChartingPrice) ??
    roundPrice(syncedPriceChartingEntry?.newPrice);
  const localCatalogPrice = roundPrice(entry.currentPrice);
  const pokedataPrice =
    roundPrice(latestSnapshot?.pokedataPrice) ?? localCatalogPrice;
  const bestPrice = snapshotBestPrice ?? priceChartingPrice ?? pokedataPrice;

  if (bestPrice === null) {
    return {
      pricing: null,
      usedStoredSnapshot: false,
      usedSyncedCatalogPrice: false,
      usedBundledCatalogFallback: false,
    };
  }

  const name = meta?.catalogDisplayName ?? meta?.name ?? entry.name;
  const releaseDate = meta?.releaseDate ?? entry.releaseDate ?? null;
  const imageAsset = resolveSealedProductImageAsset({
    setId: meta?.catalogId ?? entry.catalogId,
    pokedataId: entry.pokedataId,
    name,
    ownedImagePath: meta?.ownedImagePath ?? null,
    fallbackCandidates: [meta?.imgUrl, entry.imageUrl],
    mirrorSourceUrl: meta?.imageMirrorSourceUrl ?? meta?.imgUrl ?? entry.imageUrl,
    mirrorSourceProvider: meta?.imageMirrorSourceProvider ?? null,
    mirroredAt: meta?.imageMirroredAt ?? null,
  });

  return {
    pricing: {
      pokedataId: entry.pokedataId,
      name,
      releaseDate,
      imageUrl: imageAsset.selectedUrl,
      imageAsset,
      priceChartingId:
        meta?.priceChartingId ??
        entry.priceChartingId ??
        syncedPriceChartingEntry?.priceChartingId,
      priceChartingProductName:
        meta?.priceChartingProductName ??
        syncedPriceChartingEntry?.productName ??
        null,
      priceChartingConsoleName:
        meta?.priceChartingConsoleName ??
        syncedPriceChartingEntry?.consoleName ??
        null,
      priceChartingPrice,
      tcgplayerPrice: roundPrice(latestSnapshot?.tcgplayerPrice),
      ebayPrice: roundPrice(latestSnapshot?.ebayPrice),
      pokedataPrice,
      bestPrice,
      primaryProvider:
        latestSnapshot?.primaryProvider ??
        (priceChartingPrice ? "pricecharting" : "pokedata"),
      snapshotDate:
        latestSnapshot?.snapshotDate ??
        latestSnapshot?.updatedAt ??
        syncedPriceChartingEntry?.capturedAt?.slice(0, 10) ??
        null,
      salesVolume: syncedPriceChartingEntry?.salesVolume ?? null,
      manualOnlyPrice: syncedPriceChartingEntry?.manualOnlyPrice ?? null,
    },
    usedStoredSnapshot: snapshotBestPrice !== null,
    usedSyncedCatalogPrice:
      snapshotBestPrice === null && priceChartingPrice !== null,
    usedBundledCatalogFallback:
      snapshotBestPrice === null && priceChartingPrice === null && localCatalogPrice !== null,
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
  const cached = await cacheGet<SealedTopBuyResponse>("sealed-top-buys", cacheKey);

  if (cached) {
    return NextResponse.json(cached);
  }

  const ownedCatalog = await loadSealedSearchCatalog();
  const resolvedCatalogEntries = await Promise.all(
    ownedCatalog.map(resolveOwnedPricing)
  );
  const posture = resolvedCatalogEntries.reduce<SealedTopBuyPosture>(
    (acc, entry) => {
      if (entry.usedStoredSnapshot) acc.storedSnapshotsUsed += 1;
      if (entry.usedSyncedCatalogPrice) acc.syncedCatalogPricesUsed += 1;
      if (entry.usedBundledCatalogFallback) acc.bundledCatalogFallbacks += 1;
      return acc;
    },
    {
      source: "owned-catalog",
      liveCatalogAllowed: false,
      ownedProductsConsidered: ownedCatalog.length,
      storedSnapshotsUsed: 0,
      syncedCatalogPricesUsed: 0,
      bundledCatalogFallbacks: 0,
    }
  );
  const catalogSets = resolvedCatalogEntries
    .flatMap((entry) => (entry.pricing ? [entry.pricing] : []))
    .map(buildCatalogSet)
    .map(withOwnedCatalogNote);

  const models = await getSealedForecastModels();
  const results = getTopBuyOpportunities(
    models,
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
    posture,
  } satisfies SealedTopBuyResponse;

  await cachePut("sealed-top-buys", cacheKey, payload, CACHE_TTL);

  return NextResponse.json(payload);
}
