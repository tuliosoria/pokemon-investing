export interface OwnedDataRecordKey {
  pk: string;
  sk: string;
}

export type PublishedModelHorizon = "1yr" | "3yr" | "5yr";

export const OWNED_RECORD_LATEST_SK = "LATEST";
export const SEALED_PRODUCT_META_SK = "META";
export const SEALED_PRICE_SNAPSHOT_SK_PREFIX = "PRICE#";
export const TREND_SNAPSHOT_SK_PREFIX = "SNAPSHOT#";
export const SEALED_FORECAST_MODEL_PK = "SEALED_MODEL#sealed-forecast";
export const SEALED_FORECAST_MODEL_SUMMARY_SK = "MODEL#SUMMARY";

function trimKeyPart(value: string): string {
  return value.trim();
}

export function normalizeTrendKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildTrendPartitionKey(keyword: string): string {
  return `TREND#${normalizeTrendKeyword(keyword)}`;
}

export function buildTrendLatestKey(keyword: string): OwnedDataRecordKey {
  return {
    pk: buildTrendPartitionKey(keyword),
    sk: OWNED_RECORD_LATEST_SK,
  };
}

export function buildTrendSnapshotSortKey(snapshotDate: string): string {
  return `${TREND_SNAPSHOT_SK_PREFIX}${trimKeyPart(snapshotDate).slice(0, 10)}`;
}

export function buildTrendSnapshotKey(
  keyword: string,
  snapshotDate: string
): OwnedDataRecordKey {
  return {
    pk: buildTrendPartitionKey(keyword),
    sk: buildTrendSnapshotSortKey(snapshotDate),
  };
}

export function buildSealedProductPartitionKey(pokedataId: string): string {
  return `PRODUCT#${trimKeyPart(pokedataId)}`;
}

export function buildSealedProductMetaKey(pokedataId: string): OwnedDataRecordKey {
  return {
    pk: buildSealedProductPartitionKey(pokedataId),
    sk: SEALED_PRODUCT_META_SK,
  };
}

export function buildSealedPriceSnapshotSortKey(snapshotDate: string): string {
  return `${SEALED_PRICE_SNAPSHOT_SK_PREFIX}${trimKeyPart(snapshotDate)}`;
}

export function buildSealedPriceSnapshotKey(
  pokedataId: string,
  snapshotDate: string
): OwnedDataRecordKey {
  return {
    pk: buildSealedProductPartitionKey(pokedataId),
    sk: buildSealedPriceSnapshotSortKey(snapshotDate),
  };
}

export function buildSealedTrainingPartitionKey(setId: string): string {
  return `SEALED_TRAINING#${trimKeyPart(setId)}`;
}

export function buildSealedTrainingSnapshotKey(
  setId: string,
  snapshotMonth: string
): OwnedDataRecordKey {
  return {
    pk: buildSealedTrainingPartitionKey(setId),
    sk: `${TREND_SNAPSHOT_SK_PREFIX}${trimKeyPart(snapshotMonth).slice(0, 7)}`,
  };
}

export function buildSealedForecastLookupPartitionKey(setId: string): string {
  return `SEALED_FORECAST#${trimKeyPart(setId)}`;
}

export function buildSealedForecastLookupSortKey(
  createdAt: string,
  index: number
): string {
  return `LOOKUP#${trimKeyPart(createdAt)}#${index}`;
}

export function buildSealedForecastLookupKey(
  setId: string,
  createdAt: string,
  index: number
): OwnedDataRecordKey {
  return {
    pk: buildSealedForecastLookupPartitionKey(setId),
    sk: buildSealedForecastLookupSortKey(createdAt, index),
  };
}

export function buildSealedForecastModelMetaKey(
  horizon: PublishedModelHorizon
): OwnedDataRecordKey {
  return {
    pk: SEALED_FORECAST_MODEL_PK,
    sk: `MODEL#${horizon}#META`,
  };
}

export function buildSealedForecastModelChunkPrefix(
  horizon: PublishedModelHorizon
): string {
  return `MODEL#${horizon}#CHUNK#`;
}

export const OWNED_DYNAMO_KEY_PATTERNS = {
  trendLatest: {
    pk: "TREND#<normalized-keyword>",
    sk: OWNED_RECORD_LATEST_SK,
  },
  trendSnapshot: {
    pk: "TREND#<normalized-keyword>",
    sk: `${TREND_SNAPSHOT_SK_PREFIX}YYYY-MM-DD`,
  },
  sealedProductMeta: {
    pk: "PRODUCT#<pokedataId>",
    sk: SEALED_PRODUCT_META_SK,
  },
  sealedPriceSnapshot: {
    pk: "PRODUCT#<pokedataId>",
    sk: `${SEALED_PRICE_SNAPSHOT_SK_PREFIX}YYYY-MM-DD`,
  },
  sealedTrainingSnapshot: {
    pk: "SEALED_TRAINING#<setId>",
    sk: `${TREND_SNAPSHOT_SK_PREFIX}YYYY-MM`,
  },
  sealedForecastLookup: {
    pk: "SEALED_FORECAST#<setId>",
    sk: "LOOKUP#<capturedAtIso>#<sequence>",
  },
  sealedForecastModelSummary: {
    pk: SEALED_FORECAST_MODEL_PK,
    sk: SEALED_FORECAST_MODEL_SUMMARY_SK,
  },
  sealedForecastModelMeta: {
    pk: SEALED_FORECAST_MODEL_PK,
    sk: "MODEL#<horizon>#META",
  },
  sealedForecastModelChunk: {
    pk: SEALED_FORECAST_MODEL_PK,
    sk: "MODEL#<horizon>#CHUNK#<chunkIndex>",
  },
} as const;
