export type ProductType = "Booster Box" | "ETB" | "Booster Bundle" | "UPC" | "Special Collection" | "Case" | "Booster Pack" | "Tin" | "Collection Box" | "Unknown";

export interface SealedSetData {
  id: string;
  name: string;
  productType: ProductType;
  releaseYear: number;
  currentPrice: number;
  gradient: string;

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

  /** true for curated sets with hand-tuned factor scores */
  curated?: boolean;
  /** PokeData product ID for API-sourced products */
  pokedataId?: string;
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
  /** Number of factors that are estimated vs hand-tuned (0-8) */
  estimatedFactors: number;
}

/** Product returned from PokeData sealed search */
export interface SealedSearchResult {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
}

/** Pricing returned from PokeData sealed pricing */
export interface SealedPricing {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  pokedataPrice: number | null;
  bestPrice: number | null;
}

export interface FactorContribution {
  key: string;
  name: string;
  score: number;
  weight: number;
  weightLabel: string;
  contribution: number;
}

export interface ProjectionPoint {
  label: string;
  month: number;
  setValue: number;
  sp500: number;
}

export type SortField = "roi" | "price" | "signal" | "age" | "score";
export type FilterSignal = "All" | Signal;
