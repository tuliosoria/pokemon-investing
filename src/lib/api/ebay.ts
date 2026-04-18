/**
 * eBay Browse API client for fetching live sealed product prices.
 *
 * Requires environment variables:
 * - EBAY_CLIENT_ID (App ID from eBay Developer portal)
 * - EBAY_CLIENT_SECRET (Cert ID from eBay Developer portal)
 *
 * Uses OAuth 2.0 client_credentials grant for application-level access.
 * Browse API docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
 */

const EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";

// Pokemon TCG sealed product categories on eBay
const POKEMON_SEALED_CATEGORIES = [
  "183454", // Sealed Booster Packs
  "183456", // Sealed Boxes
  "183453", // Sealed Cases
  "183455", // Sealed Decks & Kits
].join(",");

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

export interface EbayListing {
  title: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  itemUrl: string;
  condition: string;
}

export interface EbaySearchResult {
  listings: EbayListing[];
  medianPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  totalResults: number;
}

function getCredentials() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isEbayConfigured(): boolean {
  return getCredentials() !== null;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const creds = getCredentials();
  if (!creds) throw new Error("eBay credentials not configured");

  const basicAuth = Buffer.from(
    `${creds.clientId}:${creds.clientSecret}`
  ).toString("base64");

  const res = await fetch(EBAY_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// In-memory cache for search results (5 min TTL)
const searchCache = new Map<
  string,
  { data: EbaySearchResult; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE = 100;

export async function searchEbaySealed(
  query: string
): Promise<EbaySearchResult> {
  const cacheKey = query.toLowerCase().trim();

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const token = await getAccessToken();

  const params = new URLSearchParams({
    q: `pokemon ${query} sealed`,
    category_ids: POKEMON_SEALED_CATEGORIES,
    filter: "buyingOptions:{FIXED_PRICE},conditionIds:{1000}",
    sort: "price",
    limit: "20",
  });

  const res = await fetch(`${EBAY_BROWSE_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay Browse API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const items = data.itemSummaries || [];
  const total = data.total || 0;

  const listings: EbayListing[] = items.map(
    (item: Record<string, unknown>) => ({
      title: item.title as string,
      price: parseFloat(
        (item.price as Record<string, string>)?.value || "0"
      ),
      currency: (item.price as Record<string, string>)?.currency || "USD",
      imageUrl: (item.image as Record<string, string>)?.imageUrl || null,
      itemUrl: item.itemWebUrl as string,
      condition: (item.condition as string) || "New",
    })
  );

  const prices = listings
    .map((l) => l.price)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  const medianPrice =
    prices.length > 0
      ? prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)]
      : null;

  const result: EbaySearchResult = {
    listings,
    medianPrice,
    lowPrice: prices.length > 0 ? prices[0] : null,
    highPrice: prices.length > 0 ? prices[prices.length - 1] : null,
    totalResults: total,
  };

  if (searchCache.size >= MAX_CACHE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}
