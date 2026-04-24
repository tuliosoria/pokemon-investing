import "server-only";

import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import bundledTrainingSummary from "@/lib/data/sealed-ml/training-summary.json";
import {
  fallbackForecastModelBundle,
  type ForecastModelBundle,
  type ModelArtifact,
} from "@/lib/domain/sealed-forecast-ml";
import {
  SEALED_FORECAST_MODEL_PK,
  SEALED_FORECAST_MODEL_SUMMARY_SK,
  buildSealedForecastModelChunkPrefix,
  buildSealedForecastModelMetaKey,
  type PublishedModelHorizon,
} from "@/lib/owned-data/dynamo-keys";
import { getDynamo, getTableName } from "./dynamo";

const CACHE_TTL_MS = 5 * 60 * 1000;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const HORIZONS = {
  oneYear: "1yr",
  threeYear: "3yr",
  fiveYear: "5yr",
} as const;
const PUBLISHED_HORIZONS = ["1yr", "3yr", "5yr"] as const;

type PublishedHorizon = (typeof PUBLISHED_HORIZONS)[number];
type ModelSourcePreference = "auto" | "bundled";

type TrainingSummaryShape = {
  generatedAt?: string;
  deploymentApproved?: boolean;
  targetMode?: string;
  validationStrategy?: string;
  lookupRows?: number;
  publishedAt?: string;
  publishedToDynamo?: boolean;
  publishSkippedReason?: string;
  models?: Partial<
    Record<
      PublishedHorizon,
      {
        trainingRows?: number;
        deploymentApproved?: boolean;
        validationStrategy?: string;
        crossValidation?: {
          strategy?: string;
        };
      }
    >
  >;
};

interface StoredModelMeta {
  chunkCount?: number;
  updatedAt?: string;
  generatedAt?: string;
  trainingRows?: number;
  crossValidation?: {
    strategy?: string;
  };
}

interface StoredModelSummary {
  updatedAt?: string;
  summary?: TrainingSummaryShape;
}

interface HorizonModelStatus {
  available: boolean;
  chunkCount: number;
  updatedAt: string | null;
  generatedAt: string | null;
  trainingRows: number | null;
  validationStrategy: string | null;
}

export interface SealedForecastModelStatus {
  preferredSource: ModelSourcePreference;
  effectiveSource: "bundled" | "dynamodb";
  dynamoConfigured: boolean;
  tableName: string | null;
  awsRegion: string;
  rollbackModeAvailable: boolean;
  fallbackSummary: {
    generatedAt: string | null;
    deploymentApproved: boolean | null;
    targetMode: string | null;
    validationStrategy: string | null;
  };
  publishedSummary: {
    updatedAt: string | null;
    generatedAt: string | null;
    lookupRows: number | null;
    deploymentApproved: boolean | null;
    publishedAt: string | null;
    publishedToDynamo: boolean | null;
    publishSkippedReason: string | null;
  } | null;
  horizons: Record<
    PublishedHorizon,
    {
      bundled: HorizonModelStatus;
      published: HorizonModelStatus | null;
    }
  >;
}

let modelCache:
  | {
      bundle: ForecastModelBundle;
      expiresAt: number;
    }
  | null = null;

function getModelSourcePreference(): ModelSourcePreference {
  return process.env.SEALED_ML_MODEL_SOURCE?.trim().toLowerCase() === "bundled"
    ? "bundled"
    : "auto";
}

function getBundledTrainingSummary(): TrainingSummaryShape {
  return bundledTrainingSummary as TrainingSummaryShape;
}

function getBundledHorizonStatus(horizon: PublishedHorizon): HorizonModelStatus {
  const summary = getBundledTrainingSummary();
  const model = summary.models?.[horizon];

  return {
    available: true,
    chunkCount: 0,
    updatedAt: summary.generatedAt ?? null,
    generatedAt: summary.generatedAt ?? null,
    trainingRows: model?.trainingRows ?? null,
    validationStrategy:
      model?.validationStrategy ?? model?.crossValidation?.strategy ?? summary.validationStrategy ?? null,
  };
}

