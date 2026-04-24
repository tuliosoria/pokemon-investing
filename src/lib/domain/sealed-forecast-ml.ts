import "server-only";

import manifestProductsData from "@/lib/data/sealed-ml/products.json";
import historySummaryData from "@/lib/data/sealed-ml/product-history-summary.json";
import model1yrData from "@/lib/data/sealed-ml/model-1yr.json";
import model3yrData from "@/lib/data/sealed-ml/model-3yr.json";
import model5yrData from "@/lib/data/sealed-ml/model-5yr.json";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
  type SyncedPriceChartingCatalogEntry,
} from "@/lib/domain/pricecharting-catalog";
import { SP500_ANNUAL_RETURN } from "@/lib/domain/sealed-forecast";
import type {
  Confidence,
  Forecast,
  ForecastStatus,
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
  | "era_encoded"
  | "price_momentum_1mo"
  | "price_momentum_12mo"
  | "price_volatility_6mo"
  | "price_volatility_12mo"
  | "drawdown_12mo"
  | "history_density_12mo"
  | "available_provider_count"
  | "provider_spread_pct"
  | "provider_agreement_score"
  | "snapshot_freshness_days"
  | "liquidity_proxy_score"
  | "history_window_missing_flag"
  | "provider_context_missing_flag";

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
  priceMomentum1mo?: number | null;
  priceMomentum12mo?: number | null;
  priceVolatility6mo?: number | null;
  priceVolatility12mo?: number | null;
  drawdown12mo?: number | null;
  historyDensity12mo?: number | null;
  latestSnapshotProviderSpreadPct?: number | null;
  latestSnapshotFreshnessDays?: number | null;
  providerAgreementScore?: number | null;
  liquidityProxyScore?: number | null;
  historyWindowMissingFlag?: number | null;
  providerContextMissingFlag?: number | null;
  latestPriceChartingSalesVolume?: number | null;
  historyPoints: number;
  latestSnapshotSource?: string;
  latestSnapshotProviderCount?: number;
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
  trainingRows?: number;
  minimumTrainingRowsForApproval?: number;
  historicalErrorPercent?: number;
  targetMode?: "future_log_price" | "forward_log_return";
  validationStrategy?: string;
  deploymentApproved?: boolean;
  manualReviewReasons?: string[];
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
  features: Record<FeatureKey, number | null>;
  estimatedFactors: number;
}

interface ModelPrediction {
  predictedPrice: number;
  leafContributions: number[];
  spreadPercent: number;
}

interface GuardrailedPredictions {
  oneYearPrice: number;
  threeYearPrice: number;
  fiveYearPrice: number;
  spreadPercent: number;
}

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
  UPC: 2,
  "Collection Box": 1,
  "Special Collection": 1,
  Tin: 0,
  Case: 3,
  Unknown: 1,
};

