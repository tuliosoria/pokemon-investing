// NOTE: `pokedataId` throughout this file is purely an internal stable
// identifier for sealed products. It does NOT imply a runtime call to
// pokedata.io — PriceCharting is the primary data source and PokeData is
// only reached as a fallback for data PriceCharting cannot provide
// (e.g. PSA population counts).
import type { ResolvedImageAsset } from "@/lib/domain/image-assets";

export type ProductType = "Booster Box" | "ETB" | "Booster Bundle" | "UPC" | "Special Collection" | "Case" | "Booster Pack" | "Tin" | "Collection Box" | "Unknown";

export interface SealedSetData {
  id: string;
  name: string;
  productType: ProductType;
  releaseYear: number;
  currentPrice: number;
  gradient: string;
  tcgplayerUrl?: string | null;
  priceChartingId?: string;

  factors: {
    marketValue: number;
    chaseCardIndex: number;
    printRun: number;
    setAge: number;
    priceTrajectory: number;
    popularity: number;
    marketCycle: number;
    demandRatio: number;
    /**
     * Liquidity tier derived from PriceCharting trailing-30-day sales
     * volume normalised against per-product-type baselines. Acts as a
     * confidence booster: high-liquidity products have tight, frequent
     * transaction prices so the historical-error spread floor can be
     * relaxed and they may earn High confidence even without a curated
     * history record.
     */
    liquidityTier?: "low" | "normal" | "high";
    /**
     * Expected dollar value of chase cards pulled from one unit of the
     * product, derived from per-era pull rates × top chase market price.
     * `chaseEvRatio` = expectedChaseValue / currentPrice (>1.0 means the
     * chase EV alone exceeds the sealed price).
     */
    expectedChaseValue?: number | null;
    chaseEvRatio?: number | null;
  };

  chaseCards: string[];
  printRunLabel: "Limited" | "Standard" | "Overprinted";
  notes: string;

  /** true for curated sets with richer manually maintained metadata */
  curated?: boolean;
  /** PokeData product ID for API-sourced products */
  pokedataId?: string;
  /** Product image URL from PokeData */
  imageUrl?: string;
  imageAsset?: ResolvedImageAsset | null;
  /** Google Trends data when available */
  trendData?: {
    current: number;
    average: number;
    direction: "rising" | "stable" | "declining";
  };
  pricingContext?: {
    priceChartingPrice?: number | null;
    tcgplayerPrice?: number | null;
    ebayPrice?: number | null;
    pokedataPrice?: number | null;
    bestPrice?: number | null;
    primaryProvider?: "pricecharting" | "pokedata" | "fallback";
    snapshotDate?: string | null;
    salesVolume?: number | null;
    manualOnlyPrice?: number | null;
  };
}

export type Signal = "Buy" | "Hold" | "Sell";
export type Confidence = "Low" | "Medium" | "High";
export type ForecastStatus = "ready" | "too_new" | "insufficient_data";

export interface Forecast {
  compositeScore: number;
  signal: Signal;
  confidence: Confidence;
  annualRate: number;
  projectedValue: number;
  dollarGain: number;
  roiPercent: number;
  spRoi: number;
  /** Number of ML inputs estimated heuristically instead of resolved from data */
  estimatedFactors: number;
  predictionSpreadPercent: number;
  horizonPredictions: {
    oneYear: number;
    threeYear: number;
    fiveYear: number;
  };
  status: ForecastStatus;
  statusMessage: string | null;
}

/** Product returned from PokeData sealed search */
export interface SealedSearchResult {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  imageUrl: string | null;
  imageAsset?: ResolvedImageAsset | null;
  tcgplayerUrl?: string | null;
  priceChartingId?: string;
}

/** Pricing returned from stored snapshots and PriceCharting fallbacks */
export interface SealedPricing {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  imageUrl: string | null;
  imageAsset?: ResolvedImageAsset | null;
  tcgplayerUrl?: string | null;
  priceChartingId?: string;
  priceChartingProductName?: string | null;
  priceChartingConsoleName?: string | null;
  priceChartingPrice?: number | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  pokedataPrice: number | null;
  bestPrice: number | null;
  primaryProvider?: "pricecharting" | "pokedata" | "fallback";
  snapshotDate?: string | null;
  salesVolume?: number | null;
  manualOnlyPrice?: number | null;
  /** PokeData snapshot price exposed only as a clearly-labeled legacy fallback. */
  fallbackPokedataPrice?: number | null;
}

export interface ProjectionPoint {
  label: string;
  month: number;
  setValue: number;
  sp500: number;
}

export type SortField = "roi" | "price" | "signal" | "age" | "score";
export type FilterSignal = "All" | Signal;
