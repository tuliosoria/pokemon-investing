import { SEALED_SETS } from "@/lib/data/sealed-sets";
import type { SealedSetData, ProductType, SealedPricing } from "@/lib/types/sealed";

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

/** How many of the 8 factors are reliably estimated (vs defaulting to 50) */
export function countEstimatedFactors(curated: boolean): number {
  // Curated: all 8 are hand-tuned
  // Dynamic: setAge, marketValue, priceTrajectory are computed; 5 default to 50
  return curated ? 0 : 5;
}

/**
 * Build a SealedSetData from PokeData API results.
 * Only setAge, marketValue, and priceTrajectory are estimated from real data.
 * Other factors default to 50 (neutral).
 */
export function buildDynamicSetData(pricing: SealedPricing): SealedSetData {
  const productType = inferProductType(pricing.name);
  const releaseYear = pricing.releaseDate
    ? parseInt(pricing.releaseDate.substring(0, 4)) ||
      new Date(pricing.releaseDate).getFullYear()
    : new Date().getFullYear();
  const price = pricing.bestPrice ?? 0;
  const relatedCuratedSet = getRelatedCuratedSet(pricing.name);

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
    curated: false,
    pricingContext: buildPricingContext(pricing),

    factors: {
      marketValue: computeMarketValue(price),
      chaseCardIndex: 50,
      printRun: 50,
      setAge: computeSetAge(pricing.releaseDate, releaseYear),
      priceTrajectory: computePriceTrajectory(price, productType, releaseYear),
      popularity: 50,
      marketCycle: 50,
      demandRatio: 50,
    },

    chaseCards: relatedCuratedSet?.chaseCards ?? [],
    printRunLabel: relatedCuratedSet?.printRunLabel ?? "Standard",
    notes:
      relatedCuratedSet?.notes ??
      `Live data from PokeData.io. ${productType !== "Unknown" ? productType : "Product"} released ${releaseYear}.`,
  };
}
