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
    /**
     * Sum of every single's market price for the expansion this product
     * opens (from PokemonTCG.io / TCGPlayer). `setSinglesValueRatio` =
     * setSinglesValue / currentPrice — captures the depth of the
     * secondary-market singles pool, which complements `chaseEvRatio`
     * for sets where the value is spread across many secondary chases
     * rather than a single mega-card.
     */
    setSinglesValue?: number | null;
    setSinglesValueRatio?: number | null;
    /**
     * Composite community-demand score (0–100) built from Reddit engagement,
     * Google Trends, and a forum-presence placeholder.
     * Weights: reddit 0.45 · googleTrends 0.35 · forum 0.20.
     * Drives the model's `community_score` feature slot (renamed from
     * the legacy `google_trends_score` slot as of the community-score retrain).
     */
    communityScore?: number | null;
    /** Reddit sub-score (0–100) derived from post count + engagement. */
    redditScore?: number | null;
    /** Google Trends sub-score (0–100) from the manifest or neutral 50. */
    googleTrendsScore?: number | null;
    /** Forum presence sub-score (0–100) — currently a neutral placeholder. */
    forumScore?: number | null;
    /**
     * Market activity sub-score (0–100) derived from log-scaled
     * PriceCharting trailing-30-day sales volume. Acts as a "revealed
     * preference" demand signal that's much harder to fake than Reddit
     * post counts and is available for every set with PriceCharting data
     * — including modern releases where Reddit search is rate-limited.
     * When `redditScore` is missing or unreliable, this score substitutes
     * for it in the composite communityScore.
     */
    /**
     * PriceCharting trailing-30-day sales volume mapped to a 0-100 score
     * — including modern releases where Reddit search is rate-limited.
     * Always blended into the composite communityScore alongside Reddit
     * (rather than only as a fallback) so we capture both hype and
     * revealed preference.
     */
    marketActivityScore?: number | null;
    /**
     * Describes which sub-signals contributed to the composite
     * `communityScore`:
     *   "blended"     — Reddit + Market both present (best case)
     *   "reddit-only" — Reddit available, no market data
     *   "market-only" — Reddit unavailable, market data carries the score
     * UI uses this to label the breakdown honestly.
     */
    communityScoreSource?: "blended" | "reddit-only" | "market-only" | null;
    /** ISO timestamp of when the community-score JSON for this set was last refreshed. */
    communityScoreUpdatedAt?: string | null;
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

/**
 * Risk posture applied to the model's baseline projection.
 * - `pessimist` bakes in reprint pressure, declining demand, and broader
 *   Pokemon-market softening; can produce negative ROI.
 * - `moderate` is the model's default output (no adjustment).
 * - `optimist` assumes a continued nostalgia tailwind and minimal reprints.
 */
export type ForecastScenario = "pessimist" | "moderate" | "optimist";

export interface ScenarioOutlook {
  projectedValue: number;
  dollarGain: number;
  roiPercent: number;
  signal: Signal;
  annualRate: number;
  horizonPredictions: {
    oneYear: number;
    threeYear: number;
    fiveYear: number;
  };
}

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
  /** Scenario-adjusted projections. The `moderate` outlook mirrors the
   *  top-level fields above. Always populated for `status === "ready"`. */
  scenarios?: Record<ForecastScenario, ScenarioOutlook>;
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

/** Sub-signals making up the composite CommunityScore. */
export interface CommunityScoreSubsignals {
  redditScore: number;
  /**
   * Google Trends score for the set, or null when no trends data exists in
   * the manifest. Null means "unknown" — the runtime composer renormalizes
   * the blend across the signals it does have rather than treating
   * missing trends as a neutral 50.
   */
  googleTrendsScore: number | null;
  /**
   * Forum sub-signal — null today (placeholder until PokeBeach / Limitless
   * scrapers exist). The composer treats null as "skip this signal".
   */
  forumScore: number | null;
  redditPostCount: number;
  redditSentiment: number;
  /**
   * True when every Reddit subreddit fetch failed during the last build
   * (rate-limit, 403, network). Consumers should treat such entries as
   * "no community signal" rather than as low-popularity, since the
   * underlying Reddit data is missing — not negative.
   */
  redditDataMissing?: boolean;
  lastUpdated: string;
}

/** Per-set community score entry from community-score.json. */
export interface CommunityScore extends CommunityScoreSubsignals {
  setName: string;
  communityScore: number;
}

/** Shape of community-score.json. */
export interface CommunityScoreFile {
  generatedAt: string;
  weights: { reddit: number; googleTrends: number; forum: number };
  sets: Record<string, CommunityScore>;
}

export type SortField = "roi" | "price" | "signal" | "age" | "score";
export type FilterSignal = "All" | Signal;
