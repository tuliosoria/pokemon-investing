import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";

const POKEDATA_BASE = "https://www.pokedata.io/v0";
const CACHE_TTL = 10 * 60; // 10 minutes

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
function scoreProduct(productName: string, expandedTerms: string[]): number {
  const norm = normalize(productName);

  // Count how many expanded terms match (aliases count as 1 group)
  let matched = 0;
  for (const term of expandedTerms) {
    // Multi-word terms (from alias expansion) matched as phrase
    if (norm.includes(term)) matched++;
  }

  let score = matched * 100;

  // Bonus for shorter names (more specific products rank higher)
  score += Math.max(0, 50 - norm.length);

  // Penalty for variant/bundle keywords
  for (const vw of VARIANT_PENALTY_WORDS) {
    if (norm.includes(vw)) score -= 30;
  }

  return score;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  const apiKey = process.env.POKEDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API not configured" },
      { status: 503 }
    );
  }

  try {
    const cacheKey = normalize(q);

    const cached = await cacheGet<{ pokedataId: string; name: string; releaseDate: string | null }[]>(
      "sealed-search", cacheKey
    );
    if (cached) {
      return NextResponse.json({ products: cached });
    }

    const url = new URL(`${POKEDATA_BASE}/search`);
    url.searchParams.set("query", q);
    url.searchParams.set("asset_type", "PRODUCT");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "PokeData search failed" },
        { status: 502 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawProducts: any[] = await res.json();

    // Filter to English products only
    const english = rawProducts.filter(
      (p) => !p.language || p.language === "ENGLISH"
    );

    // Expand aliases and score every product against the full English set
    const expandedTerms = expandTerms(q);
    const scored = english.map((p) => ({
      product: p,
      score: scoreProduct(p.name ?? "", expandedTerms),
    }));

    // Sort by score desc (stable sort preserves API order for ties)
    scored.sort((a, b) => b.score - a.score);

    // Deduplicate by product ID
    const seen = new Set<string>();
    const deduped = scored.filter((s) => {
      const id = String(s.product.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const products = deduped.slice(0, 30).map((s) => ({
      pokedataId: String(s.product.id),
      name: s.product.name,
      releaseDate: s.product.release_date ?? null,
    }));

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
