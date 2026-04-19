export interface SealedSetData {
  id: string;
  name: string;
  productType: "Booster Box" | "ETB" | "Booster Bundle" | "UPC" | "Special Collection";
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
