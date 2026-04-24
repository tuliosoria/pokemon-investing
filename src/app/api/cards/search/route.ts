import { NextRequest, NextResponse } from "next/server";
import { loadCardCatalog, warmCardCatalog } from "@/lib/db/card-catalog";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  getCardMeta,
  putCardMeta,
  putCardTcgPrices,
} from "@/lib/db/card-cache";
import {
  buildImageMirrorSource,
  resolveImageAsset,
} from "@/lib/domain/image-assets";
import { getBestPrice, type CardSearchResult, type CardPrices } from "@/lib/types/card";

const TCG_API_BASE = "https://api.tcgapi.dev/v1/search";
const POKEMON_TCG_API_BASE = "https://api.pokemontcg.io/v2/cards";
const CACHE_TTL = 5 * 60; // 5 minutes — for search query→results mapping
const SEARCH_RESULT_LIMIT = 20;
const TCG_API_RATE_LIMIT = "TCG_API_RATE_LIMIT";

// --- Query parsing ---

interface ParsedQuery {
  apiSearch: string;       // Text to send to the API (card name)
  number: string | null;   // Card number like "225/217" or "225"
  extraTerms: string[];    // Additional words for set/name matching
  isNumberOnly: boolean;   // True if query was just a card number
}

interface PokemonTcgPrice {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
}

