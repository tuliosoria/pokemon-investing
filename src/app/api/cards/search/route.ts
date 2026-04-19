import { NextRequest, NextResponse } from "next/server";
import type { CardSearchResult, CardPrices } from "@/lib/types/card";

const TCG_API_BASE = "https://api.tcgapi.dev/v1/search";

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

// tcgapi.dev returns separate rows per printing — group into one CardSearchResult per card
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupResults(data: any[]): CardSearchResult[] {
  const grouped = new Map<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { base: any; prices: CardPrices }
  >();

  for (const item of data) {
    // Skip sealed products
    if (item.product_type !== "Cards") continue;

    const key = `${item.name}|${item.set_name}|${item.number ?? ""}`;
    const printing: string = item.printing ?? "Normal";
    const variant = {
      low: item.low_price ?? null,
      mid: item.median_price ?? null,
      high: null,
      market: item.market_price ?? null,
      directLow: item.lowest_with_shipping ?? null,
    };

    if (grouped.has(key)) {
      grouped.get(key)!.prices[printing] = variant;
    } else {
      grouped.set(key, {
        base: item,
        prices: { [printing]: variant },
      });
    }
  }

  return [...grouped.values()].map(({ base, prices }) => ({
    id: String(base.tcgplayer_id ?? base.id),
    name: base.name,
    set: base.set_name ?? "Unknown",
    setId: String(base.set_id ?? ""),
    number: base.number ?? "",
    rarity: base.rarity ?? null,
    imageSmall: base.image_url ?? "",
    imageLarge: base.image_url ?? "",
    prices,
    tcgplayerUrl: base.tcgplayer_id
      ? `https://www.tcgplayer.com/product/${base.tcgplayer_id}`
      : null,
  }));
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
    const apiKey = process.env.TCG_API_KEY;
    if (!apiKey) {
      console.error("TCG_API_KEY not configured");
      return NextResponse.json(
        { error: "Card search not configured" },
        { status: 503 }
      );
    }

    const url = new URL(TCG_API_BASE);
    url.searchParams.set("q", q);
    url.searchParams.set("game", "pokemon");
    url.searchParams.set("type", "Cards");
    url.searchParams.set("per_page", "50");

    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey },
    });

    if (!res.ok) {
      console.error(`tcgapi.dev error: ${res.status}`);
      return NextResponse.json(
        { error: "Failed to search cards" },
        { status: 502 }
      );
    }

    const body = await res.json();
    const cards = groupResults(body.data ?? []);

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