const PRODUCT_TYPE_LABELS: Record<number, string> = {
  0: "Tin",
  1: "Bundle / Pack / Collection",
  2: "Booster Box / UPC",
  3: "ETB / Case",
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

const MAX_FORECAST_ROI_PERCENT = 300;
const MAX_ESTIMATED_FACTORS_FOR_FORECAST = 5;
const MIN_FORECAST_AGE_YEARS = 1;
const LOW_CONFIDENCE_SCORE_CAP = 69;
const MEDIUM_CONFIDENCE_SCORE_CAP = 89;
const CORE_FORECAST_PRODUCT_TYPES = new Set<ProductType>(["ETB", "Booster Box"]);
const SET_LEVEL_FALLBACK_PRODUCT_TYPES = new Set<ProductType>([
  "ETB",
  "Booster Box",
  "Booster Bundle",
  "UPC",
  "Collection Box",
  "Special Collection",
]);

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

const manifestProductsByNameSpecificity = [...manifestProducts].sort(
  (left, right) => normalizeText(right.name).length - normalizeText(left.name).length
);

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

function isCoreForecastProduct(productType: ProductType): boolean {
  return CORE_FORECAST_PRODUCT_TYPES.has(productType);
}

function supportsSetLevelFallback(productType: ProductType): boolean {
  return SET_LEVEL_FALLBACK_PRODUCT_TYPES.has(productType);
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
  if (!Number.isFinite(value)) {
    return "N/A";
  }

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
    case "price_momentum_1mo":
    case "price_momentum_12mo":
    case "price_volatility_6mo":
    case "price_volatility_12mo":
    case "drawdown_12mo":
    case "provider_spread_pct":
      return formatSignedPercent(value);
    case "history_density_12mo":
    case "provider_agreement_score":
    case "liquidity_proxy_score":
      return `${Math.round(value)}%`;
    case "available_provider_count":
    case "history_window_missing_flag":
    case "provider_context_missing_flag":
      return formatCount(value);
    case "snapshot_freshness_days":
      return `${round(value, 1)}d`;
    case "print_run_type_encoded":
    case "product_type_encoded":
    case "era_encoded":
      return formatEncodedLabel(feature, value);
    default:
      return `${Math.round(value)}/100`;
  }
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : `${value}T00:00:00Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function positivePrices(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
}

function computeProviderSpreadPercent(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const midpoint = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (midpoint <= 0) {
    return null;
  }

  return round(((Math.max(...values) - Math.min(...values)) / midpoint) * 100, 3);
}

function computeProviderAgreementScore(
  providerCount: number,
  providerSpreadPercent: number | null
): number | null {
  if (providerCount < 2 || providerSpreadPercent == null || !Number.isFinite(providerSpreadPercent)) {
    return null;
  }

  const spreadPenalty = clamp(providerSpreadPercent * 2, 0, 100);
  const breadthBonus = clamp((providerCount - 2) * 5, 0, 10);
  return round(clamp(100 - spreadPenalty + breadthBonus, 0, 100), 2);
}

function computeSnapshotFreshnessDays(snapshotDate: string | null | undefined): number | null {
  const parsed = parseDateValue(snapshotDate);
  if (!parsed) {
    return null;
  }

  const ageMs = Math.max(Date.now() - parsed.getTime(), 0);
  return round(ageMs / (24 * 60 * 60 * 1000), 2);
}

function computeLiquidityProxyScore(
  providerCount: number,
  historyDensity12mo: number | null,
  salesVolume: number | null
): number {
  const providerComponent = (clamp(providerCount, 1, 4) / 4) * 35;
  const densityComponent =
    ((Number.isFinite(historyDensity12mo ?? Number.NaN) ? historyDensity12mo ?? 0 : 0) / 100) * 45;
  const salesComponent =
    typeof salesVolume === "number" && Number.isFinite(salesVolume) && salesVolume > 0
      ? Math.min(Math.log1p(salesVolume) / Math.log1p(50), 1) * 20
      : 0;

  return round(clamp(providerComponent + densityComponent + salesComponent, 0, 100), 2);
}

function resolveSyncedCatalogEntry(
  set: SealedSetData,
  manifestProduct?: ManifestProduct
): SyncedPriceChartingCatalogEntry | null {
  const byId = getSyncedPriceChartingEntryById(set.priceChartingId);
  if (byId) {
    return byId;
  }

  return findSyncedPriceChartingEntry({
    name: set.name,
    productType: set.productType,
    releaseDate: manifestProduct?.releaseDate ?? `${set.releaseYear}-01-01`,
  });
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
  const sameProductTypeMatch = manifestProductsByNameSpecificity.find((product) => {
    if (product.productType !== set.productType) {
      return false;
    }

    const normalizedManifestName = normalizeText(product.name);
    return (
      normalizedSetName.includes(normalizedManifestName) ||
      normalizedManifestName.includes(normalizedSetName)
    );
  });

  if (sameProductTypeMatch) {
    return sameProductTypeMatch;
  }

  if (!supportsSetLevelFallback(set.productType)) {
    return undefined;
  }

  return manifestProductsByNameSpecificity.find((product) => {
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
  const syncedCatalogEntry = resolveSyncedCatalogEntry(set, manifestProduct);
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

  const trajectory6mo =
    setHistory?.priceTrajectory6mo ??
    Number.NaN;
  if (!setHistory) {
    estimatedFactors += 1;
  }

  const trajectory24mo =
    setHistory?.priceTrajectory24mo ??
    Number.NaN;
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
  const priceMomentum1mo = setHistory?.priceMomentum1mo ?? Number.NaN;
  const priceMomentum12mo = setHistory?.priceMomentum12mo ?? Number.NaN;
  const priceVolatility6mo = setHistory?.priceVolatility6mo ?? Number.NaN;
  const priceVolatility12mo = setHistory?.priceVolatility12mo ?? Number.NaN;
  const drawdown12mo = setHistory?.drawdown12mo ?? Number.NaN;
  const historyDensity12mo = setHistory?.historyDensity12mo ?? Number.NaN;
  const providerPrices = positivePrices([
    set.pricingContext?.priceChartingPrice ?? syncedCatalogEntry?.newPrice ?? null,
    set.pricingContext?.tcgplayerPrice ?? null,
    set.pricingContext?.ebayPrice ?? null,
    set.pricingContext?.pokedataPrice ?? null,
  ]);
  const availableProviderCount =
    providerPrices.length > 0
      ? providerPrices.length
      : setHistory?.latestSnapshotProviderCount ?? 1;
  const providerSpreadPercent =
    computeProviderSpreadPercent(providerPrices) ??
    setHistory?.latestSnapshotProviderSpreadPct ??
    Number.NaN;
  const providerAgreementScore =
    computeProviderAgreementScore(
      availableProviderCount,
      Number.isFinite(providerSpreadPercent) ? providerSpreadPercent : null
    ) ??
    setHistory?.providerAgreementScore ??
    Number.NaN;
  const snapshotFreshnessDays =
    computeSnapshotFreshnessDays(
      set.pricingContext?.snapshotDate ??
        syncedCatalogEntry?.capturedAt ??
        setHistory?.latestPriceDate
    ) ??
    setHistory?.latestSnapshotFreshnessDays ??
    0;
  const priceChartingSalesVolume =
    set.pricingContext?.salesVolume ??
    syncedCatalogEntry?.salesVolume ??
    setHistory?.latestPriceChartingSalesVolume ??
    null;
  const liquidityProxyScore =
    Number.isFinite(historyDensity12mo)
      ? computeLiquidityProxyScore(
          availableProviderCount,
          historyDensity12mo,
          typeof priceChartingSalesVolume === "number" ? priceChartingSalesVolume : null
        )
      : (setHistory?.liquidityProxyScore ?? computeLiquidityProxyScore(
          availableProviderCount,
          0,
          typeof priceChartingSalesVolume === "number" ? priceChartingSalesVolume : null
        ));
  const historyWindowMissingFlag =
    Number.isFinite(priceMomentum12mo) &&
    Number.isFinite(priceVolatility12mo) &&
    Number.isFinite(drawdown12mo)
      ? 0
      : (setHistory?.historyWindowMissingFlag ?? 1);
  const providerContextMissingFlag =
    availableProviderCount >= 2 && Number.isFinite(providerSpreadPercent)
      ? 0
      : (setHistory?.providerContextMissingFlag ?? 1);

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
    price_momentum_1mo: priceMomentum1mo,
    price_momentum_12mo: priceMomentum12mo,
    price_volatility_6mo: priceVolatility6mo,
    price_volatility_12mo: priceVolatility12mo,
    drawdown_12mo: drawdown12mo,
    history_density_12mo: historyDensity12mo,
    available_provider_count: availableProviderCount,
    provider_spread_pct: providerSpreadPercent,
    provider_agreement_score: providerAgreementScore,
    snapshot_freshness_days: snapshotFreshnessDays,
    liquidity_proxy_score: liquidityProxyScore,
    history_window_missing_flag: historyWindowMissingFlag,
    provider_context_missing_flag: providerContextMissingFlag,
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

function modelHasSplits(model: ModelArtifact): boolean {
  return model.trees.some((tree) => !isLeafNode(tree));
}

function canUseFiveYearModel(model: ModelArtifact): boolean {
  if (model.deploymentApproved === false) {
    return false;
  }

  return modelHasSplits(model);
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

function computeSpreadPercent(
  model: ModelArtifact,
  features: Record<FeatureKey, number>,
  leafContributions: number[]
): number {
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
  const currentPrice = Math.max(features.current_price, 0);
  const targetMode = model.targetMode ?? "future_log_price";
  const multiplier = targetMode === "forward_log_return" ? currentPrice : 1;
  const center = multiplier * Math.exp(model.baseScore + totalContribution);
  if (center <= 0) {
    return 100;
  }

  const upper = multiplier * Math.exp(model.baseScore + totalContribution + logStdDev);
  const lower = multiplier * Math.exp(model.baseScore + totalContribution - logStdDev);
  return round(((upper - lower) / center) * 100, 2);
}

function runModel(
  model: ModelArtifact,
  features: Record<FeatureKey, number>
): ModelPrediction {
  const leafContributions: number[] = [];

  for (const tree of model.trees) {
    const path: Array<{ feature: FeatureKey; gain: number }> = [];
    const leafContribution = traverseTree(tree, features, path);
    leafContributions.push(leafContribution);
  }

  const logPrediction =
    model.baseScore + leafContributions.reduce((sum, value) => sum + value, 0);
  const targetMode = model.targetMode ?? "future_log_price";
  const currentPrice = Math.max(features.current_price, 0);
  const predictedPrice =
    targetMode === "forward_log_return"
      ? currentPrice > 0
        ? currentPrice * Math.exp(logPrediction)
        : 0
      : Math.exp(logPrediction);

  return {
    predictedPrice,
    leafContributions,
    spreadPercent: computeSpreadPercent(model, features, leafContributions),
  };
}

function inferAnnualRateFromPrediction(
  currentPrice: number,
  predictedPrice: number,
  years: number
): number | null {
  if (currentPrice <= 0 || predictedPrice <= 0 || years <= 0) {
    return null;
  }

  return Math.pow(predictedPrice / currentPrice, 1 / years) - 1;
}

function deriveFiveYearFallbackPrice(
  currentPrice: number,
  prediction1yr: ModelPrediction,
  prediction3yr: ModelPrediction
): number {
  if (currentPrice <= 0) {
    return 0;
  }

  const annualRate1yr = inferAnnualRateFromPrediction(
    currentPrice,
    prediction1yr.predictedPrice,
    1
  );
  const annualRate3yr = inferAnnualRateFromPrediction(
    currentPrice,
    prediction3yr.predictedPrice,
    3
  );

  const blendedAnnualRate =
    annualRate1yr !== null && annualRate3yr !== null
      ? annualRate1yr * 0.35 + annualRate3yr * 0.65
      : annualRate3yr ?? annualRate1yr ?? 0;

  const boundedAnnualRate = clamp(blendedAnnualRate, -0.2, 0.32);
  return round(currentPrice * Math.pow(1 + boundedAnnualRate, 5), 2);
}

function resolveConfidence(spreadPercent: number): Confidence {
  // Calibrated against trained sealed-product model historical errors:
  //   1yr ≈ 30%, 3yr ≈ 38%, 5yr ≈ 46%. Anything <25% is genuinely tight,
  //   25–55% is the normal operating range, and >55% means the prediction
  //   is essentially noise.
  if (spreadPercent < 25) {
    return "High";
  }
  if (spreadPercent <= 55) {
    return "Medium";
  }
  return "Low";
}

function lacksHistoricalTrajectory(input: FeatureInput): boolean {
  return (
    (!Number.isFinite(input.values.price_trajectory_6mo) ||
      Math.abs(input.values.price_trajectory_6mo) < 0.001) &&
    (!Number.isFinite(input.values.price_trajectory_24mo) ||
      Math.abs(input.values.price_trajectory_24mo) < 0.001)
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
    setAgeYears < 1.5 &&
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
          : setAgeYears < 1
            ? 0.14
            : 0.18;

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

function applyConfidenceScoreCap(score: number, confidence: Confidence): number {
  if (confidence === "Low") {
    return Math.min(score, LOW_CONFIDENCE_SCORE_CAP);
  }

  if (confidence === "Medium") {
    return Math.min(score, MEDIUM_CONFIDENCE_SCORE_CAP);
  }

  return score;
}

function buildBlockedForecast(
  input: FeatureInput,
  status: ForecastStatus,
  statusMessage: string
): Forecast {
  const spRoi = Math.round((Math.pow(1 + SP500_ANNUAL_RETURN, 5) - 1) * 100);

  return {
    compositeScore: 0,
    signal: "Hold",
    confidence: "Low",
    annualRate: 0,
    projectedValue: 0,
    dollarGain: 0,
    roiPercent: 0,
    spRoi,
    estimatedFactors: input.estimatedFactors,
    predictionSpreadPercent: 100,
    horizonPredictions: {
      oneYear: 0,
      threeYear: 0,
      fiveYear: 0,
    },
    status,
    statusMessage,
  };
}

function buildForecast(
  set: SealedSetData,
  input: FeatureInput,
  models: ForecastModelBundle
): Forecast {
  if (input.values.set_age_years < MIN_FORECAST_AGE_YEARS) {
    return buildBlockedForecast(input, "too_new", "Too new to forecast");
  }

  const allowSparseForecast = isCoreForecastProduct(set.productType);

  if (
    input.estimatedFactors > MAX_ESTIMATED_FACTORS_FOR_FORECAST &&
    !allowSparseForecast
  ) {
    return buildBlockedForecast(
      input,
      "insufficient_data",
      "Insufficient data to forecast"
    );
  }

  const prediction1yr = runModel(models.oneYear, input.values);
  const prediction3yr = runModel(models.threeYear, input.values);
  const useDirectFiveYearModel = canUseFiveYearModel(models.fiveYear);
  const prediction5yr = useDirectFiveYearModel
    ? runModel(models.fiveYear, input.values)
    : {
        predictedPrice: deriveFiveYearFallbackPrice(
          input.values.current_price,
          prediction1yr,
          prediction3yr
        ),
        leafContributions: [],
        // When the 5yr model isn't deployable we derive the 5yr price from
        // the 1yr/3yr models. The 5yr model's own historical error is then
        // misleading as a floor — fall back to the 3yr error which is the
        // longest horizon we actually trained.
        spreadPercent: Math.max(
          prediction1yr.spreadPercent,
          prediction3yr.spreadPercent,
          models.threeYear.historicalErrorPercent ?? 0
        ),
      };
  let adjustedPredictions = applySparseLaunchGuardrails(input, {
    oneYearPrice: Math.max(prediction1yr.predictedPrice, 0),
    threeYearPrice: Math.max(prediction3yr.predictedPrice, 0),
    fiveYearPrice: Math.max(prediction5yr.predictedPrice, 0),
    spreadPercent: prediction5yr.spreadPercent,
  });

  const currentPrice = Math.max(set.currentPrice, 0);
  const maxAllowedProjectedValue =
    currentPrice > 0
      ? round(currentPrice * (1 + MAX_FORECAST_ROI_PERCENT / 100), 2)
      : adjustedPredictions.fiveYearPrice;
  const wasRoiCapped =
    currentPrice > 0 && adjustedPredictions.fiveYearPrice > maxAllowedProjectedValue;

  if (wasRoiCapped) {
    adjustedPredictions = {
      ...adjustedPredictions,
      oneYearPrice: Math.min(adjustedPredictions.oneYearPrice, maxAllowedProjectedValue),
      threeYearPrice: Math.min(adjustedPredictions.threeYearPrice, maxAllowedProjectedValue),
      fiveYearPrice: maxAllowedProjectedValue,
      spreadPercent: Math.max(adjustedPredictions.spreadPercent, 45),
    };
  }

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
  const fallbackHistoricalError = useDirectFiveYearModel
    ? models.fiveYear.historicalErrorPercent ?? 0
    : models.threeYear.historicalErrorPercent ?? 0;
  const calibratedSpreadPercent = Math.max(
    adjustedPredictions.spreadPercent,
    fallbackHistoricalError
  );
  // Confidence is the spread-derived band, but downgraded when the inputs
  // are weak. We *cap* (not floor) at Medium when:
  //   * we had to derive the 5yr prediction from the 1yr/3yr fallback, OR
  //   * the product is in the sparse-data forecast lane (allowed because
  //     it's a core product type) and exceeds the estimated-factor budget,
  //     OR
  //   * the projected ROI hit the global cap (so we know our confidence in
  //     the magnitude is limited).
  // This lets well-behaved products earn Medium, and lets High emerge once
  // we approve a five-year model — instead of forcing every dynamic product
  // to "Low" regardless of signal quality.
  const baseConfidence = resolveConfidence(calibratedSpreadPercent);
  const capAtMedium = (value: Confidence): Confidence =>
    value === "High" ? "Medium" : value;
  let confidence: Confidence = baseConfidence;
  if (!useDirectFiveYearModel) confidence = capAtMedium(confidence);
  if (
    allowSparseForecast &&
    input.estimatedFactors > MAX_ESTIMATED_FACTORS_FOR_FORECAST
  ) {
    confidence = capAtMedium(confidence);
  }
  if (wasRoiCapped) confidence = capAtMedium(confidence);
  const confidenceBonus =
    confidence === "High" ? 5 : confidence === "Medium" ? 2 : 0;
  const rawScore = clamp(Math.round(50 + benchmarkDelta * 0.55 + confidenceBonus), 1, 99);
  const uncappedCompositeScore =
    signal === "Buy"
      ? Math.max(rawScore, 60)
      : signal === "Hold"
        ? Math.min(59, Math.max(rawScore, 40))
        : Math.min(rawScore, 39);
  const compositeScore = applyConfidenceScoreCap(uncappedCompositeScore, confidence);

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
    estimatedFactors: input.estimatedFactors,
    predictionSpreadPercent: calibratedSpreadPercent,
    horizonPredictions: {
      oneYear: Math.max(Math.round(adjustedPredictions.oneYearPrice), 0),
      threeYear: Math.max(Math.round(adjustedPredictions.threeYearPrice), 0),
      fiveYear: projectedValue,
    },
    status: "ready",
    statusMessage: null,
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
  const features = Object.fromEntries(
    Object.entries(input.values).map(([feature, value]) => [
      feature,
      Number.isFinite(value) ? value : null,
    ])
  ) as Record<FeatureKey, number | null>;

  return {
    features,
    estimatedFactors: input.estimatedFactors,
  };
}
