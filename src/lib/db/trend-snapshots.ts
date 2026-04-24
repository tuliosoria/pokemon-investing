import "server-only";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  buildTrendLatestKey,
  buildTrendSnapshotKey,
  normalizeTrendKeyword,
} from "@/lib/owned-data/dynamo-keys";
import { getDynamo, getTableName } from "./dynamo";

export interface StoredTrendSnapshot {
  keyword: string;
  current: number;
  average: number;
  trendDirection: "rising" | "stable" | "declining";
  popularityScore: number;
  capturedAt: string;
  source: "google-trends-api" | "neutral-fallback";
}

export { normalizeTrendKeyword };

export function isStoredTrendFresh(
  capturedAt: string | null | undefined,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000
): boolean {
  if (!capturedAt) {
    return false;
  }

  const capturedMs = new Date(capturedAt).getTime();
  if (!Number.isFinite(capturedMs)) {
    return false;
  }

  return Date.now() - capturedMs <= maxAgeMs;
}

export async function getStoredTrendSnapshot(
  keyword: string
): Promise<StoredTrendSnapshot | null> {
  const client = getDynamo();
  const table = getTableName();
  if (!client || !table) {
    return null;
  }

  try {
    const result = await client.send(
      new GetCommand({
        TableName: table,
        Key: buildTrendLatestKey(keyword),
      })
    );

    return (result.Item as StoredTrendSnapshot | undefined) ?? null;
  } catch (error) {
    console.warn("DynamoDB trend snapshot lookup failed:", error);
    return null;
  }
}

export async function putStoredTrendSnapshot(
  snapshot: StoredTrendSnapshot
): Promise<void> {
  const client = getDynamo();
  const table = getTableName();
  if (!client || !table) {
    return;
  }

  const normalizedKeyword = normalizeTrendKeyword(snapshot.keyword);
  const snapshotDate = snapshot.capturedAt.slice(0, 10);
  const baseItem = {
    keyword: snapshot.keyword,
    current: snapshot.current,
    average: snapshot.average,
    trendDirection: snapshot.trendDirection,
    popularityScore: snapshot.popularityScore,
    capturedAt: snapshot.capturedAt,
    source: snapshot.source,
  };

  try {
    await Promise.all([
      client.send(
        new PutCommand({
          TableName: table,
          Item: {
            ...buildTrendLatestKey(normalizedKeyword),
            ...baseItem,
          },
        })
      ),
      client.send(
        new PutCommand({
          TableName: table,
          Item: {
            ...buildTrendSnapshotKey(normalizedKeyword, snapshotDate),
            ...baseItem,
          },
        })
      ),
    ]);
  } catch (error) {
    console.warn("DynamoDB trend snapshot write failed:", error);
  }
}
