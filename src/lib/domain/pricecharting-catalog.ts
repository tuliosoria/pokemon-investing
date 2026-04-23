import syncedCatalog from "@/lib/data/sealed-ml/pricecharting-current-prices.json";
import type { ProductType } from "@/lib/types/sealed";

export interface SyncedPriceChartingCatalogEntry {
  setId: string;
  name: string;
  productType: ProductType;
  releaseDate: string;
  priceChartingId: string;
  productName: string;
  consoleName: string | null;
  newPrice: number | null;
  manualOnlyPrice: number | null;
  salesVolume: number | null;
  capturedAt: string;
}

const VARIANT_PENALTY_WORDS = [
  "costco",
  "walmart",
  "target",
  "pokemon center",
  "display",
  "2-pack",
  "3-pack",
  "blister",
];

const catalog = syncedCatalog as SyncedPriceChartingCatalogEntry[];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .trim();
}

function getReleaseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function scoreEntry(
  entry: SyncedPriceChartingCatalogEntry,
  input: {
    name: string;
    productType?: ProductType;
    releaseDate?: string | null;
  }
): number {
  const normalizedInput = normalize(input.name);
  const normalizedEntry = normalize(entry.name);

  if (!normalizedInput || !normalizedEntry) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (normalizedInput === normalizedEntry) {
    score += 400;
  } else if (
    normalizedInput.includes(normalizedEntry) ||
    normalizedEntry.includes(normalizedInput)
  ) {
    score += 220;
  }

  if (input.productType && entry.productType === input.productType) {
    score += 90;
  }

  const inputYear = getReleaseYear(input.releaseDate);
  const entryYear = getReleaseYear(entry.releaseDate);
  if (inputYear && entryYear) {
    if (inputYear === entryYear) {
      score += 50;
    } else if (Math.abs(inputYear - entryYear) === 1) {
      score += 20;
    } else {
      score -= 60;
    }
  }

  for (const variant of VARIANT_PENALTY_WORDS) {
    if (normalizedInput.includes(variant) && !normalizedEntry.includes(variant)) {
      score -= 120;
    }
  }

  return score;
}

export function getSyncedPriceChartingCatalog(): SyncedPriceChartingCatalogEntry[] {
  return catalog;
}

export function getSyncedPriceChartingEntryById(
  priceChartingId: string | null | undefined
): SyncedPriceChartingCatalogEntry | null {
  if (!priceChartingId) {
    return null;
  }

  return catalog.find((entry) => entry.priceChartingId === priceChartingId) ?? null;
}

export function findSyncedPriceChartingEntry(input: {
  name: string;
  productType?: ProductType;
  releaseDate?: string | null;
}): SyncedPriceChartingCatalogEntry | null {
  let bestEntry: SyncedPriceChartingCatalogEntry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const entry of catalog) {
    const score = scoreEntry(entry, input);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestScore >= 220 ? bestEntry : null;
}
