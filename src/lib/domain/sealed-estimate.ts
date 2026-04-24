import { SEALED_SETS } from "@/lib/data/sealed-sets";
import topChaseCardsData from "@/lib/data/sealed-ml/top-chase-cards.json";
import type { SealedSetData, ProductType, SealedPricing } from "@/lib/types/sealed";

interface TopChaseEntry {
  setId: string;
  setName: string;
  fetchedAt?: string;
  cards?: Array<{ name: string; marketPrice?: number; rarity?: string | null }>;
}

const TOP_CHASE_BY_SET_ID: Record<string, TopChaseEntry> =
  topChaseCardsData as Record<string, TopChaseEntry>;

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
): { names: string[]; chaseCardIndex: number | null } {
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
  return { names: [], chaseCardIndex: null };
}

function scoreChaseEntry(entry: TopChaseEntry): {
  names: string[];
  chaseCardIndex: number | null;
} {
  const cards = entry.cards ?? [];
  const names = cards.slice(0, 4).map((c) => c.name).filter(Boolean);
  if (!names.length) return { names: [], chaseCardIndex: null };
  const topPrice = cards[0]?.marketPrice ?? 0;
  // Map top chase price → 0..100 score on log scale.
  // $5 → 30, $25 → 50, $100 → 70, $500 → 85, $1500+ → 95+
  if (!topPrice || topPrice <= 0) return { names, chaseCardIndex: 50 };
  const score = 22 + 22 * Math.log10(topPrice + 1);
  return { names, chaseCardIndex: Math.max(10, Math.min(98, Math.round(score))) };
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

  return {
    id: `dynamic-${pricing.pokedataId}`,
    name: pricing.name,
    productType,
    releaseYear: isNaN(releaseYear) ? new Date().getFullYear() : releaseYear,
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
      marketCycle: computeMarketCycle(
        isNaN(releaseYear) ? new Date().getFullYear() : releaseYear
      ),
      demandRatio: hasSalesVolume
        ? computeDemandRatio(salesVolume, productType)
        : relatedCuratedSet?.factors.demandRatio ?? 50,
    },

    chaseCards,
    printRunLabel: relatedCuratedSet?.printRunLabel ?? "Standard",
    notes:
      relatedCuratedSet?.notes ??
      `Live data from PriceCharting. ${productType !== "Unknown" ? productType : "Product"} released ${releaseYear}.`,
  };
}
