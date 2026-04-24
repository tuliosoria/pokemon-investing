import { getTableName } from "@/lib/db/dynamo";
import { OWNED_DYNAMO_KEY_PATTERNS } from "./dynamo-keys";

export type OwnedDataStorageTier =
  | "bundled-json"
  | "dynamodb"
  | "immutable-assets";

export type OwnedDataImmutableDataset =
  | "trend-history"
  | "sealed-price-history"
  | "sealed-forecast-training"
  | "sealed-forecast-models";

export interface OwnedDataAssetReference {
  tier: "immutable-assets";
  dataset: OwnedDataImmutableDataset;
  bucket: string;
  key: string;
  uri: string;
  format: string;
  capturedAt: string;
  version: string;
}

export const OWNED_DATA_ASSET_BUCKET_ENV = "OWNED_DATA_ASSET_BUCKET";
export const OWNED_DATA_ASSET_PREFIX_ENV = "OWNED_DATA_ASSET_PREFIX";
export const DEFAULT_OWNED_DATA_ASSET_PREFIX = "owned-data";
export const OWNED_DATA_STORAGE_VERSION = 1;

type OwnedDataDatasetPlacement = {
  id: string;
  label: string;
  tier: OwnedDataStorageTier;
  canonicalStore: string;
  role: string;
  immutableMirror: OwnedDataImmutableDataset | null;
};

function normalizePrefix(prefix: string | null | undefined): string {
  return (
    (prefix ?? DEFAULT_OWNED_DATA_ASSET_PREFIX)
      .trim()
      .replace(/^\/+|\/+$/g, "") || DEFAULT_OWNED_DATA_ASSET_PREFIX
  );
}

function slugifyScope(scope: string): string {
  return (
    scope
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "global"
  );
}

function normalizeCapturedAt(capturedAt: string): string {
  return capturedAt.trim() || "unknown-captured-at";
}

function dateSegment(capturedAt: string): string {
  const segment = normalizeCapturedAt(capturedAt).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(segment) ? segment : "unknown-date";
}

function extensionForFormat(format: string): string {
  const normalized = format.trim().toLowerCase() || "json";
  return normalized.startsWith(".") ? normalized.slice(1) : normalized;
}

export function getOwnedDataAssetBucketName(): string | null {
  return process.env[OWNED_DATA_ASSET_BUCKET_ENV]?.trim() || null;
}

export function getOwnedDataAssetPrefix(): string {
  return normalizePrefix(process.env[OWNED_DATA_ASSET_PREFIX_ENV]);
}

export function buildOwnedDataAssetKey(input: {
  dataset: OwnedDataImmutableDataset;
  scope: string;
  capturedAt: string;
  format?: string;
  version?: string;
  prefix?: string | null;
}): string {
  const capturedAt = normalizeCapturedAt(input.capturedAt);
  const format = extensionForFormat(input.format ?? "json");
  const version = slugifyScope(input.version ?? capturedAt.replace(/[:.]/g, "-"));
  const prefix = normalizePrefix(input.prefix);

  return [
    prefix,
    input.dataset,
    slugifyScope(input.scope),
    dateSegment(capturedAt),
    `${capturedAt.replace(/:/g, "-")}--${version}.${format}`,
  ].join("/");
}

export function buildOwnedDataAssetReference(input: {
  dataset: OwnedDataImmutableDataset;
  scope: string;
  capturedAt: string;
  format?: string;
  version?: string;
  prefix?: string | null;
  bucket?: string | null;
}): OwnedDataAssetReference | null {
  const bucket = input.bucket?.trim() || getOwnedDataAssetBucketName();
  if (!bucket) {
    return null;
  }

  const key = buildOwnedDataAssetKey(input);

  return {
    tier: "immutable-assets",
    dataset: input.dataset,
    bucket,
    key,
    uri: `s3://${bucket}/${key}`,
    format: extensionForFormat(input.format ?? "json"),
    capturedAt: normalizeCapturedAt(input.capturedAt),
    version: slugifyScope(input.version ?? input.capturedAt.replace(/[:.]/g, "-")),
  };
}

