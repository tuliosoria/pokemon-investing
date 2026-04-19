/**
 * Permanent card data cache in DynamoDB.
 *
 * Separates static card metadata (never expires) from dynamic pricing
 * data (refreshed on a configurable interval).
 *
 * DynamoDB key patterns:
 *   CARD#<id> / META         — static card fields (no TTL)
 *   CARD#<id> / TCG_PRICES   — latest TCG API prices + timestamp
 *   CARD#<id> / GRADE_DATA   — latest PokeData graded prices + population
 */

import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTableName } from "./dynamo";

// Current schema version — bump to force re-fetch of static data
export const STATIC_DATA_VERSION = 1;

// Default max age before prices are considered stale
export const PRICE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardMeta {
  name: string;
  set: string;
  setId: string;
  number: string;
  rarity: string | null;
  imageSmall: string;
  imageLarge: string;
  tcgplayerUrl: string | null;
  pokedataId: string | null;
  staticDataVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CardTcgPrices {
  prices: Record<string, {
    low: number | null;
    mid: number | null;
    high: number | null;
    market: number | null;
    directLow: number | null;
  }>;
  lastPriceFetched: string; // ISO timestamp
}

export interface CardGradeData {
  pokedataId: string;
  rawPrice: number | null;
  tcgplayerPrice: number | null;
  ebayRawPrice: number | null;
  gradedPrices: Record<string, number>;
  population: Record<string, number>;
  psa10Probability: number | null;
  lastGradeFetched: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClient() {
  const client = getDynamo();
  const table = getTableName();
  if (!client || !table) return null;
  return { client, table };
}

export function shouldRefreshPrices(
  lastFetched: string | null | undefined,
  maxAgeMs = PRICE_MAX_AGE_MS
): boolean {
  if (!lastFetched) return true;
  const age = Date.now() - new Date(lastFetched).getTime();
  return age > maxAgeMs;
}

// ---------------------------------------------------------------------------
// Card META (permanent, no TTL)
// ---------------------------------------------------------------------------

export async function getCardMeta(cardId: string): Promise<CardMeta | null> {
  const ctx = getClient();
  if (!ctx) return null;

  try {
    const res = await ctx.client.send(
      new GetCommand({
        TableName: ctx.table,
        Key: { pk: `CARD#${cardId}`, sk: "META" },
      })
    );
    if (!res.Item) return null;

    // Check schema version — treat outdated as cache miss
    if (res.Item.staticDataVersion !== STATIC_DATA_VERSION) return null;

    return res.Item as unknown as CardMeta;
  } catch (err) {
    console.warn("card-cache getCardMeta error:", err);
    return null;
  }
}

export async function putCardMeta(
  cardId: string,
  data: Omit<CardMeta, "createdAt" | "updatedAt" | "staticDataVersion">
): Promise<void> {
  const ctx = getClient();
  if (!ctx) return;

  const now = new Date().toISOString();

  try {
    // Upsert: only update createdAt if item is new
    await ctx.client.send(
      new UpdateCommand({
        TableName: ctx.table,
        Key: { pk: `CARD#${cardId}`, sk: "META" },
        UpdateExpression: `
          SET #name = :name, #set = :set, setId = :setId,
              #num = :num, rarity = :rarity,
              imageSmall = :imageSmall, imageLarge = :imageLarge,
              tcgplayerUrl = :tcgplayerUrl,
              staticDataVersion = :ver,
              updatedAt = :now,
              createdAt = if_not_exists(createdAt, :now)
        `,
        ExpressionAttributeNames: {
          "#name": "name",
          "#set": "set",
          "#num": "number",
        },
        ExpressionAttributeValues: {
          ":name": data.name,
          ":set": data.set,
          ":setId": data.setId,
          ":num": data.number,
          ":rarity": data.rarity,
          ":imageSmall": data.imageSmall,
          ":imageLarge": data.imageLarge,
          ":tcgplayerUrl": data.tcgplayerUrl,
          ":ver": STATIC_DATA_VERSION,
          ":now": now,
        },
      })
    );
  } catch (err) {
    console.warn("card-cache putCardMeta error:", err);
  }
}

/**
 * Set the PokeData ID on an existing META record (partial update).
 */
export async function setPokedataId(
  cardId: string,
  pokedataId: string
): Promise<void> {
  const ctx = getClient();
  if (!ctx) return;

  try {
    await ctx.client.send(
      new UpdateCommand({
        TableName: ctx.table,
        Key: { pk: `CARD#${cardId}`, sk: "META" },
        UpdateExpression:
          "SET pokedataId = :pid, updatedAt = :now",
        ExpressionAttributeValues: {
          ":pid": pokedataId,
          ":now": new Date().toISOString(),
        },
      })
    );
  } catch (err) {
    console.warn("card-cache setPokedataId error:", err);
  }
}

// ---------------------------------------------------------------------------
// TCG Prices (refreshed on demand, 24h TTL for cleanup)
// ---------------------------------------------------------------------------

export async function getCardTcgPrices(
  cardId: string
): Promise<CardTcgPrices | null> {
  const ctx = getClient();
  if (!ctx) return null;

  try {
    const res = await ctx.client.send(
      new GetCommand({
        TableName: ctx.table,
        Key: { pk: `CARD#${cardId}`, sk: "TCG_PRICES" },
      })
    );
    if (!res.Item) return null;
    return {
      prices: JSON.parse(res.Item.data as string),
      lastPriceFetched: res.Item.lastPriceFetched as string,
    };
  } catch (err) {
    console.warn("card-cache getCardTcgPrices error:", err);
    return null;
  }
}

export async function putCardTcgPrices(
  cardId: string,
  prices: Record<string, unknown>
): Promise<void> {
  const ctx = getClient();
  if (!ctx) return;

  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24h cleanup

  try {
    await ctx.client.send(
      new PutCommand({
        TableName: ctx.table,
        Item: {
          pk: `CARD#${cardId}`,
          sk: "TCG_PRICES",
          data: JSON.stringify(prices),
          lastPriceFetched: now,
          ttl,
        },
      })
    );
  } catch (err) {
    console.warn("card-cache putCardTcgPrices error:", err);
  }
}

// ---------------------------------------------------------------------------
// Grade Data (refreshed on demand, 24h TTL for cleanup)
// ---------------------------------------------------------------------------

export async function getCardGradeData(
  cardId: string
): Promise<CardGradeData | null> {
  const ctx = getClient();
  if (!ctx) return null;

  try {
    const res = await ctx.client.send(
      new GetCommand({
        TableName: ctx.table,
        Key: { pk: `CARD#${cardId}`, sk: "GRADE_DATA" },
      })
    );
    if (!res.Item) return null;
    return JSON.parse(res.Item.data as string) as CardGradeData;
  } catch (err) {
    console.warn("card-cache getCardGradeData error:", err);
    return null;
  }
}

export async function putCardGradeData(
  cardId: string,
  data: CardGradeData
): Promise<void> {
  const ctx = getClient();
  if (!ctx) return;

  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  try {
    await ctx.client.send(
      new PutCommand({
        TableName: ctx.table,
        Item: {
          pk: `CARD#${cardId}`,
          sk: "GRADE_DATA",
          data: JSON.stringify(data),
          lastGradeFetched: data.lastGradeFetched,
          ttl,
        },
      })
    );
  } catch (err) {
    console.warn("card-cache putCardGradeData error:", err);
  }
}