async function loadStoredModelMeta(horizon: PublishedHorizon): Promise<StoredModelMeta | null> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return null;
  }

  const result = await dynamo.send(
      new GetCommand({
        TableName: table,
        Key: buildSealedForecastModelMetaKey(horizon),
      })
    );

  return (result.Item as StoredModelMeta | undefined) ?? null;
}

async function loadStoredModelSummary(): Promise<StoredModelSummary | null> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return null;
  }

  const result = await dynamo.send(
      new GetCommand({
        TableName: table,
        Key: {
          pk: SEALED_FORECAST_MODEL_PK,
          sk: SEALED_FORECAST_MODEL_SUMMARY_SK,
        },
      })
    );

  return (result.Item as StoredModelSummary | undefined) ?? null;
}

function buildPublishedHorizonStatus(
  horizon: PublishedHorizon,
  meta: StoredModelMeta | null,
  summary: StoredModelSummary | null
): HorizonModelStatus | null {
  if (!meta?.chunkCount || meta.chunkCount < 1) {
    return null;
  }

  const modelSummary = summary?.summary?.models?.[horizon];

  return {
    available: true,
    chunkCount: meta.chunkCount,
    updatedAt: meta.updatedAt ?? null,
    generatedAt: meta.generatedAt ?? null,
    trainingRows: modelSummary?.trainingRows ?? meta.trainingRows ?? null,
    validationStrategy:
      modelSummary?.validationStrategy ??
      modelSummary?.crossValidation?.strategy ??
      meta.crossValidation?.strategy ??
      summary?.summary?.validationStrategy ??
      null,
  };
}

async function loadStoredModel(horizon: string): Promise<ModelArtifact | null> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return null;
  }

  const metaResult = await dynamo.send(
      new GetCommand({
        TableName: table,
        Key: buildSealedForecastModelMetaKey(horizon as PublishedModelHorizon),
      })
    );
  const meta = metaResult.Item as StoredModelMeta | undefined;
  if (!meta?.chunkCount || meta.chunkCount < 1) {
    return null;
  }

  const chunks: Array<{ chunkData?: string; chunkIndex?: number }> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await dynamo.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: {
            ":pk": SEALED_FORECAST_MODEL_PK,
            ":prefix": buildSealedForecastModelChunkPrefix(
              horizon as PublishedModelHorizon
            ),
          },
          ExclusiveStartKey: exclusiveStartKey,
        })
    );

    chunks.push(...((page.Items as Array<{ chunkData?: string; chunkIndex?: number }>) ?? []));
    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  if (chunks.length < meta.chunkCount) {
    return null;
  }

  const payload = chunks
    .sort((left, right) => (left.chunkIndex ?? 0) - (right.chunkIndex ?? 0))
    .slice(0, meta.chunkCount)
    .map((chunk) => chunk.chunkData ?? "")
    .join("");

  if (!payload) {
    return null;
  }

  return JSON.parse(payload) as ModelArtifact;
}