interface PokemonTcgApiCard {
  id?: string;
  name?: string;
  number?: string;
  rarity?: string | null;
  images?: {
    small?: string;
    large?: string;
  };
  set?: {
    id?: string;
    name?: string;
  };
  tcgplayer?: {
    url?: string | null;
    prices?: Record<string, PokemonTcgPrice>;
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`"]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function normalizeCardNumber(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/^0+/, "")
    .split("/")[0]
    .trim();
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

function hasUsablePrice(card: CardSearchResult): boolean {
  return getBestPrice(card.prices) !== null;
}

function buildCatalogKey(card: CardSearchResult): string {
  return [
    normalizeSearchText(card.name),
    normalizeSearchText(card.set),
    normalizeCardNumber(card.number),
  ].join("|");
}

function mergeCardPrices(base: CardPrices, incoming: CardPrices): CardPrices {
  const merged: CardPrices = { ...base };

  for (const [variant, price] of Object.entries(incoming)) {
    merged[variant] = {
      ...(merged[variant] ?? {
        low: null,
        mid: null,
        high: null,
        market: null,
        directLow: null,
      }),
      ...price,
    };
  }

  return merged;
}

function mergeCardResults(
  existing: CardSearchResult,
  incoming: CardSearchResult
): CardSearchResult {
  const existingRichness =
    (hasUsablePrice(existing) ? 2 : 0) +
    (existing.tcgplayerUrl ? 1 : 0) +
    (existing.imageSmall ? 1 : 0) +
    (existing.imageLarge ? 1 : 0);
  const incomingRichness =
    (hasUsablePrice(incoming) ? 2 : 0) +
    (incoming.tcgplayerUrl ? 1 : 0) +
    (incoming.imageSmall ? 1 : 0) +
    (incoming.imageLarge ? 1 : 0);

  const primary = incomingRichness > existingRichness ? incoming : existing;
  const secondary = primary === existing ? incoming : existing;

  return {
    ...secondary,
    ...primary,
    prices: mergeCardPrices(secondary.prices, primary.prices),
  };
}

function dedupeCards(cards: CardSearchResult[]): CardSearchResult[] {
  const deduped = new Map<string, CardSearchResult>();

  for (const card of cards) {
    const key = buildCatalogKey(card) || card.id;
    const existing = deduped.get(key);
    deduped.set(key, existing ? mergeCardResults(existing, card) : card);
  }

  return [...deduped.values()];
}

function scoreCatalogResult(
  card: CardSearchResult,
  parsed: ParsedQuery,
  rawQuery: string
): number {
  const normalizedQuery = normalizeSearchText(rawQuery);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const normalizedName = normalizeSearchText(card.name);
  const normalizedSet = normalizeSearchText(card.set);
  const haystack = [normalizedName, normalizedSet].filter(Boolean).join(" ");
  const cardNumber = normalizeCardNumber(card.number);
  const queryNumber = normalizeCardNumber(parsed.number);

  let score = scoreResult(card, parsed);
  let matchedTokens = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      matchedTokens += 1;
      score += token.length > 2 ? 75 : 30;
    }
  }

  if (normalizedQuery) {
    if (normalizedName === normalizedQuery) {
      score += 260;
    } else if (haystack === normalizedQuery) {
      score += 220;
    } else if (normalizedName.startsWith(normalizedQuery)) {
      score += 180;
    } else if (haystack.includes(normalizedQuery)) {
      score += 120;
    }
  }

  if (queryNumber) {
    if (cardNumber === queryNumber) {
      score += 250;
    } else if (
      cardNumber &&
      (cardNumber.startsWith(queryNumber) || queryNumber.startsWith(cardNumber))
    ) {
      score += 120;
    }
  }

  if (
    matchedTokens === 0 &&
    (!queryNumber || !cardNumber || cardNumber !== queryNumber)
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  if (hasUsablePrice(card)) {
    score += 25;
  }

  return score;
}

function rankCards(
  cards: CardSearchResult[],
  parsed: ParsedQuery,
  rawQuery: string,
  requireMatch = false
): CardSearchResult[] {
  return dedupeCards(cards)
    .map((card, index) => ({
      card,
      index,
      score: scoreCatalogResult(card, parsed, rawQuery),
    }))
    .filter((entry) => !requireMatch || Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ card }) => card);
}

function shouldUseLocalCatalogOnly(
  localCards: CardSearchResult[],
  parsed: ParsedQuery,
  rawQuery: string
): boolean {
  if (localCards.length === 0) {
    return false;
  }

  const topCard = localCards[0];
  const topScore = topCard ? scoreCatalogResult(topCard, parsed, rawQuery) : 0;
  const pricedCount = localCards.filter(hasUsablePrice).length;

  if (topCard && hasUsablePrice(topCard) && topScore >= 250) {
    return true;
  }

  if (parsed.number) {
    return pricedCount > 0;
  }

  return localCards.length >= 5 && pricedCount >= 2;
}

function buildCardImageAssets(input: {
  imageSmall?: string | null;
  imageLarge?: string | null;
  ownedImageSmallPath?: string | null;
  ownedImageLargePath?: string | null;
  imageSmallMirrorSourceUrl?: string | null;
  imageSmallMirrorSourceProvider?: NonNullable<
    Awaited<ReturnType<typeof getCardMeta>>
  >["imageSmallMirrorSourceProvider"];
  imageSmallMirroredAt?: string | null;
  imageLargeMirrorSourceUrl?: string | null;
  imageLargeMirrorSourceProvider?: NonNullable<
    Awaited<ReturnType<typeof getCardMeta>>
  >["imageLargeMirrorSourceProvider"];
  imageLargeMirroredAt?: string | null;
}): NonNullable<CardSearchResult["imageAssets"]> {
  return {
    small: resolveImageAsset({
      kind: "card-small",
      ownedPath: input.ownedImageSmallPath ?? null,
      fallbackCandidates: [input.imageSmall],
      mirrorSource: buildImageMirrorSource({
        provider: input.imageSmallMirrorSourceProvider ?? null,
        url: input.imageSmallMirrorSourceUrl ?? null,
        mirroredAt: input.imageSmallMirroredAt ?? null,
      }),
    }),
    large: resolveImageAsset({
      kind: "card-large",
      ownedPath: input.ownedImageLargePath ?? null,
      fallbackCandidates: [input.imageLarge, input.imageSmall],
      mirrorSource: buildImageMirrorSource({
        provider: input.imageLargeMirrorSourceProvider ?? null,
        url: input.imageLargeMirrorSourceUrl ?? null,
        mirroredAt: input.imageLargeMirroredAt ?? null,
      }),
    }),
  };
}

function withCardImageAssets(
  card: CardSearchResult,
  meta: Awaited<ReturnType<typeof getCardMeta>> = null
): CardSearchResult {
  const imageAssets = buildCardImageAssets({
    imageSmall:
      card.imageAssets?.small?.fallback?.url ??
      meta?.imageSmallMirrorSourceUrl ??
      card.imageSmall,
    imageLarge:
      card.imageAssets?.large?.fallback?.url ??
      meta?.imageLargeMirrorSourceUrl ??
      card.imageLarge,
    ownedImageSmallPath:
      meta?.ownedImageSmallPath ?? card.imageAssets?.small?.owned?.path ?? null,
    ownedImageLargePath:
      meta?.ownedImageLargePath ?? card.imageAssets?.large?.owned?.path ?? null,
    imageSmallMirrorSourceUrl:
      card.imageAssets?.small?.mirrorSource?.url ??
      meta?.imageSmallMirrorSourceUrl ??
      card.imageSmall,
    imageSmallMirrorSourceProvider:
      card.imageAssets?.small?.mirrorSource?.provider ??
      meta?.imageSmallMirrorSourceProvider ??
      null,
    imageSmallMirroredAt:
      card.imageAssets?.small?.mirrorSource?.mirroredAt ??
      meta?.imageSmallMirroredAt ??
      null,
    imageLargeMirrorSourceUrl:
      card.imageAssets?.large?.mirrorSource?.url ??
      meta?.imageLargeMirrorSourceUrl ??
      card.imageLarge,
    imageLargeMirrorSourceProvider:
      card.imageAssets?.large?.mirrorSource?.provider ??
      meta?.imageLargeMirrorSourceProvider ??
      null,
    imageLargeMirroredAt:
      card.imageAssets?.large?.mirrorSource?.mirroredAt ??
      meta?.imageLargeMirroredAt ??
      null,
  });

  return {
    ...card,
    pokedataId: meta?.pokedataId ?? card.pokedataId ?? null,
    imageSmall: imageAssets.small?.selectedUrl ?? card.imageSmall ?? "",
    imageLarge:
      imageAssets.large?.selectedUrl ??
      imageAssets.small?.selectedUrl ??
      card.imageLarge ??
      card.imageSmall ??
      "",
    imageAssets,
  };
}

async function hydrateStoredCardImages(
  cards: CardSearchResult[]
): Promise<CardSearchResult[]> {
  if (cards.length === 0) {
    return cards;
  }

  const metaEntries = await Promise.all(
    cards.map(async (card) => [card.id, await getCardMeta(card.id)] as const)
  );
  const metaById = new Map(metaEntries);

  return cards.map((card) => withCardImageAssets(card, metaById.get(card.id) ?? null));
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

  if (res.status === 429) {
    throw new Error(TCG_API_RATE_LIMIT);
  }

  if (!res.ok) return [];

  const body = await res.json();
  return groupResults(body.data ?? []);
}

function formatPokemonTcgVariantName(variant: string): string {
  switch (variant) {
    case "normal":
      return "Normal";
    case "holofoil":
      return "Holofoil";
    case "reverseHolofoil":
      return "Reverse Holofoil";
    default:
      return variant
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (value) => value.toUpperCase())
        .trim();
  }
}

function buildPokemonTcgQuery(parsed: ParsedQuery): string {
  const tokens = parsed.extraTerms.length > 0
    ? parsed.extraTerms
    : parsed.apiSearch.split(/\s+/).filter(Boolean);

  const clauses: string[] = [];
  const nameToken = tokens[0];

  if (nameToken) {
    clauses.push(`name:*${nameToken.replace(/"/g, '\\"')}*`);
  }

  if (parsed.number) {
    clauses.push(`number:${parsed.number.split("/")[0]}*`);
  }

  return clauses.join(" ");
}

async function fetchCardsFromPokemonTcg(
  parsed: ParsedQuery
): Promise<CardSearchResult[]> {
  const query = buildPokemonTcgQuery(parsed);
  if (!query) return [];

  const url = new URL(POKEMON_TCG_API_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("pageSize", "50");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return [];

  const body = await res.json();
  const data = Array.isArray(body.data) ? (body.data as PokemonTcgApiCard[]) : [];

  return data.map((card) => {
    const prices = Object.entries(card.tcgplayer?.prices ?? {}).reduce<CardPrices>(
      (acc, [variant, priceData]) => {
        if (!priceData) return acc;
        acc[formatPokemonTcgVariantName(variant)] = {
          low: priceData.low ?? null,
          mid: priceData.mid ?? null,
          high: priceData.high ?? null,
          market: priceData.market ?? null,
          directLow: priceData.directLow ?? null,
        };
        return acc;
      },
      {}
    );

    const imageAssets = buildCardImageAssets({
      imageSmall: card.images?.small ?? "",
      imageLarge: card.images?.large ?? card.images?.small ?? "",
    });

    return {
      id: String(card.id ?? ""),
      name: card.name ?? "",
      set: card.set?.name ?? "Unknown",
      setId: String(card.set?.id ?? ""),
      number: card.number ?? "",
      rarity: card.rarity ?? null,
      imageSmall: imageAssets.small?.selectedUrl ?? "",
      imageLarge:
        imageAssets.large?.selectedUrl ?? imageAssets.small?.selectedUrl ?? "",
      imageAssets,
      prices,
      tcgplayerUrl: card.tcgplayer?.url ?? null,
    };
  });
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

  return [...grouped.values()].map(({ base, prices }) => {
    const imageAssets = buildCardImageAssets({
      imageSmall: base.image_url ?? "",
      imageLarge: base.image_url ?? "",
    });

    return {
      id: String(base.tcgplayer_id ?? base.id),
      name: base.name,
      set: base.set_name ?? "Unknown",
      setId: String(base.set_id ?? ""),
      number: base.number ?? "",
      rarity: base.rarity ?? null,
      imageSmall: imageAssets.small?.selectedUrl ?? "",
      imageLarge:
        imageAssets.large?.selectedUrl ?? imageAssets.small?.selectedUrl ?? "",
      imageAssets,
      prices,
      tcgplayerUrl: base.tcgplayer_id
        ? `https://www.tcgplayer.com/product/${base.tcgplayer_id}`
        : null,
    };
  });
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
    return NextResponse.json({
      cards: await hydrateStoredCardImages(cached),
    });
  }

  try {
    const apiKey = process.env.TCG_API_KEY?.trim() || null;
    const parsed = parseSearchQuery(q);
    const localCards = rankCards(await loadCardCatalog(), parsed, q, true);

    let liveCards: CardSearchResult[] = [];

    if (!shouldUseLocalCatalogOnly(localCards, parsed, q)) {
      try {
        if (apiKey) {
          try {
            liveCards = await fetchCards(parsed.apiSearch, apiKey);

            // Fallback: if few results and multi-word text, retry with just the first word
            // Handles "Scorbunny Ascended Heroes" → search "Scorbunny", score by set match
            if (liveCards.length < 3 && parsed.extraTerms.length > 1) {
              const fallbackCards = await fetchCards(parsed.extraTerms[0], apiKey);
              liveCards = dedupeCards([...liveCards, ...fallbackCards]);
            }
          } catch (err) {
            if (!(err instanceof Error) || err.message !== TCG_API_RATE_LIMIT) {
              throw err;
            }
          }
        }

        if (liveCards.length === 0) {
          liveCards = await fetchCardsFromPokemonTcg(parsed);
        }
      } catch (error) {
        if (localCards.length === 0) {
          throw error;
        }

        console.warn("Card search fallback provider failed, using local catalog:", error);
      }
    }

    const cards = await hydrateStoredCardImages(
      rankCards([...localCards, ...liveCards], parsed, q)
    );
    const hydratedLiveCards = await hydrateStoredCardImages(liveCards);

    if (liveCards.length > 0) {
      persistCardData(hydratedLiveCards);
    }

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

  warmCardCatalog(batch);

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
      ownedImageSmallPath: card.imageAssets?.small?.owned?.path ?? null,
      ownedImageLargePath: card.imageAssets?.large?.owned?.path ?? null,
      imageSmallMirrorSourceUrl:
        card.imageAssets?.small?.mirrorSource?.url ??
        card.imageAssets?.small?.fallback?.url ??
        null,
      imageSmallMirrorSourceProvider:
        card.imageAssets?.small?.mirrorSource?.provider ??
        card.imageAssets?.small?.fallback?.provider ??
        null,
      imageSmallMirroredAt:
        card.imageAssets?.small?.mirrorSource?.mirroredAt ?? null,
      imageLargeMirrorSourceUrl:
        card.imageAssets?.large?.mirrorSource?.url ??
        card.imageAssets?.large?.fallback?.url ??
        null,
      imageLargeMirrorSourceProvider:
        card.imageAssets?.large?.mirrorSource?.provider ??
        card.imageAssets?.large?.fallback?.provider ??
        null,
      imageLargeMirroredAt:
        card.imageAssets?.large?.mirrorSource?.mirroredAt ?? null,
      tcgplayerUrl: card.tcgplayerUrl,
      pokedataId: card.pokedataId ?? null,
    }).catch(() => {});

    // Save current TCG prices with timestamp
    putCardTcgPrices(card.id, card.prices).catch(() => {});
  }
}
