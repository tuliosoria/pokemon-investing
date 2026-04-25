/**
 * Crowd-sourced PSA grade-probability estimates per card.
 *
 * Replaces PokeData population reports as the "is this estimate
 * reasonable?" signal: we store running sums of every user-submitted
 * PSA 10/9/8 probability and surface mean ± std-dev so the calculator
 * can warn outliers (e.g. "you said 50%, the community averages 18%
 * across 42 estimates").
 *
 * DynamoDB key: CARD#<cardId> / USER_GRADES
 */

import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTableName } from "./dynamo";

export interface UserGradeStats {
  cardId: string;
  count: number;
  psa10: { mean: number; std: number };
  psa9: { mean: number; std: number };
  psa8: { mean: number; std: number };
  lastSubmittedAt: string | null;
}

export interface UserGradeSubmission {
  cardId: string;
  psa10Pct: number;
  psa9Pct: number;
  psa8Pct: number;
}

interface RawAggregate {
  count?: number;
  psa10Sum?: number;
  psa10SqSum?: number;
  psa9Sum?: number;
  psa9SqSum?: number;
  psa8Sum?: number;
  psa8SqSum?: number;
  lastSubmittedAt?: string;
}

function getCtx() {
  const client = getDynamo();
  const table = getTableName();
  if (!client || !table) return null;
  return { client, table };
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function moments(sum: number, sqSum: number, count: number) {
  if (count <= 0) return { mean: 0, std: 0 };
  const mean = sum / count;
  const variance = Math.max(0, sqSum / count - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

export async function recordUserGradeSubmission(
  submission: UserGradeSubmission
): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;

  const psa10 = clampPct(submission.psa10Pct);
  const psa9 = clampPct(submission.psa9Pct);
  const psa8 = clampPct(submission.psa8Pct);

  try {
    await ctx.client.send(
      new UpdateCommand({
        TableName: ctx.table,
        Key: { pk: `CARD#${submission.cardId}`, sk: "USER_GRADES" },
        UpdateExpression: `
          ADD #count :one,
              psa10Sum :p10, psa10SqSum :p10sq,
              psa9Sum :p9, psa9SqSum :p9sq,
              psa8Sum :p8, psa8SqSum :p8sq
          SET lastSubmittedAt = :now
        `,
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":p10": psa10,
          ":p10sq": psa10 * psa10,
          ":p9": psa9,
          ":p9sq": psa9 * psa9,
          ":p8": psa8,
          ":p8sq": psa8 * psa8,
          ":now": new Date().toISOString(),
        },
      })
    );
  } catch (err) {
    console.warn("user-grades record error:", err);
  }
}

export async function getUserGradeStats(
  cardId: string
): Promise<UserGradeStats | null> {
  const ctx = getCtx();
  if (!ctx) return null;

  try {
    const res = await ctx.client.send(
      new GetCommand({
        TableName: ctx.table,
        Key: { pk: `CARD#${cardId}`, sk: "USER_GRADES" },
      })
    );
    if (!res.Item) {
      return {
        cardId,
        count: 0,
        psa10: { mean: 0, std: 0 },
        psa9: { mean: 0, std: 0 },
        psa8: { mean: 0, std: 0 },
        lastSubmittedAt: null,
      };
    }
    const item = res.Item as RawAggregate;
    const count = Number(item.count ?? 0);
    return {
      cardId,
      count,
      psa10: moments(Number(item.psa10Sum ?? 0), Number(item.psa10SqSum ?? 0), count),
      psa9: moments(Number(item.psa9Sum ?? 0), Number(item.psa9SqSum ?? 0), count),
      psa8: moments(Number(item.psa8Sum ?? 0), Number(item.psa8SqSum ?? 0), count),
      lastSubmittedAt: (item.lastSubmittedAt as string) ?? null,
    };
  } catch (err) {
    console.warn("user-grades read error:", err);
    return null;
  }
}