export async function getSealedForecastModelStatus(): Promise<SealedForecastModelStatus> {
  const preferredSource = getModelSourcePreference();
  const tableName = getTableName() ?? null;
  const dynamoConfigured = Boolean(getDynamo() && tableName);
  const fallbackSummary = getBundledTrainingSummary();

  const bundledHorizonStatus = Object.fromEntries(
    PUBLISHED_HORIZONS.map((horizon) => [horizon, getBundledHorizonStatus(horizon)])
  ) as Record<PublishedHorizon, HorizonModelStatus>;

  if (!dynamoConfigured) {
    return {
      preferredSource,
      effectiveSource: "bundled",
      dynamoConfigured,
      tableName,
      awsRegion: AWS_REGION,
      rollbackModeAvailable: true,
      fallbackSummary: {
        generatedAt: fallbackSummary.generatedAt ?? null,
        deploymentApproved: fallbackSummary.deploymentApproved ?? null,
        targetMode: fallbackSummary.targetMode ?? null,
        validationStrategy: fallbackSummary.validationStrategy ?? null,
      },
      publishedSummary: null,
      horizons: Object.fromEntries(
        PUBLISHED_HORIZONS.map((horizon) => [
          horizon,
          {
            bundled: bundledHorizonStatus[horizon],
            published: null,
          },
        ])
      ) as SealedForecastModelStatus["horizons"],
    };
  }

  try {
    const [oneYearMeta, threeYearMeta, fiveYearMeta, publishedSummary] = await Promise.all([
      loadStoredModelMeta("1yr"),
      loadStoredModelMeta("3yr"),
      loadStoredModelMeta("5yr"),
      loadStoredModelSummary(),
    ]);

    const publishedStatuses = {
      "1yr": buildPublishedHorizonStatus("1yr", oneYearMeta, publishedSummary),
      "3yr": buildPublishedHorizonStatus("3yr", threeYearMeta, publishedSummary),
      "5yr": buildPublishedHorizonStatus("5yr", fiveYearMeta, publishedSummary),
    } as const;

    const hasPublishedModels = PUBLISHED_HORIZONS.every(
      (horizon) => publishedStatuses[horizon]?.available
    );

    return {
      preferredSource,
      effectiveSource: preferredSource === "bundled" || !hasPublishedModels ? "bundled" : "dynamodb",
      dynamoConfigured,
      tableName,
      awsRegion: AWS_REGION,
      rollbackModeAvailable: true,
      fallbackSummary: {
        generatedAt: fallbackSummary.generatedAt ?? null,
        deploymentApproved: fallbackSummary.deploymentApproved ?? null,
        targetMode: fallbackSummary.targetMode ?? null,
        validationStrategy: fallbackSummary.validationStrategy ?? null,
      },
      publishedSummary: publishedSummary
        ? {
            updatedAt: publishedSummary.updatedAt ?? null,
            generatedAt: publishedSummary.summary?.generatedAt ?? null,
            lookupRows: publishedSummary.summary?.lookupRows ?? null,
            deploymentApproved: publishedSummary.summary?.deploymentApproved ?? null,
            publishedAt: publishedSummary.summary?.publishedAt ?? null,
            publishedToDynamo: publishedSummary.summary?.publishedToDynamo ?? null,
            publishSkippedReason: publishedSummary.summary?.publishSkippedReason ?? null,
          }
        : null,
      horizons: Object.fromEntries(
        PUBLISHED_HORIZONS.map((horizon) => [
          horizon,
          {
            bundled: bundledHorizonStatus[horizon],
            published: publishedStatuses[horizon],
          },
        ])
      ) as SealedForecastModelStatus["horizons"],
    };
  } catch (error) {
    console.warn("Failed to inspect published sealed ML metadata, reporting bundled status:", error);

    return {
      preferredSource,
      effectiveSource: "bundled",
      dynamoConfigured,
      tableName,
      awsRegion: AWS_REGION,
      rollbackModeAvailable: true,
      fallbackSummary: {
        generatedAt: fallbackSummary.generatedAt ?? null,
        deploymentApproved: fallbackSummary.deploymentApproved ?? null,
        targetMode: fallbackSummary.targetMode ?? null,
        validationStrategy: fallbackSummary.validationStrategy ?? null,
      },
      publishedSummary: null,
      horizons: Object.fromEntries(
        PUBLISHED_HORIZONS.map((horizon) => [
          horizon,
          {
            bundled: bundledHorizonStatus[horizon],
            published: null,
          },
        ])
      ) as SealedForecastModelStatus["horizons"],
    };
  }
}

export async function getSealedForecastModels(): Promise<ForecastModelBundle> {
  if (getModelSourcePreference() === "bundled") {
    return fallbackForecastModelBundle;
  }

  if (modelCache && modelCache.expiresAt > Date.now()) {
    return modelCache.bundle;
  }

  try {
    const [oneYear, threeYear, fiveYear] = await Promise.all([
      loadStoredModel(HORIZONS.oneYear),
      loadStoredModel(HORIZONS.threeYear),
      loadStoredModel(HORIZONS.fiveYear),
    ]);

    const bundle: ForecastModelBundle = {
      oneYear: oneYear ?? fallbackForecastModelBundle.oneYear,
      threeYear: threeYear ?? fallbackForecastModelBundle.threeYear,
      fiveYear: fiveYear ?? fallbackForecastModelBundle.fiveYear,
    };

    modelCache = {
      bundle,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return bundle;
  } catch (error) {
    console.warn("Failed to load sealed ML models from DynamoDB, using bundled fallback:", error);
    return fallbackForecastModelBundle;
  }
}
