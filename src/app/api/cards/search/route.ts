import { NextRequest, NextResponse } from "next/server";
import type { CardSearchResult } from "@/lib/types/card";

const POKEMON_TCG_API = "https://api.pokemontcg.io/v2/cards";

// Simple in-memory cache (5 min TTL, max 200 entries)
const cache = new Map<string, { data: CardSearchResult[]; expires: number }>();
const MAX_CACHE = 200;
const CACHE_TTL = 5 * 60 * 1000;

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
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ cards: [] });
  }

  const cacheKey = q.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ cards: cached.data });
  }

  try {
    const searchQuery = `name:"${q}*"`;
    const url = `${POKEMON_TCG_API}?q=${encodeURIComponent(searchQuery)}&pageSize=20&select=id,name,set,number,rarity,images,tcgplayer`;

    const headers: Record<string, string> = {};
    if (process.env.POKEMON_TCG_API_KEY) {
      headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.error(`PokémonTCG API error: ${res.status}`);
      return NextResponse.json(
        { error: "Failed to search cards" },
        { status: 502 }
      );
    }

    const body = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cards: CardSearchResult[] = (body.data ?? []).map((card: any) => ({
      id: card.id,
      name: card.name,
      set: card.set?.name ?? "Unknown",
      setId: card.set?.id ?? "",
      number: card.number ?? "",
      rarity: card.rarity ?? null,
      imageSmall: card.images?.small ?? "",
      imageLarge: card.images?.large ?? "",
      prices: card.tcgplayer?.prices ?? {},
      tcgplayerUrl: card.tcgplayer?.url ?? null,
    }));

    // Cache results
    cleanCache();
    cache.set(cacheKey, { data: cards, expires: Date.now() + CACHE_TTL });

    return NextResponse.json({ cards });
  } catch (err) {
    console.error("Card search error:", err);
    return NextResponse.json(
      { error: "Failed to search cards" },
      { status: 500 }
    );
  }
}
