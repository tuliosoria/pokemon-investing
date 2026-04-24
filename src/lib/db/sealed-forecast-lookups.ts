import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  buildFeatureSnapshot,
  type ForecastFeatureSnapshot,
} from "@/lib/domain/sealed-forecast-ml";
import { buildSealedForecastLookupKey } from "@/lib/owned-data/dynamo-keys";
import type { Forecast, SealedSetData } from "@/lib/types/sealed";
import { getDynamo, getTableName } from "./dynamo";

export type ForecastLookupSource = "search";

interface ForecastLookupEntry {
  set: SealedSetData;
  forecast: Forecast;
}

function addYears(value: Date, years: number): string {
  const next = new Date(value);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString();
}

function serializeFeatureSnapshot(snapshot: ForecastFeatureSnapshot) {
  return {
    features: snapshot.features,
    estimatedFactors: snapshot.estimatedFactors,
  };
}

export async function logSealedForecastLookups(
  entries: ForecastLookupEntry[],
  source: ForecastLookupSource
): Promise<void> {
  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table || entries.length === 0) {
    return;
  }

  const lookupTimestamp = new Date();
  const createdAt = lookupTimestamp.toISOString();

  await Promise.allSettled(
    entries.map(async ({ set, forecast }, index) => {
      const snapshot = serializeFeatureSnapshot(buildFeatureSnapshot(set));

      await dynamo.send(
        new PutCommand({
          TableName: table,
          Item: {
            ...buildSealedForecastLookupKey(set.id, createdAt, index),
            entityType: "SEALED_FORECAST_LOOKUP",
            source,
            setId: set.id,
            name: set.name,
            productType: set.productType,
            releaseYear: set.releaseYear,
            currentPrice: set.currentPrice,
            pokedataId: set.pokedataId ?? null,
            priceChartingId: set.priceChartingId ?? null,
            createdAt,
            readyForRetraining1yrAt: addYears(lookupTimestamp, 1),
            readyForRetraining3yrAt: addYears(lookupTimestamp, 3),
            readyForRetraining5yrAt: addYears(lookupTimestamp, 5),
            featureSnapshot: snapshot,
            forecastSnapshot: {
              signal: forecast.signal,
              confidence: forecast.confidence,
              projectedValue: forecast.projectedValue,
              roiPercent: forecast.roiPercent,
              predictionSpreadPercent: forecast.predictionSpreadPercent,
              horizonPredictions: forecast.horizonPredictions,
            },
          },
        })
      );
    })
  );
}
