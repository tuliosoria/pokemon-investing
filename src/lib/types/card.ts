export interface CardPriceVariant {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  directLow: number | null;
}

export interface CardPrices {
  [variant: string]: CardPriceVariant;
}

export interface CardSearchResult {
  id: string;
  name: string;
  set: string;
  setId: string;
  number: string;
  rarity: string | null;
  imageSmall: string;
  imageLarge: string;
  prices: CardPrices;
  tcgplayerUrl: string | null;
}

export function getBestPrice(prices: CardPrices): {
  variant: string;
  price: number;
} | null {
  // Prefer Normal, then common premium printings from tcgapi.dev
  const priority = ["Normal", "Foil", "Holofoil", "Reverse Holofoil"];

  for (const variant of priority) {
    if (prices[variant]) {
      const price = resolvePrice(prices[variant]);
      if (price !== null) return { variant, price };
    }
  }

  // Fallback: any variant with a price
  for (const [variant, data] of Object.entries(prices)) {
    const price = resolvePrice(data);
    if (price !== null) return { variant, price };
  }

  return null;
}

function resolvePrice(v: CardPriceVariant): number | null {
  if (v.market && v.market > 0) return v.market;
  if (v.mid && v.mid > 0) return v.mid;
  if (v.low != null && v.high != null && v.low > 0 && v.high > 0) {
    return (v.low + v.high) / 2;
  }
  if (v.directLow && v.directLow > 0) return v.directLow;
  return null;
}
