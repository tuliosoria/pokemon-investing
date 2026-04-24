import { SEALED_SETS } from "@/lib/data/sealed-sets";
import topChaseCardsData from "@/lib/data/sealed-ml/top-chase-cards.json";
import pullRatesData from "@/lib/data/sealed-ml/pull-rates.json";
import communityScoreData from "@/lib/data/sealed-ml/community-score.json";
import type { SealedSetData, ProductType, SealedPricing, CommunityScoreFile } from "@/lib/types/sealed";

interface TopChaseEntry {
  setId: string;
  setName: string;
  fetchedAt?: string;
  cards?: Array<{ name: string; marketPrice?: number; rarity?: string | null }>;
  cardCount?: number;
  setTotalSinglesValue?: number;
  top10SinglesValue?: number;
}

interface PullRateEra {
  yearStart?: number;
  yearEnd?: number;
  packsPerBoosterBox?: number;
  packsPerEtb?: number;
  packsPerBoosterBundle?: number;
  topChaseExpectedPerBox?: number;
  topChaseExpectedPerEtb?: number;
  topChaseExpectedPerBundle?: number;
  secondaryChaseMultiplier?: number;
  notes?: string;
}

interface PullRatesData {
  version: number;
  eras: Record<string, PullRateEra>;
  productTypeMultipliers: Record<string, string | null>;
}

const PULL_RATES = pullRatesData as unknown as PullRatesData;

const TOP_CHASE_BY_SET_ID: Record<string, TopChaseEntry> =
  topChaseCardsData as Record<string, TopChaseEntry>;

const COMMUNITY_SCORE_MAP = (communityScoreData as unknown as CommunityScoreFile).sets;

/**
 * An entry has "no real signal" when its Reddit fetch failed or returned
 * 0 posts AND Google Trends is just the neutral 50 default. Treating such
 * an entry as a low score (~28) would unfairly penalize popular modern
 * sets via demand dampening and confidence capping, so we skip it.
 */
function communityEntryHasRealSignal(entry: { redditPostCount: number; googleTrendsScore: number | null; redditDataMissing?: boolean }): boolean {
  const redditUsable = !entry.redditDataMissing && entry.redditPostCount > 0;
  const trendsUsable = typeof entry.googleTrendsScore === "number" && entry.googleTrendsScore !== 50;
  return redditUsable || trendsUsable;
}

/** Look up community score entry by set name (normalized). */
export function lookupCommunityScore(name: string) {
  // Normalize: strip product type suffixes and variant labels, lowercase, alphanum only
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/\b(shiny\s*vault|booster\s*box|booster\s*bundle|booster\s*pack|elite\s*trainer\s*box|etb|upc|ultra\s*premium|tin|case|collection\s*box|collection|special\s*collection)\b/g, "")
      .replace(/[^a-z0-9]+/g, "");
  const normalized = norm(name);
  // Exact match first
  for (const entry of Object.values(COMMUNITY_SCORE_MAP)) {
    if (norm(entry.setName) === normalized && communityEntryHasRealSignal(entry)) return entry;
  }
  // Prefix match: if the community score set name is a prefix of the product name
  // (handles variants like "Hidden Fates Shiny Vault Booster Box" → "Hidden Fates")
  for (const entry of Object.values(COMMUNITY_SCORE_MAP)) {
    const entryNorm = norm(entry.setName);
    if (entryNorm.length >= 4 && normalized.startsWith(entryNorm) && communityEntryHasRealSignal(entry)) return entry;
  }
  return null;
}

/**
 * Map PriceCharting trailing-30-day sales volume to a 0–100 demand score
 * via a log scale calibrated to the live distribution (median≈64,
 * P90≈400, max≈3413). High volume = active market = high real-world
 * community demand, regardless of how loud Reddit happens to be.
 *
 * Calibration points:
 *   vol=10   → ~30    (very thin market)
 *   vol=64   → 51     (median set)
 *   vol=235  → 67     (Destined Rivals BB)
 *   vol=400  → 74     (top-decile set)
 *   vol=3413 → 100    (Mega Evolution BB)
 */
