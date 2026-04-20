import "server-only";

import manifestProductsData from "@/lib/data/sealed-ml/products.json";
import historySummaryData from "@/lib/data/sealed-ml/product-history-summary.json";
import model1yrData from "@/lib/data/sealed-ml/model-1yr.json";
import model3yrData from "@/lib/data/sealed-ml/model-3yr.json";
import model5yrData from "@/lib/data/sealed-ml/model-5yr.json";
import { SP500_ANNUAL_RETURN } from "@/lib/domain/sealed-forecast";
import type {
  Confidence,
  FactorContribution,
  Forecast,
  ProductType,
  SealedSetData,
  Signal,
} from "@/lib/types/sealed";

export type FeatureKey =
  | "current_price"
  | "most_expensive_card_price"
  | "chase_card_count"
  | "chase_card_index_score"
  | "set_age_years"
  | "google_trends_score"
  | "print_run_type_encoded"
  | "price_trajectory_6mo"
  | "price_trajectory_24mo"
  | "collector_demand_ratio"
  | "market_cycle_score"
  | "popularity_score"
  | "product_type_encoded"
  | "era_encoded";

interface ManifestProduct {
  setId: string;
  name: string;
  productType: ProductType;
  releaseDate: string;
  priceChartingUrl: string;
  printRunType: "Limited" | "Standard" | "Overprinted";
  era: "Base/Neo" | "EX/DS" | "HGSS/BW" | "XY/SM/Modern";
  mostExpensiveCardPrice: number;
  chaseCardCount: number;
  chaseCardIndexScore: number;
  googleTrendsScore: number;
  collectorDemandRatio: number;
  marketCycleScore: number;
  popularityScore: number;
}

interface ProductHistorySummary {
  name: string;
  latestPriceDate: string;
  latestHistoricalPrice: number;
  priceTrajectory6mo: number | null;
  priceTrajectory24mo: number | null;
  historyPoints: number;
}

interface ModelLeafNode {
  nodeid: number;
  leaf: number;
  cover?: number;
}

interface ModelSplitNode {
  nodeid: number;
  depth: number;
  split: FeatureKey;
  split_condition: number;
  yes: number;
  no: number;
  missing: number;
  gain?: number;
  cover?: number;
  children: ModelNode[];
}

export type ModelNode = ModelLeafNode | ModelSplitNode;

export interface ModelImportance {
  key: FeatureKey;
  name: string;
  gain: number;
  influence: number;
}

export interface ModelArtifact {
  featureNames: FeatureKey[];
  baseScore: number;
  trees: ModelNode[];
  treeCount: number;
  globalImportance: ModelImportance[];
}

export interface ForecastModelBundle {
  oneYear: ModelArtifact;
  threeYear: ModelArtifact;
  fiveYear: ModelArtifact;
}

interface FeatureInput {
  values: Record<FeatureKey, number>;
  labels: Record<FeatureKey, string>;
  estimatedFactors: number;
}

export interface ForecastFeatureSnapshot {
  features: Record<FeatureKey, number>;
  estimatedFactors: number;
}

interface ModelPrediction {
  predictedPrice: number;
  leafContributions: number[];
  localImpacts: Map<FeatureKey, number>;
  spreadPercent: number;
}

interface GuardrailedPredictions {
  oneYearPrice: number;
  threeYearPrice: number;
  fiveYearPrice: number;
  spreadPercent: number;
}

const FEATURE_LABELS: Record<FeatureKey, string> = {
  current_price: "Current Price",
  most_expensive_card_price: "Top Chase Card Value",
  chase_card_count: "$50+ Chase Cards",
  chase_card_index_score: "Chase Card Index",
  set_age_years: "Set Age",
  google_trends_score: "Google Trends",
  print_run_type_encoded: "Print Run",
  price_trajectory_6mo: "6-Month Trajectory",
  price_trajectory_24mo: "24-Month Trajectory",
  collector_demand_ratio: "Collector Demand Ratio",
  market_cycle_score: "Market Cycle",
  popularity_score: "Popularity Score",
  product_type_encoded: "Product Type",
  era_encoded: "Era",
};

