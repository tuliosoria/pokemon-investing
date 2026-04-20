import { NextRequest, NextResponse } from "next/server";
import type { CardSearchResult, CardPrices } from "@/lib/types/card";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  putCardMeta,
  putCardTcgPrices,
} from "@/lib/db/card-cache";

const TCG_API_BASE = "https://api.tcgapi.dev/v1/search";
const CACHE_TTL = 5 * 60; // 5 minutes — for search query→results mapping

// --- Query parsing ---

interface ParsedQuery {
  apiSearch: string;       // Text to send to the API (card name)
  number: string | null;   // Card number like "225/217" or "225"
  extraTerms: string[];    // Additional words for set/name matching
  isNumberOnly: boolean;   // True if query was just a card number
}

function parseSearchQuery(raw: string): ParsedQuery {
  const q = raw.trim();

  // Match card number patterns: "225/217", "#225/217", "#225", standalone numbers
  // Use lookahead to avoid matching numbers inside words like "25th"
  const numMatch = q.match(/(?:^|\s)#?(\d{1,4}(?:\/\d{1,4})?)(?=\s|$)/);
  const number = numMatch ? numMatch[1] : null;

  // Remove the number from text to get search terms
  let textPart = q;
  if (numMatch) {
    textPart =
      q.slice(0, numMatch.index!) + q.slice(numMatch.index! + numMatch[0].length);
  }
  textPart = textPart.replace(/[#]/g, "").replace(/\s+/g, " ").trim();

  const terms = textPart.split(" ").filter((w) => w.length > 0);

  const cleanedRaw = q.replace(/[#]/g, "").trim();

  return {
    apiSearch: textPart || cleanedRaw, // Fall back to cleaned raw query if number-only
    number,
    extraTerms: terms,
    isNumberOnly: !textPart && !!number,
  };
}

// Score a result based on how well it matches parsed query filters
function scoreResult(card: CardSearchResult, parsed: ParsedQuery): number {
  let score = 0;

  // Number match (highest priority)
  if (parsed.number) {
    const queryNum = parsed.number.split("/")[0];
    const cardNum = (card.number || "").split("/")[0];

    if (card.number === parsed.number) score += 1000;
    else if (cardNum === queryNum) score += 500;
  }

  // Extra terms matching against set name and card name
  if (parsed.extraTerms.length > 0) {
    const setLower = (card.set || "").toLowerCase();
    const nameLower = (card.name || "").toLowerCase();

    for (const term of parsed.extraTerms) {
      const tLower = term.toLowerCase();
      if (setLower.includes(tLower)) score += 100;
      if (nameLower.includes(tLower)) score += 50;
    }
  }

  return score;
}

// --- API fetching ---

async function fetchCards(
  searchTerm: string,
  apiKey: string
): Promise<CardSearchResult[]> {
  const url = new URL(TCG_API_BASE);
  url.searchParams.set("q", searchTerm);
  url.searchParams.set("game", "pokemon");
  url.searchParams.set("type", "Cards");
  url.searchParams.set("per_page", "50");

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": apiKey },
  });

  if (!res.ok) return [];

  const body = await res.json();
  return groupResults(body.data ?? []);
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

  // Check short-lived query cache (L1 memory + L2 DynamoDB)
  const cached = await cacheGet<CardSearchResult[]>("card-search", cacheKey);
  if (cached) {
    return NextResponse.json({ cards: cached });
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

    const parsed = parseSearchQuery(q);

    // Primary search
    let cards = await fetchCards(parsed.apiSearch, apiKey);

    // Fallback: if few results and multi-word text, retry with just the first word
    // Handles "Scorbunny Ascended Heroes" → search "Scorbunny", score by set match
    if (cards.length < 3 && parsed.extraTerms.length > 1) {
      const fallbackCards = await fetchCards(parsed.extraTerms[0], apiKey);
      const seen = new Set(cards.map((c) => c.id));
      for (const c of fallbackCards) {
        if (!seen.has(c.id)) {
          cards.push(c);
          seen.add(c.id);
        }
      }
    }

    // Score and sort when query has number or multiple terms
    if (parsed.number || parsed.extraTerms.length > 1) {
      cards = cards
        .map((card) => ({ card, score: scoreResult(card, parsed) }))
        .sort((a, b) => b.score - a.score)
        .map(({ card }) => card);
    }

    // Persist static card data + prices to DynamoDB (fire-and-forget)
    // Each card gets: META (permanent) + TCG_PRICES (timestamped)
    persistCardData(cards);

    // Cache the search query→results mapping (short-lived)
    await cachePut("card-search", cacheKey, cards, CACHE_TTL);

    return NextResponse.json({ cards });
  } catch (err) {
    console.error("Card search error:", err);
    return NextResponse.json(
      { error: "Failed to search cards" },
      { status: 500 }
    );
  }
}

/**
 * Persist static card metadata and current prices to DynamoDB.
 * Runs in the background — does not block the response.
 */
function persistCardData(cards: CardSearchResult[]): void {
  // Limit to first 20 cards to avoid excessive DDB writes
  const batch = cards.slice(0, 20);

  for (const card of batch) {
    // Upsert META (idempotent — skips if schema version matches)
    putCardMeta(card.id, {
      name: card.name,
      set: card.set,
      setId: card.setId,
      number: card.number,
      rarity: card.rarity,
      imageSmall: card.imageSmall,
      imageLarge: card.imageLarge,
      tcgplayerUrl: card.tcgplayerUrl,
      pokedataId: null,
    }).catch(() => {});

    // Save current TCG prices with timestamp
    putCardTcgPrices(card.id, card.prices).catch(() => {});
  }
}
