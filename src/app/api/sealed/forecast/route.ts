import { NextRequest, NextResponse } from "next/server";
import { computeForecastWithModels } from "@/lib/domain/sealed-forecast-ml";
import { getSealedForecastModels } from "@/lib/db/sealed-forecast-models";
import {
  logSealedForecastLookups,
  type ForecastLookupSource,
} from "@/lib/db/sealed-forecast-lookups";
import type { SealedSetData } from "@/lib/types/sealed";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as { sets?: SealedSetData[]; lookupSource?: ForecastLookupSource };
  const sets = payload?.sets;
  if (!Array.isArray(sets)) {
    return NextResponse.json({ error: "Body must include a sets array" }, { status: 400 });
  }

  const models = await getSealedForecastModels();
  const results = sets.flatMap((set) => {
    if (!set || typeof set !== "object" || typeof set.id !== "string") {
      return [];
    }

    return [{ set, forecast: computeForecastWithModels(set, models) }];
  });

  if (payload.lookupSource === "search") {
    await logSealedForecastLookups(results, payload.lookupSource);
  }

  return NextResponse.json({ results });
}
