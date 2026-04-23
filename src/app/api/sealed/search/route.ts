import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import { loadSealedSearchCatalog } from "@/lib/db/sealed-search";
import { getStoredSealedProductMeta } from "@/lib/db/sealed-pricing";
import { pickProductImageUrl } from "@/lib/domain/sealed-image";
import { findSyncedPriceChartingEntry } from "@/lib/domain/pricecharting-catalog";
import type { SealedSearchResult } from "@/lib/types/sealed";

const CACHE_TTL = 10 * 60; // 10 minutes
const SEARCH_RESULT_LIMIT = 20;

// Abbreviation → full-form expansions for product type aliases
const TERM_ALIASES: Record<string, string[]> = {
  etb: ["elite trainer box", "etb"],
  upc: ["ultra premium collection", "upc"],
  bb: ["booster box"],
};

// Variant keywords that indicate non-canonical products (penalized in ranking)
const VARIANT_PENALTY_WORDS = [
  "costco", "walmart", "target", "case", "display",
  "2-pack", "3-pack", "blister",
];

/** Strip diacritics and punctuation for normalized comparison */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip accents
    .replace(/[''`]/g, "")            // strip apostrophes
    .replace(/&/g, "and")             // & → and
    .toLowerCase()
    .trim();
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

/**
 * Score how well a product name matches the search terms.
 * Higher = better match.
 */
function scoreProduct(
  productName: string,
  expandedTerms: string[],
  normalizedQuery: string
): number {
  const norm = normalize(productName);
  if (!norm) {
    return Number.NEGATIVE_INFINITY;
  }

  // Count how many expanded terms match (aliases count as 1 group)
  let matched = 0;
  for (const term of expandedTerms) {
    // Multi-word terms (from alias expansion) matched as phrase
    if (norm.includes(term)) matched++;
  }

  if (matched === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = matched * 100;

  if (norm === normalizedQuery) {
    score += 220;
  } else if (norm.startsWith(normalizedQuery)) {
    score += 140;
  } else if (norm.includes(normalizedQuery)) {
    score += 80;
  }

  // Bonus for shorter names (more specific products rank higher)
  score += Math.max(0, 50 - norm.length);

  // Penalty for variant/bundle keywords
  for (const vw of VARIANT_PENALTY_WORDS) {
    if (norm.includes(vw)) score -= 30;
  }

  return score;
}

async function withStoredImageUrl(
  product: SealedSearchResult
): Promise<SealedSearchResult> {
  if (product.imageUrl) {
    return product;
  }

  const meta = await getStoredSealedProductMeta(product.pokedataId);
  return {
    ...product,
    imageUrl: pickProductImageUrl(meta?.imgUrl),
  };
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
    const cacheKey = normalize(q);
    const normalizedQuery = normalize(q);

    const cached = await cacheGet<SealedSearchResult[]>("sealed-search", cacheKey);
    if (cached) {
      const products = await Promise.all(cached.map(withStoredImageUrl));
      return NextResponse.json({
        products,
      });
    }

    const catalog = await loadSealedSearchCatalog();

    // Expand aliases and score every product against the local/stored catalog
    const expandedTerms = expandTerms(q);
    const scored = catalog
      .map((product, index) => ({
        product,
        index,
        score: scoreProduct(product.name ?? "", expandedTerms, normalizedQuery),
      }))
      .filter((entry) => Number.isFinite(entry.score));

    // Sort by score desc (stable sort preserves API order for ties)
    scored.sort((a, b) => b.score - a.score || a.index - b.index);

    // Deduplicate by product ID
    const seen = new Set<string>();
    const deduped = scored.filter((s) => {
      const id = String(s.product.pokedataId);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, SEARCH_RESULT_LIMIT);

    const products: SealedSearchResult[] = deduped.map((s) => {
      const pokedataId = s.product.pokedataId;
      const releaseDate = s.product.releaseDate ?? null;
      const syncedPriceChartingEntry = findSyncedPriceChartingEntry({
        name: s.product.name ?? "",
        releaseDate,
      });

      return {
        pokedataId,
        name: s.product.name,
        releaseDate,
        imageUrl: pickProductImageUrl(s.product.imageUrl),
        priceChartingId:
          s.product.priceChartingId ?? syncedPriceChartingEntry?.priceChartingId,
      };
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
