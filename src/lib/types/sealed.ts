export type ProductType = "Booster Box" | "ETB" | "Booster Bundle" | "UPC" | "Special Collection" | "Case" | "Booster Pack" | "Tin" | "Collection Box" | "Unknown";

export interface SealedSetData {
  id: string;
  name: string;
  productType: ProductType;
  releaseYear: number;
  currentPrice: number;
  gradient: string;
  tcgplayerUrl?: string | null;

  factors: {
    marketValue: number;
    chaseCardIndex: number;
    printRun: number;
    setAge: number;
    priceTrajectory: number;
    popularity: number;
    marketCycle: number;
    demandRatio: number;
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
  /** Google Trends data when available */
  trendData?: {
    current: number;
    average: number;
    direction: "rising" | "stable" | "declining";
  };
}

export type Signal = "Buy" | "Hold" | "Sell";
export type Confidence = "Low" | "Medium" | "High";

export interface Forecast {
  compositeScore: number;
  signal: Signal;
  confidence: Confidence;
  annualRate: number;
  projectedValue: number;
  dollarGain: number;
  roiPercent: number;
  spRoi: number;
  factorContributions: FactorContribution[];
  /** Number of ML inputs estimated heuristically instead of resolved from data */
  estimatedFactors: number;
  predictionSpreadPercent: number;
  horizonPredictions: {
    oneYear: number;
    threeYear: number;
    fiveYear: number;
  };
}

/** Product returned from PokeData sealed search */
export interface SealedSearchResult {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  imageUrl: string | null;
  tcgplayerUrl?: string | null;
}

/** Pricing returned from PokeData sealed pricing */
export interface SealedPricing {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  imageUrl: string | null;
  tcgplayerUrl?: string | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  pokedataPrice: number | null;
  bestPrice: number | null;
}

export interface FactorContribution {
  key: string;
  name: string;
  influence: number;
  direction: "Positive" | "Negative" | "Neutral";
  valueLabel: string;
}

export interface ProjectionPoint {
  label: string;
  month: number;
  setValue: number;
  sp500: number;
}

export type SortField = "roi" | "price" | "signal" | "age" | "score";
export type FilterSignal = "All" | Signal;
