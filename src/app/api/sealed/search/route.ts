import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";

const POKEDATA_BASE = "https://www.pokedata.io/v0";
const CACHE_TTL = 10 * 60; // 10 minutes in seconds

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
    const cacheKey = q.toLowerCase();

    // Check cache (L1 memory + L2 DynamoDB)
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

    const products = english.slice(0, 30).map((p) => ({
      pokedataId: String(p.id),
      name: p.name,
      releaseDate: p.release_date ?? null,
    }));

    // Cache results (L1 + L2)
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