const PRINT_RUN_ENCODING = {
  Limited: 2,
  Standard: 1,
  Overprinted: 0,
} as const;

const PRODUCT_TYPE_ENCODING: Record<ProductType, number> = {
  ETB: 3,
  "Booster Box": 2,
  "Booster Bundle": 1,
  "Booster Pack": 1,
  UPC: 1,
  "Collection Box": 1,
  "Special Collection": 1,
  Tin: 0,
  Case: 0,
  Unknown: 1,
};

const PRODUCT_TYPE_LABELS: Record<number, string> = {
  0: "Tin / Case",
  1: "Bundle / UPC / Collection",
  2: "Booster Box",
  3: "ETB",
};

const ERA_ENCODING = {
  "Base/Neo": 3,
  "EX/DS": 2,
  "HGSS/BW": 1,
  "XY/SM/Modern": 0,
} as const;

const ERA_LABELS: Record<number, string> = {
  0: "XY / SM / Modern",
  1: "HGSS / BW",
  2: "EX / DS",
  3: "Base / Neo",
};

const MSRP_ESTIMATES: Record<ProductType, number> = {
  "Booster Box": 144,
  ETB: 50,
  "Booster Bundle": 30,
  "Booster Pack": 4,
  UPC: 120,
  Tin: 25,
  "Collection Box": 30,
  "Special Collection": 50,
  Case: 700,
  Unknown: 50,
};

const MARKET_CYCLE_BY_YEAR: Record<number, number> = {
  2016: 44,
  2017: 49,
  2018: 46,
  2019: 52,
  2020: 78,
  2021: 92,
  2022: 38,
  2023: 55,
  2024: 67,
  2025: 63,
  2026: 58,
};

const manifestProducts = manifestProductsData as ManifestProduct[];
const historySummary = historySummaryData as Record<string, ProductHistorySummary>;
const model1yr = model1yrData as ModelArtifact;
const model3yr = model3yrData as ModelArtifact;
const model5yr = model5yrData as ModelArtifact;
export const fallbackForecastModelBundle: ForecastModelBundle = {
  oneYear: model1yr,
  threeYear: model3yr,
  fiveYear: model5yr,
};

const manifestById = new Map(manifestProducts.map((product) => [product.setId, product]));
const manifestByKey = new Map(
  manifestProducts.map((product) => [buildManifestKey(product.name, product.productType), product])
);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function buildManifestKey(name: string, productType: string): string {
  return `${normalizeText(name)}|${normalizeText(productType)}`;
}