export const OWNED_DATASET_PLACEMENTS: readonly OwnedDataDatasetPlacement[] = [
  {
    id: "bundled-sealed-seeds",
    label: "Bundled sealed catalog + fallback JSON",
    tier: "bundled-json",
    canonicalStore: "src/lib/data/sealed-ml/*.json",
    role: "Small repo-shipped rollback/seed datasets that must deploy with the app.",
    immutableMirror: null,
  },
  {
    id: "trend-snapshots",
    label: "Owned trend snapshots",
    tier: "dynamodb",
    canonicalStore: `pk=${OWNED_DYNAMO_KEY_PATTERNS.trendLatest.pk}, sk=${OWNED_DYNAMO_KEY_PATTERNS.trendLatest.sk} | ${OWNED_DYNAMO_KEY_PATTERNS.trendSnapshot.sk}`,
    role: "Queryable latest trend state plus bounded trend history for runtime reads.",
    immutableMirror: "trend-history",
  },
  {
    id: "sealed-product-meta",
    label: "Owned sealed product metadata",
    tier: "dynamodb",
    canonicalStore: `pk=${OWNED_DYNAMO_KEY_PATTERNS.sealedProductMeta.pk}, sk=${OWNED_DYNAMO_KEY_PATTERNS.sealedProductMeta.sk}`,
    role: "Canonical product shell for owned price history and sync metadata.",
    immutableMirror: null,
  },
  {
    id: "sealed-price-snapshots",
    label: "Owned sealed price snapshots",
    tier: "dynamodb",
    canonicalStore: `pk=${OWNED_DYNAMO_KEY_PATTERNS.sealedPriceSnapshot.pk}, sk=${OWNED_DYNAMO_KEY_PATTERNS.sealedPriceSnapshot.sk}`,
    role: "Mutable/queryable current and recent price history for app APIs.",
    immutableMirror: "sealed-price-history",
  },
  {
    id: "sealed-training-snapshots",
    label: "Owned normalized training snapshots",
    tier: "dynamodb",
    canonicalStore: `pk=${OWNED_DYNAMO_KEY_PATTERNS.sealedTrainingSnapshot.pk}, sk=${OWNED_DYNAMO_KEY_PATTERNS.sealedTrainingSnapshot.sk}`,
    role: "Retrainer-ready monthly facts that remain queryable before archival.",
    immutableMirror: "sealed-forecast-training",
  },
  {
    id: "sealed-forecast-lookups",
    label: "Owned forecast lookup captures",
    tier: "dynamodb",
    canonicalStore: `pk=${OWNED_DYNAMO_KEY_PATTERNS.sealedForecastLookup.pk}, sk=${OWNED_DYNAMO_KEY_PATTERNS.sealedForecastLookup.sk}`,
    role: "Lookup captures that later mature into training outcomes.",
    immutableMirror: "sealed-forecast-training",
  },
  {
    id: "sealed-forecast-models",
    label: "Published forecast models",
    tier: "dynamodb",
    canonicalStore: `pk=${OWNED_DYNAMO_KEY_PATTERNS.sealedForecastModelSummary.pk}, sk=${OWNED_DYNAMO_KEY_PATTERNS.sealedForecastModelSummary.sk} and MODEL#<horizon>#META/CHUNK#...`,
    role: "Runtime-serving published model copy with rollback to bundled JSON.",
    immutableMirror: "sealed-forecast-models",
  },
  {
    id: "trend-history-assets",
    label: "Immutable trend history exports",
    tier: "immutable-assets",
    canonicalStore: `${DEFAULT_OWNED_DATA_ASSET_PREFIX}/trend-history/<scope>/<yyyy-mm-dd>/<capturedAt>--<version>.json`,
    role: "Append-only full-history/backfill exports from Dynamo or future sync jobs.",
    immutableMirror: null,
  },
  {
    id: "sealed-price-history-assets",
    label: "Immutable sealed price history exports",
    tier: "immutable-assets",
    canonicalStore: `${DEFAULT_OWNED_DATA_ASSET_PREFIX}/sealed-price-history/<scope>/<yyyy-mm-dd>/<capturedAt>--<version>.json`,
    role: "Append-only history artifacts for audits, replay, and large backfills.",
    immutableMirror: null,
  },
  {
    id: "sealed-forecast-training-assets",
    label: "Immutable forecast training artifacts",
    tier: "immutable-assets",
    canonicalStore: `${DEFAULT_OWNED_DATA_ASSET_PREFIX}/sealed-forecast-training/<scope>/<yyyy-mm-dd>/<capturedAt>--<version>.json`,
    role: "Append-only raw/exported training inputs and matured lookup captures.",
    immutableMirror: null,
  },
  {
    id: "sealed-forecast-model-assets",
    label: "Immutable forecast model archives",
    tier: "immutable-assets",
    canonicalStore: `${DEFAULT_OWNED_DATA_ASSET_PREFIX}/sealed-forecast-models/<scope>/<yyyy-mm-dd>/<capturedAt>--<version>.json`,
    role: "Published-model archive and rollback source outside the app bundle.",
    immutableMirror: null,
  },
] as const;

export function getOwnedDataStorageReport() {
  const tableName = getTableName() ?? null;
  const awsRegion = process.env.AWS_REGION || "us-east-1";
  const bucketName = getOwnedDataAssetBucketName();
  const assetPrefix = getOwnedDataAssetPrefix();
  const exampleCapturedAt = "2026-01-15T05:00:00.000Z";

  return {
    version: OWNED_DATA_STORAGE_VERSION,
    tiers: {
      bundledJson: {
        configured: true,
        root: "src/lib/data",
        contract: "ship small seeds, fallbacks, and rollback JSON with each deploy",
      },
      dynamodb: {
        configured: Boolean(tableName),
        tableName,
        awsRegion,
        contract: "store mutable/queryable owned latest state plus bounded history",
      },
      immutableAssets: {
        configured: Boolean(bucketName),
        bucketName,
        prefix: assetPrefix,
        contract: "store append-only asset/history exports and model archives",
        examples: {
          trendHistoryKey: buildOwnedDataAssetKey({
            dataset: "trend-history",
            scope: "pokemon evolving skies",
            capturedAt: exampleCapturedAt,
            prefix: assetPrefix,
          }),
          sealedPriceHistoryKey: buildOwnedDataAssetKey({
            dataset: "sealed-price-history",
            scope: "pokedata-1234",
            capturedAt: exampleCapturedAt,
            prefix: assetPrefix,
          }),
          sealedForecastModelKey: buildOwnedDataAssetKey({
            dataset: "sealed-forecast-models",
            scope: "sealed-forecast",
            capturedAt: exampleCapturedAt,
            prefix: assetPrefix,
          }),
        },
      },
    },
    datasets: OWNED_DATASET_PLACEMENTS,
    immutableReferenceExample: buildOwnedDataAssetReference({
      dataset: "sealed-price-history",
      scope: "pokedata-1234",
      capturedAt: exampleCapturedAt,
      prefix: assetPrefix,
      bucket: bucketName,
    }),
  };
}
