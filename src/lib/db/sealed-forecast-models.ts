import "server-only";

import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  fallbackForecastModelBundle,
  type ForecastModelBundle,
  type ModelArtifact,
} from "@/lib/domain/sealed-forecast-ml";
import { getDynamo, getTableName } from "./dynamo";

const MODEL_PK = "SEALED_MODEL#sealed-forecast";
const CACHE_TTL_MS = 5 * 60 * 1000;
const HORIZONS = {
  oneYear: "1yr",
  threeYear: "3yr",
  fiveYear: "5yr",
} as const;

interface StoredModelMeta {
  chunkCount?: number;
  updatedAt?: string;
}

let modelCache:
  | {
      bundle: ForecastModelBundle;
      expiresAt: number;
    }
  | null = null;

function metaKey(horizon: string): string {
  return `MODEL#${horizon}#META`;
}

function chunkPrefix(horizon: string): string {
  return `MODEL#${horizon}#CHUNK#`;
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
      Key: { pk: MODEL_PK, sk: metaKey(horizon) },
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
          ":pk": MODEL_PK,
          ":prefix": chunkPrefix(horizon),
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

export async function getSealedForecastModels(): Promise<ForecastModelBundle> {
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