function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatSignedPercent(value: number): string {
  const rounded = round(value, 1);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function formatYears(value: number): string {
  return `${round(value, 1)}yr`;
}

function blendTowardNeutral(value: number, weight: number, neutral = 50): number {
  return round(neutral + (value - neutral) * weight, 2);
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCount(value: number): string {
  return `${Math.round(value)}`;
}

function formatEncodedLabel(feature: FeatureKey, value: number): string {
  if (feature === "print_run_type_encoded") {
    if (value >= 1.5) return "Limited";
    if (value >= 0.5) return "Standard";
    return "Overprinted";
  }

  if (feature === "product_type_encoded") {
    return PRODUCT_TYPE_LABELS[Math.round(value)] ?? "Mixed";
  }

  if (feature === "era_encoded") {
    return ERA_LABELS[Math.round(value)] ?? "Modern";
  }

  return `${value}`;
}

function formatFeatureValue(feature: FeatureKey, value: number): string {
  switch (feature) {
    case "current_price":
    case "most_expensive_card_price":
      return formatCurrency(value);
    case "chase_card_count":
      return formatCount(value);
    case "set_age_years":
      return formatYears(value);
    case "collector_demand_ratio":
      return formatRatio(value);
    case "price_trajectory_6mo":
    case "price_trajectory_24mo":
      return formatSignedPercent(value);
    case "print_run_type_encoded":
    case "product_type_encoded":
    case "era_encoded":
      return formatEncodedLabel(feature, value);
    default:
      return `${Math.round(value)}/100`;
  }
}

function resolveEraFromYear(releaseYear: number): keyof typeof ERA_ENCODING {
  if (releaseYear <= 2001) return "Base/Neo";
  if (releaseYear <= 2007) return "EX/DS";
  if (releaseYear <= 2013) return "HGSS/BW";
  return "XY/SM/Modern";
}

function inferSetAgeYears(set: SealedSetData, manifestProduct?: ManifestProduct): number {
  const releaseDate = manifestProduct?.releaseDate
    ? new Date(`${manifestProduct.releaseDate}T00:00:00Z`)
    : new Date(Date.UTC(set.releaseYear, 0, 1));
  const now = new Date();
  const ageMs = Math.max(now.getTime() - releaseDate.getTime(), 0);
  return round(ageMs / (365.25 * 24 * 60 * 60 * 1000), 4);
}

function launchSignalWeight(ageYears: number): number {
  if (ageYears < 0.08) {
    return 0.15;
  }
  if (ageYears < 0.25) {
    return 0.35;
  }
  if (ageYears < 0.5) {
    return 0.55;
  }
  if (ageYears < 1) {
    return 0.75;
  }
  return 1;
}

function isBroadPrintRun(printRunTypeEncoded: number): boolean {
  return printRunTypeEncoded <= PRINT_RUN_ENCODING.Standard;
}

function marketCycleForYear(year: number): number {
  const years = Object.keys(MARKET_CYCLE_BY_YEAR)
    .map(Number)
    .sort((left, right) => left - right);

  if (year <= years[0]) {
    return MARKET_CYCLE_BY_YEAR[years[0]];
  }

  const lastYear = years[years.length - 1];
  if (year >= lastYear) {
    return MARKET_CYCLE_BY_YEAR[lastYear];
  }

  for (let index = 0; index < years.length - 1; index += 1) {
    const left = years[index];
    const right = years[index + 1];
    if (year >= left && year <= right) {
      const pct = (year - left) / Math.max(right - left, 1);
      return round(
        MARKET_CYCLE_BY_YEAR[left] +
          (MARKET_CYCLE_BY_YEAR[right] - MARKET_CYCLE_BY_YEAR[left]) * pct,
        2
      );
    }
  }

  return 55;
}

function estimateTrajectoryPercent(
  currentPrice: number,
  productType: ProductType,
  ageYears: number,
  months: number
): number {
  if (currentPrice <= 0 || ageYears <= 0.25) {
    return 0;
  }

  const msrp = MSRP_ESTIMATES[productType] ?? 50;
  const priceMultiple = clamp(currentPrice / Math.max(msrp, 1), 0.15, 300);
  const annualGrowth = Math.pow(priceMultiple, 1 / Math.max(ageYears, 0.5)) - 1;
  const periodGrowth = Math.pow(Math.max(0.05, 1 + annualGrowth), months / 12) - 1;
  return round(clamp(periodGrowth * 100, -80, 600), 3);
}

function estimateMostExpensiveCardPrice(
  set: SealedSetData,
  ageYears: number,
  chaseCardIndexScore: number
): number {
  const agePenalty = clamp(ageYears * 0.02, 0, 0.35);
  const chaseBoost = clamp(chaseCardIndexScore / 220, 0.18, 0.45);
  const ratio = clamp(0.52 - agePenalty + chaseBoost, 0.12, 0.78);
  return round(Math.max(15, set.currentPrice * ratio), 2);
}

function estimateChaseCardCount(set: SealedSetData, popularityScore: number): number {
  if (set.chaseCards.length > 0) {
    return set.chaseCards.length;
  }

  const baseline =
    set.productType === "Booster Box"
      ? 4
      : set.productType === "ETB"
        ? 3
        : set.productType === "Booster Bundle"
          ? 2
          : 1;

  return clamp(Math.round(baseline + popularityScore / 45), 1, 8);
}

function getManifestProduct(set: SealedSetData): ManifestProduct | undefined {
  const byId = manifestById.get(set.id);
  if (byId) {
    return byId;
  }

  const byKey = manifestByKey.get(buildManifestKey(set.name, set.productType));
  if (byKey) {
    return byKey;
  }

  const normalizedSetName = normalizeText(set.name);
  return manifestProducts.find((product) => {
    if (product.productType !== set.productType) {
      return false;
    }

    const normalizedManifestName = normalizeText(product.name);
    return (
      normalizedSetName.includes(normalizedManifestName) ||
      normalizedManifestName.includes(normalizedSetName)
    );
  });
}

function buildFeatureInput(set: SealedSetData): FeatureInput {
  const manifestProduct = getManifestProduct(set);
  const setHistory = manifestProduct ? historySummary[manifestProduct.setId] : undefined;
  const isCurated = set.curated !== false;
  let estimatedFactors = 0;

  const setAgeYears = inferSetAgeYears(set, manifestProduct);
  const printRunType =
    manifestProduct?.printRunType ??
    set.printRunLabel;
  const demandSignalWeight = isBroadPrintRun(PRINT_RUN_ENCODING[printRunType])
    ? launchSignalWeight(setAgeYears)
    : 1;
  const rawPopularityScore = clamp(
    set.factors.popularity ||
      manifestProduct?.popularityScore ||
      (set.trendData?.current ? set.trendData.current : 50),
    0,
    100
  );
  const popularityScore = clamp(
    blendTowardNeutral(rawPopularityScore, demandSignalWeight),
    0,
    100
  );
  const chaseCardIndexScore = clamp(
    manifestProduct?.chaseCardIndexScore ?? set.factors.chaseCardIndex ?? 50,
    0,
    100
  );

  const currentPrice = round(Math.max(set.currentPrice, 0), 2);
  const mostExpensiveCardPrice =
    manifestProduct?.mostExpensiveCardPrice ??
    estimateMostExpensiveCardPrice(set, setAgeYears, chaseCardIndexScore);
  if (!manifestProduct && !isCurated) {
    estimatedFactors += 1;
  }

  const chaseCardCount =
    manifestProduct?.chaseCardCount ?? estimateChaseCardCount(set, popularityScore);
  if (!manifestProduct && !isCurated && set.chaseCards.length === 0) {
    estimatedFactors += 1;
  }

  const rawGoogleTrendsScore =
    set.trendData?.current ??
    manifestProduct?.googleTrendsScore ??
    set.factors.popularity ??
    50;
  const googleTrendsScore = clamp(
    blendTowardNeutral(rawGoogleTrendsScore, demandSignalWeight),
    0,
    100
  );
  if (!set.trendData && !manifestProduct && !isCurated) {
    estimatedFactors += 1;
  }

  const useNeutralLaunchTrajectories = !setHistory && setAgeYears < 1;
  const trajectory6mo =
    setHistory?.priceTrajectory6mo ??
    (useNeutralLaunchTrajectories
      ? 0
      : estimateTrajectoryPercent(currentPrice, set.productType, setAgeYears, 6));
  if (!setHistory) {
    estimatedFactors += 1;
  }

  const trajectory24mo =
    setHistory?.priceTrajectory24mo ??
    (useNeutralLaunchTrajectories
      ? 0
      : estimateTrajectoryPercent(currentPrice, set.productType, setAgeYears, 24));
  if (!setHistory) {
    estimatedFactors += 1;
  }

  const collectorDemandRatio =
    manifestProduct?.collectorDemandRatio ??
    clamp((set.factors.demandRatio ?? 50) / 100, 0.1, 1);
  if (!manifestProduct && !isCurated) {
    estimatedFactors += 1;
  }

  const era =
    manifestProduct?.era ??
    resolveEraFromYear(set.releaseYear);

  const marketCycleScore = clamp(
    set.factors.marketCycle || manifestProduct?.marketCycleScore || marketCycleForYear(new Date().getUTCFullYear()),
    0,
    100
  );

  const values: Record<FeatureKey, number> = {
    current_price: currentPrice,
    most_expensive_card_price: round(mostExpensiveCardPrice, 2),
    chase_card_count: clamp(Math.round(chaseCardCount), 1, 12),
    chase_card_index_score: chaseCardIndexScore,
    set_age_years: setAgeYears,
    google_trends_score: clamp(googleTrendsScore, 0, 100),
    print_run_type_encoded: PRINT_RUN_ENCODING[printRunType],
    price_trajectory_6mo: trajectory6mo,
    price_trajectory_24mo: trajectory24mo,
    collector_demand_ratio: round(collectorDemandRatio, 3),
    market_cycle_score: round(marketCycleScore, 2),
    popularity_score: round(popularityScore, 2),
    product_type_encoded: PRODUCT_TYPE_ENCODING[set.productType],
    era_encoded: ERA_ENCODING[era],
  };

  const labels = Object.fromEntries(
    Object.entries(values).map(([feature, value]) => [
      feature,
      formatFeatureValue(feature as FeatureKey, value),
    ])
  ) as Record<FeatureKey, string>;

  return {
    values,
    labels,
    estimatedFactors,
  };
}

function isLeafNode(node: ModelNode): node is ModelLeafNode {
  return "leaf" in node;
}

function getChildNode(node: ModelSplitNode, nodeId: number): ModelNode {
  const child = node.children.find((candidate) => candidate.nodeid === nodeId);
  if (!child) {
    throw new Error(`Unable to resolve child node ${nodeId} for ${node.split}`);
  }
  return child;
}

function traverseTree(
  node: ModelNode,
  features: Record<FeatureKey, number>,
  path: Array<{ feature: FeatureKey; gain: number }>
): number {
  if (isLeafNode(node)) {
    return node.leaf;
  }

  const rawValue = features[node.split];
  const isMissing = !Number.isFinite(rawValue);
  const nextNodeId = isMissing
    ? node.missing
    : rawValue < node.split_condition
      ? node.yes
      : node.no;

  path.push({
    feature: node.split,
    gain: node.gain ?? 0,
  });

  return traverseTree(getChildNode(node, nextNodeId), features, path);
}

function computeSpreadPercent(baseScore: number, leafContributions: number[]): number {
  if (leafContributions.length === 0) {
    return 100;
  }

  const mean =
    leafContributions.reduce((sum, value) => sum + value, 0) / leafContributions.length;
  const variance =
    leafContributions.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    leafContributions.length;
  const logStdDev = Math.sqrt(variance) * Math.sqrt(leafContributions.length);
  const totalContribution = leafContributions.reduce((sum, value) => sum + value, 0);
  const center = Math.exp(baseScore + totalContribution);
  if (center <= 0) {
    return 100;
  }

  const upper = Math.exp(baseScore + totalContribution + logStdDev);
  const lower = Math.exp(baseScore + totalContribution - logStdDev);
  return round(((upper - lower) / center) * 100, 2);
}

function runModel(
  model: ModelArtifact,
  features: Record<FeatureKey, number>
): ModelPrediction {
  const leafContributions: number[] = [];
  const localImpacts = new Map<FeatureKey, number>();

  for (const tree of model.trees) {
    const path: Array<{ feature: FeatureKey; gain: number }> = [];
    const leafContribution = traverseTree(tree, features, path);
    leafContributions.push(leafContribution);

    if (path.length === 0) {
      continue;
    }

    const totalGain = path.reduce((sum, step) => sum + step.gain, 0);
    const divisor = totalGain > 0 ? totalGain : path.length;
    for (const step of path) {
      const weight = totalGain > 0 ? step.gain / divisor : 1 / divisor;
      const signedImpact = leafContribution * weight;
      localImpacts.set(step.feature, (localImpacts.get(step.feature) ?? 0) + signedImpact);
    }
  }

  const logPrediction =
    model.baseScore + leafContributions.reduce((sum, value) => sum + value, 0);

  return {
    predictedPrice: Math.exp(logPrediction),
    leafContributions,
    localImpacts,
    spreadPercent: computeSpreadPercent(model.baseScore, leafContributions),
  };
}

function resolveConfidence(spreadPercent: number): Confidence {
  if (spreadPercent < 15) {
    return "High";
  }
  if (spreadPercent <= 35) {
    return "Medium";
  }
  return "Low";
}

function lacksHistoricalTrajectory(input: FeatureInput): boolean {
  return (
    Math.abs(input.values.price_trajectory_6mo) < 0.001 &&
    Math.abs(input.values.price_trajectory_24mo) < 0.001
  );
}

function capPredictionByAnnualRate(
  currentPrice: number,
  years: number,
  annualRate: number
): number {
  return round(currentPrice * Math.pow(1 + annualRate, years), 2);
}

function applySparseLaunchGuardrails(
  input: FeatureInput,
  rawPredictions: GuardrailedPredictions
): GuardrailedPredictions {
  const currentPrice = input.values.current_price;
  const setAgeYears = input.values.set_age_years;
  const printRunTypeEncoded = input.values.print_run_type_encoded;

  const isSparseLaunch =
    currentPrice > 0 &&
    setAgeYears < 1 &&
    isBroadPrintRun(printRunTypeEncoded) &&
    lacksHistoricalTrajectory(input);

  if (!isSparseLaunch) {
    return rawPredictions;
  }

  let annualCap =
    setAgeYears < 0.08
      ? 0.05
      : setAgeYears < 0.25
        ? 0.08
        : setAgeYears < 0.5
          ? 0.1
          : 0.14;

  if (printRunTypeEncoded < PRINT_RUN_ENCODING.Standard) {
    annualCap -= 0.02;
  }
  if (input.estimatedFactors >= 4) {
    annualCap -= 0.02;
  }
  if (input.estimatedFactors <= 2) {
    annualCap += 0.01;
  }
  if (rawPredictions.spreadPercent <= 20) {
    annualCap += 0.01;
  }
  if (rawPredictions.spreadPercent > 35) {
    annualCap -= 0.01;
  }

  annualCap = clamp(annualCap, 0.04, 0.16);

  return {
    oneYearPrice: Math.min(
      rawPredictions.oneYearPrice,
      capPredictionByAnnualRate(currentPrice, 1, annualCap)
    ),
    threeYearPrice: Math.min(
      rawPredictions.threeYearPrice,
      capPredictionByAnnualRate(currentPrice, 3, annualCap)
    ),
    fiveYearPrice: Math.min(
      rawPredictions.fiveYearPrice,
      capPredictionByAnnualRate(currentPrice, 5, annualCap)
    ),
    spreadPercent: Math.max(rawPredictions.spreadPercent, 45),
  };
}

function normalizeFeatureContributions(
  input: FeatureInput,
  localImpacts: Map<FeatureKey, number>,
  globalImportance: ModelImportance[]
): FactorContribution[] {
  const positiveMass = [...localImpacts.values()].reduce(
    (sum, value) => sum + Math.abs(value),
    0
  );

  if (positiveMass <= 0) {
    return globalImportance.map((item) => ({
      key: item.key,
      name: FEATURE_LABELS[item.key],
      influence: round(item.influence, 1),
      direction: "Neutral",
      valueLabel: input.labels[item.key],
    }));
  }

  return [...localImpacts.entries()]
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .map(([feature, impact]) => ({
      key: feature,
      name: FEATURE_LABELS[feature],
      influence: round((Math.abs(impact) / positiveMass) * 100, 1),
      direction: impact > 0.0001 ? "Positive" : impact < -0.0001 ? "Negative" : "Neutral",
      valueLabel: input.labels[feature],
    }));
}

function buildForecast(
  set: SealedSetData,
  input: FeatureInput,
  models: ForecastModelBundle
): Forecast {
  const prediction1yr = runModel(models.oneYear, input.values);
  const prediction3yr = runModel(models.threeYear, input.values);
  const prediction5yr = runModel(models.fiveYear, input.values);
  const adjustedPredictions = applySparseLaunchGuardrails(input, {
    oneYearPrice: Math.max(prediction1yr.predictedPrice, 0),
    threeYearPrice: Math.max(prediction3yr.predictedPrice, 0),
    fiveYearPrice: Math.max(prediction5yr.predictedPrice, 0),
    spreadPercent: prediction5yr.spreadPercent,
  });

  const currentPrice = Math.max(set.currentPrice, 0);
  const predictedFiveYearPrice = adjustedPredictions.fiveYearPrice;
  const projectedValue = Math.round(predictedFiveYearPrice);
  const dollarGain = round(predictedFiveYearPrice - currentPrice, 2);
  const roiPercent =
    currentPrice > 0
      ? Math.round(((predictedFiveYearPrice - currentPrice) / currentPrice) * 100)
      : 0;
  const spRoi = Math.round((Math.pow(1 + SP500_ANNUAL_RETURN, 5) - 1) * 100);
  const benchmarkDelta = roiPercent - spRoi;

  const signal: Signal =
    benchmarkDelta >= 10 ? "Buy" : benchmarkDelta >= 0 ? "Hold" : "Sell";
  const confidence = resolveConfidence(adjustedPredictions.spreadPercent);
  const confidenceBonus =
    confidence === "High" ? 5 : confidence === "Medium" ? 2 : 0;
  const rawScore = clamp(Math.round(50 + benchmarkDelta * 0.55 + confidenceBonus), 1, 99);
  const compositeScore =
    signal === "Buy"
      ? Math.max(rawScore, 60)
      : signal === "Hold"
        ? Math.min(59, Math.max(rawScore, 40))
        : Math.min(rawScore, 39);

  const annualRate =
    currentPrice > 0 && predictedFiveYearPrice > 0
      ? Math.pow(predictedFiveYearPrice / currentPrice, 1 / 5) - 1
      : 0;

  return {
    compositeScore,
    signal,
    confidence,
    annualRate: round(annualRate, 3),
    projectedValue,
    dollarGain,
    roiPercent,
    spRoi,
    factorContributions: normalizeFeatureContributions(
      input,
      prediction5yr.localImpacts,
      models.fiveYear.globalImportance
    ),
    estimatedFactors: input.estimatedFactors,
    predictionSpreadPercent: adjustedPredictions.spreadPercent,
    horizonPredictions: {
      oneYear: Math.max(Math.round(adjustedPredictions.oneYearPrice), 0),
      threeYear: Math.max(Math.round(adjustedPredictions.threeYearPrice), 0),
      fiveYear: projectedValue,
    },
  };
}

export function computeForecastWithModels(
  set: SealedSetData,
  models: ForecastModelBundle
): Forecast {
  const input = buildFeatureInput(set);
  return buildForecast(set, input, models);
}

export function computeForecast(set: SealedSetData): Forecast {
  return computeForecastWithModels(set, fallbackForecastModelBundle);
}

export function buildFeatureSnapshot(set: SealedSetData): ForecastFeatureSnapshot {
  const input = buildFeatureInput(set);
  return {
    features: input.values,
    estimatedFactors: input.estimatedFactors,
  };
}
