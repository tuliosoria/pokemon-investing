import "server-only";

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTableName } from "./dynamo";

export interface StoredSealedProductMeta {
  name?: string;
  productType?: string;
  releaseDate?: string | null;
  imgUrl?: string | null;
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

export interface StoreSealedPriceSnapshotInput {
  pokedataId: string;
  name?: string;
  releaseDate?: string | null;
  imageUrl?: string | null;
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

  const response = await dynamo.send(
    new GetCommand({
      TableName: table,
      Key: { pk: `PRODUCT#${pokedataId}`, sk: "META" },
    })
  );

  return (response.Item as StoredSealedProductMeta | undefined) ?? null;
}

export async function getLatestStoredSealedPriceSnapshot(
  pokedataId: string
): Promise<StoredSealedPriceSnapshot | null> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return null;
  }

  const response = await dynamo.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `PRODUCT#${pokedataId}`,
        ":prefix": "PRICE#",
      },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  const [item] = (response.Items as StoredSealedPriceSnapshot[] | undefined) ?? [];
  return item ?? null;
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

  await dynamo.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: `PRODUCT#${input.pokedataId}`,
        sk: `PRICE#${input.snapshotDate}`,
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

  const updateParts = [
    "#name = if_not_exists(#name, :name)",
    "releaseDate = if_not_exists(releaseDate, :releaseDate)",
    "imgUrl = if_not_exists(imgUrl, :imgUrl)",
  ];
  const expressionValues: Record<string, unknown> = {
    ":name": input.name ?? "",
    ":releaseDate": input.releaseDate ?? null,
    ":imgUrl": input.imageUrl ?? null,
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

  await dynamo.send(
    new UpdateCommand({
      TableName: table,
      Key: { pk: `PRODUCT#${input.pokedataId}`, sk: "META" },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeNames: {
        "#name": "name",
      },
      ExpressionAttributeValues: expressionValues,
    })
  );
}
