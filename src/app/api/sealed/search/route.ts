import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import { loadSealedSearchCatalog } from "@/lib/db/sealed-search";
import {
  getStoredSealedProductMeta,
  type StoredSealedProductMeta,
} from "@/lib/db/sealed-pricing";
import { normalizeSealedSearchText } from "@/lib/domain/sealed-catalog-search";
import { resolveSealedProductImageAsset } from "@/lib/domain/sealed-image";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
  getSyncedPriceChartingEntryBySetId,
} from "@/lib/domain/pricecharting-catalog";
import type { SealedSearchResult } from "@/lib/types/sealed";

const CACHE_TTL = 10 * 60; // 10 minutes
const SEARCH_RESULT_LIMIT = 20;

// Abbreviation → full-form expansions for product type aliases
const TERM_ALIASES: Record<string, string[]> = {
  etb: ["elite trainer box", "etb"],
  etbs: ["elite trainer box", "etb"],
  upc: ["ultra premium collection", "upc"],
  upcs: ["ultra premium collection", "upc"],
  bb: ["booster box"],
  bbs: ["booster box"],
  boosters: ["booster"],
  boxes: ["box"],
  collections: ["collection"],
  bundles: ["bundle"],
  tins: ["tin"],
};

// Generic category queries that should return every matching product
// rather than the top-N ranked subset. Keys are normalized (lowercase,
// punctuation/diacritics stripped) — `expandCategoryQuery` handles the
// "all ..." prefix; plural forms are listed explicitly to keep matching
// predictable across irregular plurals (boxes/collections/tins).
const CATEGORY_QUERIES: Record<string, string[]> = {
  etb: ["elite trainer box", "etb"],
  etbs: ["elite trainer box", "etb"],
  "elite trainer box": ["elite trainer box", "etb"],
  "elite trainer boxes": ["elite trainer box", "etb"],
  upc: ["ultra premium collection", "upc"],
  upcs: ["ultra premium collection", "upc"],
  "ultra premium collection": ["ultra premium collection", "upc"],
  "ultra premium collections": ["ultra premium collection", "upc"],
  booster: ["booster"],
  boosters: ["booster"],
  "booster box": ["booster box"],
  "booster boxes": ["booster box"],
  "booster bundle": ["booster bundle"],
  "booster bundles": ["booster bundle"],
  "build and battle": ["build and battle"],
  "build and battle box": ["build and battle"],
  "build and battle boxes": ["build and battle"],
  collection: ["collection"],
  collections: ["collection"],
  "collection box": ["collection box"],
  "collection boxes": ["collection box"],
  "premium collection": ["premium collection"],
  "premium collections": ["premium collection"],
  bundle: ["bundle"],
  bundles: ["bundle"],
  tin: ["tin"],
  tins: ["tin"],
  "v box": ["v box"],
  "v boxes": ["v box"],
  "ex box": ["ex box"],
  "ex boxes": ["ex box"],
};

/**
 * If the raw query is a generic product-type query (e.g. "All ETBs",
 * "Booster Boxes", "Booster"), return the canonical search terms to use
 * across the catalog. Otherwise return null.
 */
function expandCategoryQuery(rawQuery: string): string[] | null {
  let normalized = normalize(rawQuery);
  if (normalized.startsWith("all ")) normalized = normalized.slice(4).trim();
  if (!normalized) return null;
  return CATEGORY_QUERIES[normalized] ?? null;
}

// Variant keywords that indicate non-canonical products (penalized in ranking)
const VARIANT_PENALTY_WORDS = [
  "costco", "walmart", "target", "case", "display",
  "2-pack", "3-pack", "blister",
];

/** Strip diacritics and punctuation for normalized comparison */
function normalize(s: string): string {
  return normalizeSealedSearchText(s);
}

/**
 * Expand query terms: if a term is a known alias, add its expansion.
 * Returns expanded list of terms (all normalized).
 */
function expandTerms(rawQuery: string): string[] {
  const terms = normalize(rawQuery).split(/\s+/).filter(Boolean);
  const expanded: string[] = [];
  for (const t of terms) {
    if (TERM_ALIASES[t]) {
      expanded.push(...TERM_ALIASES[t]);
    } else {
      expanded.push(t);
    }
  }
  return expanded;
}

function shouldReturnAllMatches(request: NextRequest, rawQuery: string): boolean {
  if (request.nextUrl.searchParams.get("all") === "1") return true;
  return expandCategoryQuery(rawQuery) !== null;
}

/**
 * Score how well a product name matches the search terms.
 * Higher = better match.
 */
