import "server-only";

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SEALED_PRICE_SNAPSHOT_SK_PREFIX,
  buildSealedPriceSnapshotKey,
  buildSealedProductMetaKey,
  buildSealedProductPartitionKey,
} from "@/lib/owned-data/dynamo-keys";
import type { ImageMirrorProvider } from "@/lib/domain/image-assets";
import { getDynamo, getTableName } from "./dynamo";

export interface StoredSealedProductMeta {
  catalogId?: string;
  catalogKey?: string;
  catalogDisplayName?: string;
  name?: string;
  productType?: string;
  releaseDate?: string | null;
  imgUrl?: string | null;
  ownedImagePath?: string | null;
  imageMirrorSourceUrl?: string | null;
  imageMirrorSourceProvider?: ImageMirrorProvider | null;
  imageMirroredAt?: string | null;
  priceChartingId?: string | null;
  priceChartingProductName?: string | null;
  priceChartingConsoleName?: string | null;
  priceChartingReleaseDate?: string | null;
  priceChartingLastSyncedAt?: string | null;
}

export interface StoredSealedPriceSnapshot {
  tcgplayerPrice?: number | null;
  ebayPrice?: number | null;
  pokedataPrice?: number | null;
  priceChartingPrice?: number | null;
  bestPrice?: number | null;
  primaryProvider?: "pricecharting" | "pokedata";
  snapshotDate?: string | null;
  updatedAt?: string | null;
}

export interface ListStoredSealedPriceSnapshotsOptions {
  limit?: number;
  ascending?: boolean;
}

export interface StoreSealedPriceSnapshotInput {
  pokedataId: string;
  name?: string;
  releaseDate?: string | null;
  imageUrl?: string | null;
  ownedImagePath?: string | null;
  imageMirrorSourceUrl?: string | null;
  imageMirrorSourceProvider?: ImageMirrorProvider | null;
  imageMirroredAt?: string | null;
  snapshotDate: string;
  tcgplayerPrice?: number | null;
  ebayPrice?: number | null;
  pokedataPrice?: number | null;
  priceChartingPrice?: number | null;
  bestPrice?: number | null;
  primaryProvider: "pricecharting" | "pokedata";
  priceChartingId?: string | null;
  priceChartingProductName?: string | null;
  priceChartingConsoleName?: string | null;
  priceChartingReleaseDate?: string | null;
}

export async function getStoredSealedProductMeta(
  pokedataId: string
): Promise<StoredSealedProductMeta | null> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return null;
  }

  try {
    const response = await dynamo.send(
      new GetCommand({
        TableName: table,
        Key: buildSealedProductMetaKey(pokedataId),
      })
    );

    return (response.Item as StoredSealedProductMeta | undefined) ?? null;
  } catch (error) {
    console.warn("DynamoDB sealed product meta lookup failed:", error);
    return null;
  }
}

export async function getLatestStoredSealedPriceSnapshot(
  pokedataId: string
): Promise<StoredSealedPriceSnapshot | null> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return null;
  }

  try {
    const response = await dynamo.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": buildSealedProductPartitionKey(pokedataId),
          ":prefix": SEALED_PRICE_SNAPSHOT_SK_PREFIX,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    const [item] = (response.Items as StoredSealedPriceSnapshot[] | undefined) ?? [];
    return item ?? null;
  } catch (error) {
    console.warn("DynamoDB sealed price snapshot lookup failed:", error);
    return null;
  }
}

export async function listStoredSealedPriceSnapshots(
  pokedataId: string,
  options?: ListStoredSealedPriceSnapshotsOptions
): Promise<StoredSealedPriceSnapshot[]> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return [];
  }

  try {
    const response = await dynamo.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": buildSealedProductPartitionKey(pokedataId),
          ":prefix": SEALED_PRICE_SNAPSHOT_SK_PREFIX,
        },
        ScanIndexForward: options?.ascending ?? true,
        Limit: options?.limit,
      })
    );

    return (response.Items as StoredSealedPriceSnapshot[] | undefined) ?? [];
  } catch (error) {
    console.warn("DynamoDB sealed price history lookup failed:", error);
    return [];
  }
}

export async function storeSealedPriceSnapshot(
  input: StoreSealedPriceSnapshotInput
): Promise<void> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return;
  }

  const updatedAt = new Date().toISOString();

  try {
    await dynamo.send(
      new PutCommand({
        TableName: table,
        Item: {
          ...buildSealedPriceSnapshotKey(input.pokedataId, input.snapshotDate),
          tcgplayerPrice: input.tcgplayerPrice ?? null,
          ebayPrice: input.ebayPrice ?? null,
          pokedataPrice: input.pokedataPrice ?? null,
          priceChartingPrice: input.priceChartingPrice ?? null,
          bestPrice: input.bestPrice ?? null,
          primaryProvider: input.primaryProvider,
          snapshotDate: input.snapshotDate,
          updatedAt,
        },
      })
    );
  } catch (error) {
    console.warn("DynamoDB sealed price snapshot write failed:", error);
  }

  const updateParts = [
    "#name = if_not_exists(#name, :name)",
    "releaseDate = if_not_exists(releaseDate, :releaseDate)",
    "imgUrl = if_not_exists(imgUrl, :imgUrl)",
    "ownedImagePath = if_not_exists(ownedImagePath, :ownedImagePath)",
    "imageMirrorSourceUrl = if_not_exists(imageMirrorSourceUrl, :imageMirrorSourceUrl)",
    "imageMirrorSourceProvider = if_not_exists(imageMirrorSourceProvider, :imageMirrorSourceProvider)",
    "imageMirroredAt = if_not_exists(imageMirroredAt, :imageMirroredAt)",
  ];
  const expressionValues: Record<string, unknown> = {
    ":name": input.name ?? "",
    ":releaseDate": input.releaseDate ?? null,
    ":imgUrl": input.imageUrl ?? null,
    ":ownedImagePath": input.ownedImagePath ?? null,
    ":imageMirrorSourceUrl": input.imageMirrorSourceUrl ?? null,
    ":imageMirrorSourceProvider": input.imageMirrorSourceProvider ?? null,
    ":imageMirroredAt": input.imageMirroredAt ?? null,
  };

  if (input.priceChartingId) {
    updateParts.push(
      "priceChartingId = :priceChartingId",
      "priceChartingProductName = :priceChartingProductName",
      "priceChartingConsoleName = :priceChartingConsoleName",
      "priceChartingReleaseDate = :priceChartingReleaseDate",
      "priceChartingLastSyncedAt = :updatedAt"
    );
    expressionValues[":priceChartingId"] = input.priceChartingId;
    expressionValues[":priceChartingProductName"] =
      input.priceChartingProductName ?? null;
    expressionValues[":priceChartingConsoleName"] =
      input.priceChartingConsoleName ?? null;
    expressionValues[":priceChartingReleaseDate"] =
      input.priceChartingReleaseDate ?? null;
    expressionValues[":updatedAt"] = updatedAt;
  }

  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: table,
        Key: buildSealedProductMetaKey(input.pokedataId),
        UpdateExpression: `SET ${updateParts.join(", ")}`,
        ExpressionAttributeNames: {
          "#name": "name",
        },
        ExpressionAttributeValues: expressionValues,
      })
    );
  } catch (error) {
    console.warn("DynamoDB sealed product meta update failed:", error);
  }
}
