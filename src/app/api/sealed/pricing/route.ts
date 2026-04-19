import { NextRequest, NextResponse } from "next/server";

const POKEDATA_BASE = "https://www.pokedata.io/v0";

// Cache pricing for 30 min
const cache = new Map<string, { data: SealedPricing; expires: number }>();
const MAX_CACHE = 200;
const CACHE_TTL = 30 * 60 * 1000;

interface SealedPricing {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  pokedataPrice: number | null;
  bestPrice: number | null;
}

function cleanCache() {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expires < now) cache.delete(key);
  }
  if (cache.size > MAX_CACHE) {
    const oldest = [...cache.entries()].sort(
      (a, b) => a[1].expires - b[1].expires
    );
    for (let i = 0; i < oldest.length - MAX_CACHE; i++) {
      cache.delete(oldest[i][0]);
    }
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }

  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ pricing: cached.data });
  }

  const apiKey = process.env.POKEDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API not configured" }, { status: 503 });
  }

  try {
    const url = new URL(`${POKEDATA_BASE}/pricing`);
    url.searchParams.set("id", id);
    url.searchParams.set("asset_type", "PRODUCT");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "PokeData pricing failed" },
        { status: 502 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const pricing = data.pricing ?? {};

    const tcg = pricing["TCGPlayer"]?.value ?? null;
    const ebay = pricing["eBay Sealed"]?.value ?? null;
    const poke = pricing["Pokedata Sealed"]?.value ?? null;

    // Best price: prefer TCGPlayer if available and non-zero, then PokeData, then eBay
    const bestPrice =
      tcg && tcg > 0 ? tcg : poke && poke > 0 ? poke : ebay && ebay > 0 ? ebay : null;

    const result: SealedPricing = {
      pokedataId: String(data.id ?? id),
      name: data.name ?? "",
      releaseDate: data.release_date ?? null,
      tcgplayerPrice: tcg,
      ebayPrice: ebay,
      pokedataPrice: poke,
      bestPrice: bestPrice ? Math.round(bestPrice * 100) / 100 : null,
    };

    cleanCache();
    cache.set(id, { data: result, expires: Date.now() + CACHE_TTL });

    return NextResponse.json({ pricing: result });
  } catch (err) {
    console.error("Sealed pricing error:", err);
    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}