export function computeMarketActivityScore(salesVolume: number | null | undefined): number | null {
  if (typeof salesVolume !== "number" || !isFinite(salesVolume) || salesVolume <= 0) return null;
  // log(1 + 3413) ≈ 8.135 → use 8.135 as the denominator so vol=3413 → 100.
  const score = (Math.log(1 + salesVolume) / 8.135) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Compose a community score from up-to-four sub-signals.
 *
 * Reddit chatter and PriceCharting sales volume are *complementary*
 * demand proxies — Reddit captures hype and discussion, market activity
 * captures revealed preference (people spending real money). Using both
 * is more robust than picking one, so we blend them with equal weight
 * whenever both are available.
 *
 * Weights:
 *   reddit       0.30
 *   market       0.30   (PriceCharting trailing-30d sales volume)
 *   trends       0.25   (Google Trends)
 *   forum        0.15   (placeholder — neutral 50 today)
 *
 * When any sub-signal is unavailable its weight is redistributed
 * proportionally across the signals that *are* available, so a missing
 * signal doesn't drag the composite toward neutrality.
 *
 * Returns null if no signals are available at all.
 */
function blendCommunityScore(parts: {
  reddit: number | null;
  market: number | null;
  trends: number | null;
  forum: number | null;
}): number | null {
  const baseWeights = { reddit: 0.30, market: 0.30, trends: 0.25, forum: 0.15 };
  let totalWeight = 0;
  let weightedSum = 0;
  for (const key of Object.keys(baseWeights) as Array<keyof typeof baseWeights>) {
    const value = parts[key];
    if (typeof value !== "number" || !isFinite(value)) continue;
    totalWeight += baseWeights[key];
    weightedSum += baseWeights[key] * value;
  }
  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}
/**
 * Resolve all four community sub-signals (Reddit, Market, Trends, Forum)
 * for a set and compose them into a blended communityScore.
 *
 * Reddit + Market are kept as independent signals: Reddit captures hype,
 * Market captures revealed preference (sales volume). They reinforce
 * each other when present and fill in for each other when absent.
 *
 * The returned `source` tag describes which signals contributed:
 *   "blended"     — both Reddit and Market are present (best case)
 *   "reddit-only" — Reddit available, no market data
 *   "market-only" — Reddit unavailable, market data carries the score
 *   null          — nothing usable, caller should treat as missing
 */
export function resolveCommunityFactors(
  setName: string,
  marketActivityScore: number | null
): {
  communityScore: number | null;
  redditScore: number | null;
  googleTrendsScore: number | null;
  forumScore: number | null;
  marketActivityScore: number | null;
  source: "blended" | "reddit-only" | "market-only" | null;
  lastUpdated: string | null;
} {
  const entry = lookupCommunityScore(setName);
  const redditScore = entry?.redditScore ?? null;
  const googleTrendsScore = entry?.googleTrendsScore ?? null;
  // Forum is now null in the data when unavailable (it used to be a flat 50
  // placeholder that dragged composites toward neutral). Honoring the null
  // lets blendCommunityScore renormalize the remaining weights instead.
  const forumScore = entry?.forumScore ?? null;
  const lastUpdated = entry?.lastUpdated ?? null;

  const composite = blendCommunityScore({
    reddit: redditScore,
    market: marketActivityScore,
    trends: googleTrendsScore,
    forum: forumScore,
  });

  if (composite == null) {
    return {
      communityScore: null,
      redditScore: null,
      googleTrendsScore: null,
      forumScore: null,
      marketActivityScore: null,
      source: null,
      lastUpdated,
    };
  }

  let source: "blended" | "reddit-only" | "market-only";
  if (redditScore != null && marketActivityScore != null) source = "blended";
  else if (redditScore != null) source = "reddit-only";
  else source = "market-only";

  return {
    communityScore: composite,
    redditScore,
    googleTrendsScore,
    forumScore,
    marketActivityScore,
    source,
    lastUpdated,
  };
}

/** Merge community sub-signals into an existing SealedSetData factors object. */
export function mergeCommunityFactors(set: SealedSetData): SealedSetData {
  if (set.factors.communityScore != null) return set;
  // Curated sets carry a `popularity` factor that's already log-scaled
  // sales volume, so we re-use it as the market activity proxy when the
  // raw volume isn't carried on the SealedSetData.
  const market = typeof set.factors.popularity === "number" ? set.factors.popularity : null;
  const resolved = resolveCommunityFactors(set.name, market);
  if (resolved.communityScore == null) return set;
  return {
    ...set,
    factors: {
      ...set.factors,
      communityScore: resolved.communityScore,
      redditScore: resolved.redditScore,
      googleTrendsScore: resolved.googleTrendsScore,
      forumScore: resolved.forumScore,
      marketActivityScore: resolved.marketActivityScore,
      communityScoreSource: resolved.source,
      communityScoreUpdatedAt: resolved.lastUpdated,
    },
  };
}

const TOP_CHASE_BY_NORMALIZED_NAME: Map<string, TopChaseEntry> = (() => {
  const map = new Map<string, TopChaseEntry>();
  for (const entry of Object.values(TOP_CHASE_BY_SET_ID)) {
    if (!entry?.setName) continue;
    const key = entry.setName
      .toLowerCase()
      .replace(/^pokemon\s+/i, "")
      .replace(/[^a-z0-9]+/g, "");
    if (key) map.set(key, entry);
  }
  return map;
})();

function lookupTopChaseCards(
  pricing: SealedPricing
): {
  names: string[];
  chaseCardIndex: number | null;
  topChasePrice: number | null;
  setTotalSinglesValue: number | null;
  top10SinglesValue: number | null;
} {
  // Strongest match: pokedataId of the form `local-sealed:<setId>-<productType>`
  // already encodes the TCG API setId, e.g. `local-sealed:swsh7-etb` → `swsh7`.
  const idMatch = pricing.pokedataId?.match(/^local-sealed:([a-z0-9]+(?:pt[0-9]+)?)-/i);
  if (idMatch) {
    const direct = TOP_CHASE_BY_SET_ID[idMatch[1]];
    if (direct?.cards?.length) return scoreChaseEntry(direct);
  }

  const candidates = [
    pricing.priceChartingConsoleName,
    pricing.name,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = candidate
      .toLowerCase()
      .replace(/^pokemon\s+/i, "")
      .replace(/\b(booster\s*box|booster\s*bundle|booster\s*pack|elite\s*trainer\s*box|etb|upc|ultra\s*premium|tin|case|collection\s*box|collection|special\s*collection)\b/g, "")
      .replace(/[^a-z0-9]+/g, "");
    if (!normalized) continue;
    const direct = TOP_CHASE_BY_NORMALIZED_NAME.get(normalized);
    if (direct?.cards?.length) {
      return scoreChaseEntry(direct);
    }
    // Fuzzy contains match for partial overlaps (e.g. "scarlet violet 151").
    for (const [key, entry] of TOP_CHASE_BY_NORMALIZED_NAME) {
      if (!entry.cards?.length) continue;
      if (key === normalized) continue;
      if (key.includes(normalized) || normalized.includes(key)) {
        if (key.length >= 4 && normalized.length >= 4) {
          return scoreChaseEntry(entry);
        }
      }
    }
  }
  return {
    names: [],
    chaseCardIndex: null,
    topChasePrice: null,
    setTotalSinglesValue: null,
    top10SinglesValue: null,
  };
}

function scoreChaseEntry(entry: TopChaseEntry): {
  names: string[];
  chaseCardIndex: number | null;
  topChasePrice: number | null;
  setTotalSinglesValue: number | null;
  top10SinglesValue: number | null;
} {
  const cards = entry.cards ?? [];
  const names = cards.slice(0, 4).map((c) => c.name).filter(Boolean);
  const setTotalSinglesValue =
    typeof entry.setTotalSinglesValue === "number" && entry.setTotalSinglesValue > 0
      ? entry.setTotalSinglesValue
      : null;
  const top10SinglesValue =
    typeof entry.top10SinglesValue === "number" && entry.top10SinglesValue > 0
      ? entry.top10SinglesValue
      : null;
  if (!names.length)
    return {
      names: [],
      chaseCardIndex: null,
      topChasePrice: null,
      setTotalSinglesValue,
      top10SinglesValue,
    };
  const topPrice = cards[0]?.marketPrice ?? 0;
  // Map top chase price → 0..100 score on log scale.
  // $5 → 30, $25 → 50, $100 → 70, $500 → 85, $1500+ → 95+
  if (!topPrice || topPrice <= 0)
    return {
      names,
      chaseCardIndex: 50,
      topChasePrice: null,
      setTotalSinglesValue,
      top10SinglesValue,
    };
  const score = 22 + 22 * Math.log10(topPrice + 1);
  return {
    names,
    chaseCardIndex: Math.max(10, Math.min(98, Math.round(score))),
    topChasePrice: topPrice,
    setTotalSinglesValue,
    top10SinglesValue,
  };
}

const PRODUCT_TYPE_PATTERNS: [RegExp, ProductType][] = [
  [/\bbooster\s*box\s*case\b/i, "Case"],
  [/\betb\s*case\b/i, "Case"],
  [/\bcase\b/i, "Case"],
  [/\belite\s*trainer\s*box\b/i, "ETB"],
  [/\betb\b/i, "ETB"],
  [/\bbooster\s*box\b/i, "Booster Box"],
  [/\bbooster\s*bundle\b/i, "Booster Bundle"],
  [/\bbooster\s*pack\b/i, "Booster Pack"],
  [/\bupc\b|ultra\s*premium/i, "UPC"],
  [/\btin\b/i, "Tin"],
   [/\bex\s*box\b/i, "Collection Box"],
  [/\bcollection\b/i, "Collection Box"],
];

// Estimated MSRP by product type (USD)
const MSRP_ESTIMATES: Record<ProductType, number> = {
  "Booster Box": 144,
  "ETB": 50,
  "Booster Bundle": 30,
  "Booster Pack": 4,
  "UPC": 120,
  "Tin": 25,
  "Collection Box": 30,
  "Special Collection": 50,
  "Case": 700,
  "Unknown": 50,
};

// Gradient colors by product type
const GRADIENTS: Record<ProductType, string> = {
  "Booster Box": "linear-gradient(135deg, #2563eb, #7c3aed)",
  "ETB": "linear-gradient(135deg, #059669, #0d9488)",
  "Booster Bundle": "linear-gradient(135deg, #d97706, #ea580c)",
  "Booster Pack": "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "UPC": "linear-gradient(135deg, #dc2626, #f59e0b)",
  "Tin": "linear-gradient(135deg, #475569, #64748b)",
  "Collection Box": "linear-gradient(135deg, #0891b2, #06b6d4)",
  "Special Collection": "linear-gradient(135deg, #7c3aed, #c026d3)",
  "Case": "linear-gradient(135deg, #1e3a5f, #374151)",
  "Unknown": "linear-gradient(135deg, #4b5563, #6b7280)",
};

export function inferProductType(name: string): ProductType {
  for (const [pattern, type] of PRODUCT_TYPE_PATTERNS) {
    if (pattern.test(name)) return type;
  }
  return "Unknown";
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getRelatedCuratedSet(name: string): SealedSetData | undefined {
  const normalizedName = normalizeName(name);

  return SEALED_SETS.reduce<SealedSetData | undefined>((bestMatch, candidate) => {
    const normalizedCandidate = normalizeName(candidate.name);
    const isMatch =
      normalizedName.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedName);

    if (!isMatch) {
      return bestMatch;
    }

    if (!bestMatch) {
      return candidate;
    }

    return normalizedCandidate.length > normalizeName(bestMatch.name).length
      ? candidate
      : bestMatch;
  }, undefined);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function buildPricingContext(pricing: SealedPricing): NonNullable<SealedSetData["pricingContext"]> {
  return {
    priceChartingPrice: pricing.priceChartingPrice ?? null,
    tcgplayerPrice: pricing.tcgplayerPrice ?? null,
    ebayPrice: pricing.ebayPrice ?? null,
    pokedataPrice: pricing.pokedataPrice ?? null,
    bestPrice: pricing.bestPrice ?? null,
    primaryProvider: pricing.primaryProvider,
    snapshotDate: pricing.snapshotDate ?? null,
    salesVolume: pricing.salesVolume ?? null,
    manualOnlyPrice: pricing.manualOnlyPrice ?? null,
  };
}

function computeMarketValue(price: number): number {
  // Inversely proportional: cheaper = more accessible = higher score
  // $30 → 85, $100 → 75, $300 → 60, $1000 → 40, $5000 → 15, $50000 → 3
  if (price <= 0) return 50;
  const score = 95 - 20 * Math.log10(price);
  return clamp(Math.round(score), 3, 90);
}

function computeSetAge(releaseDate: string | null, releaseYear: number): number {
  const currentYear = new Date().getFullYear();
  const age = currentYear - releaseYear;
  // 0yr → 5, 2yr → 18, 5yr → 35, 10yr → 55, 15yr → 70, 20yr → 82, 25+yr → 95
  if (age <= 0) return 5;
  const score = 5 + 90 * (1 - Math.exp(-age / 10));
  return clamp(Math.round(score), 5, 98);
}

function computePriceTrajectory(
  price: number,
  productType: ProductType,
  releaseYear: number
): number {
  const msrp = MSRP_ESTIMATES[productType];
  const multiple = price / msrp;
  const age = new Date().getFullYear() - releaseYear;

  // Adjust for age: recent products with big multiples = stronger signal
  // Old products are expected to be higher
  if (price <= 0 || msrp <= 0) return 30;
  if (age <= 0) return 30;

  // Annual appreciation multiple
  const annualMultiple = Math.pow(multiple, 1 / age);

  // 1.0x/yr → 20 (flat), 1.15x/yr → 50 (ok), 1.3x/yr → 70 (strong), 1.5x+/yr → 85+
  const score = 20 + 50 * Math.log(annualMultiple) / Math.log(1.5);
  return clamp(Math.round(score), 10, 95);
}

// Typical monthly sales volume by product type used to map sales-volume
// to popularity / demand signals. Calibrated against PriceCharting's
// reported sales-volume column (which is roughly trailing-30-day units).
const TYPICAL_SALES_VOLUME: Record<ProductType, number> = {
  "Booster Box": 50,
  "ETB": 120,
  "Booster Bundle": 80,
  "Booster Pack": 200,
  "UPC": 25,
  "Tin": 60,
  "Collection Box": 40,
  "Special Collection": 30,
  "Case": 5,
  "Unknown": 50,
};

function computePopularity(salesVolume: number | null | undefined): number {
  if (!salesVolume || salesVolume <= 0) return 50;
  // Log-scaled: 10 sales → 35, 50 → 55, 100 → 65, 250 → 75, 500+ → 85+
  const score = 25 + 22 * Math.log10(salesVolume + 1);
  return clamp(Math.round(score), 10, 95);
}

function computeMarketCycle(releaseYear: number): number {
  const age = new Date().getFullYear() - releaseYear;
  // Cycle phase: early hype (1-2 yr) lower, mid (3-6 yr) peak, mature (7+) declining
  if (age <= 0) return 35; // freshly released, supply still high
  if (age <= 2) return 55; // distribution still flowing
  if (age <= 5) return 78; // sweet spot — sealed drying up
  if (age <= 10) return 70;
  if (age <= 20) return 60;
  return 50; // very old: highly variable
}

function computeDemandRatio(
  salesVolume: number | null | undefined,
  productType: ProductType
): number {
  if (!salesVolume || salesVolume <= 0) return 50;
  const baseline = TYPICAL_SALES_VOLUME[productType] ?? 50;
  const ratio = salesVolume / baseline;
  // ratio 0.5 → 40, 1.0 → 55, 2.0 → 70, 4.0 → 80, 10x+ → 90+
  const score = 40 + 22 * Math.log2(ratio + 0.25);
  return clamp(Math.round(score), 15, 92);
}

/**
 * Map raw PriceCharting trailing-30-day sales volume to a coarse
 * liquidity tier per product type. "high" indicates a tight, frequently
 * transacted price — we trust the price quotes more and can earn higher
 * confidence even without a curated history record.
 */
export function computeLiquidityTier(
  salesVolume: number | null | undefined,
  productType: ProductType
): "low" | "normal" | "high" {
  if (!salesVolume || salesVolume <= 0) return "low";
  const baseline = TYPICAL_SALES_VOLUME[productType] ?? 50;
  const ratio = salesVolume / baseline;
  if (ratio >= 1.0 || salesVolume >= 30) return "high";
  if (ratio >= 0.4 || salesVolume >= 10) return "normal";
  return "low";
}

function pickEra(releaseYear: number): PullRateEra | null {
  const eras = Object.values(PULL_RATES.eras ?? {});
  for (const era of eras) {
    const start = era.yearStart ?? -Infinity;
    const end = era.yearEnd ?? Infinity;
    if (releaseYear >= start && releaseYear <= end) return era;
  }
  return null;
}

function expectedPullsPerProduct(
  era: PullRateEra,
  productType: ProductType
): number | null {
  const fieldName = PULL_RATES.productTypeMultipliers?.[productType];
  if (!fieldName) return null;
  const value = (era as unknown as Record<string, unknown>)[fieldName];
  return typeof value === "number" && value > 0 ? value : null;
}

/**
 * Estimated dollar value of the top chase cards expected to be pulled
 * from one unit of the product. Combines per-era pull rates with the
 * top chase market price + a secondary-chase multiplier (since most
 * boxes also yield secondary alt-arts, full-art trainers, etc.).
 *
 * Returns null when we lack pull-rate data, a chase price, or the
 * product type isn't pull-bearing (e.g. UPCs sometimes are, sealed Tin
 * usually isn't).
 */
export function computeChaseEv(
  productType: ProductType,
  releaseYear: number,
  topChaseMarketPrice: number | null
): number | null {
  if (!topChaseMarketPrice || topChaseMarketPrice <= 0) return null;
  const era = pickEra(releaseYear);
  if (!era) return null;
  const expected = expectedPullsPerProduct(era, productType);
  if (expected == null) return null;
  const secondaryMultiplier = era.secondaryChaseMultiplier ?? 1;
  // Top chase × expected pulls × secondary-chase blend factor.
  return topChaseMarketPrice * expected * secondaryMultiplier;
}

/**
 * How many of the 8 factors are reliably estimated (vs defaulting to 50).
 * Curated entries hand-tune all 8.
 * Dynamic entries always compute setAge, marketValue, priceTrajectory,
 * marketCycle (4 factors). When PriceCharting sales-volume is available
 * we additionally compute popularity and demandRatio, leaving only
 * chaseCardIndex and printRun as defaults (2 estimated).
 */
export function countEstimatedFactors(
  curated: boolean,
  hasSalesVolume = false
): number {
  if (curated) return 0;
  return hasSalesVolume ? 2 : 4;
}

/**
 * Build a SealedSetData from a runtime pricing payload.
 * PriceCharting is the primary source; PokeData metadata is only used
 * as fallback when PriceCharting cannot supply the field.
 */
export function buildDynamicSetData(pricing: SealedPricing): SealedSetData {
  const productType = inferProductType(pricing.name);
  const releaseYear = pricing.releaseDate
    ? parseInt(pricing.releaseDate.substring(0, 4)) ||
      new Date(pricing.releaseDate).getFullYear()
    : new Date().getFullYear();
  const price = pricing.bestPrice ?? 0;
  const relatedCuratedSet = getRelatedCuratedSet(pricing.name);
  const salesVolume = pricing.salesVolume ?? null;
  const hasSalesVolume = typeof salesVolume === "number" && salesVolume > 0;
  const topChase = lookupTopChaseCards(pricing);
  const chaseCards =
    topChase.names.length > 0
      ? topChase.names
      : relatedCuratedSet?.chaseCards ?? [];
  const chaseCardIndex =
    topChase.chaseCardIndex ?? relatedCuratedSet?.factors.chaseCardIndex ?? 50;
  const liquidityTier = computeLiquidityTier(salesVolume, productType);
  const safeReleaseYear = isNaN(releaseYear)
    ? new Date().getFullYear()
    : releaseYear;
  const expectedChaseValue = computeChaseEv(
    productType,
    safeReleaseYear,
    topChase.topChasePrice
  );
  const chaseEvRatio =
    expectedChaseValue && price > 0 ? expectedChaseValue / price : null;
  const setSinglesValue = topChase.setTotalSinglesValue;
  // setSinglesValue is the sum of every single's market price for the
  // expansion that this product opens. Divided by the sealed price it
  // gives a coarse "set wealth ratio" — high ratios mean the secondary-
  // market singles pool is much richer than the sealed cost, which
  // historically correlates with sealed appreciation as supply dries up.
  const setSinglesValueRatio =
    setSinglesValue && price > 0 ? setSinglesValue / price : null;

  const communityResolution = resolveCommunityFactors(
    pricing.name,
    computeMarketActivityScore(salesVolume)
  );

  return {
    id: `dynamic-${pricing.pokedataId}`,
    name: pricing.name,
    productType,
    releaseYear: safeReleaseYear,
    currentPrice: price,
    gradient: GRADIENTS[productType],
    pokedataId: pricing.pokedataId,
    priceChartingId: pricing.priceChartingId,
    imageUrl: pricing.imageUrl ?? undefined,
    imageAsset: pricing.imageAsset ?? undefined,
    curated: false,
    pricingContext: buildPricingContext(pricing),

    factors: {
      marketValue: computeMarketValue(price),
      chaseCardIndex,
      printRun: relatedCuratedSet?.factors.printRun ?? 50,
      setAge: computeSetAge(pricing.releaseDate, releaseYear),
      priceTrajectory: computePriceTrajectory(price, productType, releaseYear),
      popularity: hasSalesVolume
        ? computePopularity(salesVolume)
        : relatedCuratedSet?.factors.popularity ?? 50,
      marketCycle: computeMarketCycle(safeReleaseYear),
      demandRatio: hasSalesVolume
        ? computeDemandRatio(salesVolume, productType)
        : relatedCuratedSet?.factors.demandRatio ?? 50,
      liquidityTier,
      expectedChaseValue,
      chaseEvRatio,
      setSinglesValue,
      setSinglesValueRatio,
      communityScore: communityResolution.communityScore,
      redditScore: communityResolution.redditScore,
      googleTrendsScore: communityResolution.googleTrendsScore,
      forumScore: communityResolution.forumScore,
      marketActivityScore: communityResolution.marketActivityScore,
      communityScoreSource: communityResolution.source,
      communityScoreUpdatedAt: communityResolution.lastUpdated,
    },

    chaseCards,
    printRunLabel: relatedCuratedSet?.printRunLabel ?? "Standard",
    notes:
      relatedCuratedSet?.notes ??
      `Live data from PriceCharting. ${productType !== "Unknown" ? productType : "Product"} released ${releaseYear}.`,
  };
}