function scoreProduct(
  product: Awaited<ReturnType<typeof loadSealedSearchCatalog>>[number],
  expandedTerms: string[],
  normalizedQuery: string
): number {
  const searchAliases =
    product.searchAliases.length > 0
      ? product.searchAliases
      : [normalize(product.name ?? "")];
  const searchText = product.searchText || searchAliases.join(" | ");
  if (!searchText) {
    return Number.NEGATIVE_INFINITY;
  }

  let matched = 0;
  for (const term of expandedTerms) {
    if (searchText.includes(term)) matched++;
  }

  if (matched === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = matched * 100;

  if (searchAliases.includes(normalizedQuery)) {
    score += 220;
  } else if (searchAliases.some((alias) => alias.startsWith(normalizedQuery))) {
    score += 140;
  } else if (searchText.includes(normalizedQuery)) {
    score += 80;
  }

  score += Math.max(0, 50 - normalize(product.name).length);

  for (const vw of VARIANT_PENALTY_WORDS) {
    if (searchText.includes(vw)) score -= 30;
  }

  return score;
}

function withResolvedImageAsset(
  product: SealedSearchResult,
  meta: StoredSealedProductMeta | null = null
): SealedSearchResult {
  const imageAsset = resolveSealedProductImageAsset({
    pokedataId: product.pokedataId,
    name: product.name,
    ownedImagePath:
      meta?.ownedImagePath ?? product.imageAsset?.owned?.path ?? null,
    fallbackCandidates: [
      product.imageAsset?.fallback?.url,
      product.imageUrl,
      meta?.imgUrl,
    ],
    mirrorSourceUrl:
      product.imageAsset?.mirrorSource?.url ??
      meta?.imageMirrorSourceUrl ??
      meta?.imgUrl,
    mirrorSourceProvider:
      product.imageAsset?.mirrorSource?.provider ??
      meta?.imageMirrorSourceProvider ??
      null,
    mirroredAt:
      product.imageAsset?.mirrorSource?.mirroredAt ??
      meta?.imageMirroredAt ??
      null,
  });

  return {
    ...product,
    imageUrl: imageAsset.selectedUrl,
    imageAsset,
    priceChartingId: product.priceChartingId ?? meta?.priceChartingId ?? undefined,
  };
}

async function withStoredImageAsset(
  product: SealedSearchResult
): Promise<SealedSearchResult> {
  const meta = await getStoredSealedProductMeta(product.pokedataId);
  return withResolvedImageAsset(product, meta);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    const cacheKey = `${normalize(q)}|all:${shouldReturnAllMatches(request, q) ? "1" : "0"}`;
    const normalizedQuery = normalize(q);

    const cached = await cacheGet<SealedSearchResult[]>("sealed-search", cacheKey);
    if (cached) {
      const products = await Promise.all(cached.map(withStoredImageAsset));
      return NextResponse.json({
        products,
      });
    }

    const catalog = await loadSealedSearchCatalog();

    // Category queries (e.g. "All ETBs", "Booster Boxes") bypass alias
    // expansion and instead match strictly against the canonical category
    // phrase so we surface every product of that type.
    const categoryTerms = expandCategoryQuery(q);
    const expandedTerms = categoryTerms ?? expandTerms(q);
    const scored = catalog
      .map((product, index) => ({
        product,
        index,
        score: scoreProduct(product, expandedTerms, normalizedQuery),
      }))
      .filter((entry) => Number.isFinite(entry.score));

    // Sort by score desc (stable sort preserves API order for ties)
    scored.sort((a, b) => b.score - a.score || a.index - b.index);

    // Deduplicate by owned catalog identity before falling back to runtime ID
    const seen = new Set<string>();
    const deduped = scored.filter((s) => {
      const id = s.product.catalogId || s.product.catalogKey || String(s.product.pokedataId);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const limitedResults = shouldReturnAllMatches(request, q)
      ? deduped
      : deduped.slice(0, SEARCH_RESULT_LIMIT);

    const products: SealedSearchResult[] = limitedResults.map((s) => {
      const pokedataId = s.product.pokedataId;
      const releaseDate = s.product.releaseDate ?? null;
      const syncedPriceChartingEntry = findSyncedPriceChartingEntry({
        name: s.product.name ?? "",
        releaseDate,
      });
      const exactSyncedPriceChartingEntry =
        getSyncedPriceChartingEntryBySetId(s.product.catalogId) ??
        getSyncedPriceChartingEntryById(s.product.priceChartingId);
      const imageAsset = resolveSealedProductImageAsset({
        setId: s.product.catalogId,
        pokedataId,
        name: s.product.name,
        fallbackCandidates: [s.product.imageUrl],
        mirrorSourceUrl: s.product.imageUrl,
      });

      return withResolvedImageAsset({
        pokedataId,
        name: s.product.name,
        releaseDate,
        imageUrl: imageAsset.selectedUrl,
        imageAsset,
        priceChartingId:
          s.product.priceChartingId ??
          exactSyncedPriceChartingEntry?.priceChartingId ??
          syncedPriceChartingEntry?.priceChartingId,
      });
    });

    await cachePut("sealed-search", cacheKey, products, CACHE_TTL);

    return NextResponse.json({ products });
  } catch (err) {
    console.error("Sealed search error:", err);
    return NextResponse.json(
      { error: "Failed to search sealed products" },
      { status: 500 }
    );
  }
}
